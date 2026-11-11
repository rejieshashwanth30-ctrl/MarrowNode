export const BLAST_THRESHOLDS = {
  isolated: 0,
  lowMax: 3,
  moderateMax: 8,
  highMax: 15,
} as const;

export interface DependencyEdge {
  id: string;
  source: string; // The file importing (consumer)
  target: string; // The file being imported (provider)
  line: number;
  symbols?: string[];
  relationship?: string;
  confidence?: number;
  provenance?: any;
}

export interface BlastRadiusResult {
  target: string;
  changeType: 'interface' | 'refactor' | 'delete';
  blastRating: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'ISOLATED';
  confidenceScore: number;
  directConsumersCount: number;
  transitiveConsumersCount: number;
  totalAffectedCount: number;
  directConsumers: Array<{
    path: string;
    line: number;
    symbols?: string[];
    relationship: string;
  }>;
  transitiveConsumers: Array<{
    path: string;
    via: string;
  }>;
  isCoreSubsystem: boolean;
  cycles: string[][];
}

export class DependencyGraphEngine {
  private edges: DependencyEdge[];
  // Map target (provider) -> list of edges where it is imported
  private dependentsMap: Map<string, DependencyEdge[]> = new Map();
  // Map source (consumer) -> list of edges where it imports others
  private dependenciesMap: Map<string, DependencyEdge[]> = new Map();

  constructor(edges: DependencyEdge[]) {
    this.edges = edges;
    this.buildIndices();
  }

  private buildIndices() {
    this.dependentsMap.clear();
    this.dependenciesMap.clear();

    for (const edge of this.edges) {
      // Index by target (who imports this target?)
      if (!this.dependentsMap.has(edge.target)) {
        this.dependentsMap.set(edge.target, []);
      }
      this.dependentsMap.get(edge.target)!.push(edge);

      // Index by source (who does this source import?)
      if (!this.dependenciesMap.has(edge.source)) {
        this.dependenciesMap.set(edge.source, []);
      }
      this.dependenciesMap.get(edge.source)!.push(edge);
    }
  }

  /**
   * Find cycles in the dependency graph using DFS with recursion stack.
   */
  public detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    // Get all unique nodes
    const allNodes = new Set<string>();
    for (const edge of this.edges) {
      allNodes.add(edge.source);
      allNodes.add(edge.target);
    }

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const outgoing = this.dependenciesMap.get(node) || [];
      for (const edge of outgoing) {
        const neighbor = edge.target;
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Found cycle
          const cycleStartIndex = path.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            cycles.push([...path.slice(cycleStartIndex), neighbor]);
          }
        }
      }

      path.pop();
      recStack.delete(node);
    };

    for (const node of Array.from(allNodes)) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Resolves whether a given target matches a file or a module folder.
   */
  private matchesTarget(path: string, target: string): boolean {
    if (path === target) return true;
    const cleanTarget = target.replace(/^\/+|\/+$/g, '');
    if (path.startsWith(`${cleanTarget}/`)) return true;
    if (path.startsWith(`src/${cleanTarget}/`)) return true;
    return false;
  }

  /**
   * Deterministically calculates the blast radius of a change to a target file or module.
   */
  public calculateBlastRadius(
    target: string,
    changeType: 'interface' | 'refactor' | 'delete' = 'interface'
  ): BlastRadiusResult {
    const isCoreSubsystem =
      target.includes('prisma') ||
      target.includes('db') ||
      target.includes('auth') ||
      target.includes('client') ||
      target === 'app' ||
      target === 'lib';

    // 1. Identify Direct Consumers (incoming edges where target is imported)
    const directConsumersMap = new Map<
      string,
      { path: string; line: number; symbols?: string[]; relationship: string }
    >();

    for (const edge of this.edges) {
      if (this.matchesTarget(edge.target, target) && !this.matchesTarget(edge.source, target)) {
        if (!directConsumersMap.has(edge.source)) {
          const symStr = edge.symbols?.length ? ` (${edge.symbols.join(', ')})` : '';
          directConsumersMap.set(edge.source, {
            path: edge.source,
            line: edge.line,
            symbols: edge.symbols,
            relationship: `Imports ${edge.target}:${edge.line}${symStr}`,
          });
        }
      }
    }

    const directConsumers = Array.from(directConsumersMap.values());

    // 2. Transitive Consumers via BFS
    const visited = new Set<string>(directConsumers.map((c) => c.path));
    const transitiveConsumers: Array<{ path: string; via: string }> = [];
    const queue: Array<{ path: string; via: string }> = directConsumers.map((c) => ({
      path: c.path,
      via: c.path,
    }));

    while (queue.length > 0) {
      const current = queue.shift()!;
      const callers = this.dependentsMap.get(current.path) || [];

      for (const callerEdge of callers) {
        if (!visited.has(callerEdge.source) && !this.matchesTarget(callerEdge.source, target)) {
          visited.add(callerEdge.source);
          transitiveConsumers.push({
            path: callerEdge.source,
            via: current.path,
          });
          queue.push({
            path: callerEdge.source,
            via: current.path,
          });
        }
      }
    }

    // 3. Find cycles that touch this target
    const allCycles = this.detectCycles();
    const targetCycles = allCycles.filter((cycle) =>
      cycle.some((node) => this.matchesTarget(node, target))
    );

    // 4. Mathematical Blast Rating Calculation
    const directCount = directConsumers.length;
    const transitiveCount = transitiveConsumers.length;
    const totalAffected = directCount + transitiveCount;

    let blastRating: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'ISOLATED' = 'ISOLATED';

    // Zero downstream consumers is strictly ISOLATED under all circumstances
    if (totalAffected === 0) {
      blastRating = 'ISOLATED';
    } else if (changeType === 'delete') {
      blastRating = totalAffected > BLAST_THRESHOLDS.moderateMax ? 'CRITICAL' : 'HIGH';
    } else if (changeType === 'interface') {
      if (targetCycles.length > 0 || totalAffected > BLAST_THRESHOLDS.highMax) {
        blastRating = 'CRITICAL';
      } else if (
        totalAffected > BLAST_THRESHOLDS.moderateMax ||
        (isCoreSubsystem && totalAffected > BLAST_THRESHOLDS.lowMax)
      ) {
        blastRating = 'HIGH';
      } else if (totalAffected > BLAST_THRESHOLDS.lowMax || isCoreSubsystem) {
        blastRating = 'MODERATE';
      } else {
        blastRating = 'LOW';
      }
    } else {
      // 'refactor'
      if (totalAffected > BLAST_THRESHOLDS.highMax) {
        blastRating = 'HIGH';
      } else if (totalAffected > BLAST_THRESHOLDS.moderateMax) {
        blastRating = 'MODERATE';
      } else {
        blastRating = 'LOW';
      }
    }

    return {
      target,
      changeType,
      blastRating,
      confidenceScore: 100, // 100% deterministic graph evaluation
      directConsumersCount: directCount,
      transitiveConsumersCount: transitiveCount,
      totalAffectedCount: totalAffected,
      directConsumers,
      transitiveConsumers,
      isCoreSubsystem,
      cycles: targetCycles,
    };
  }
}
