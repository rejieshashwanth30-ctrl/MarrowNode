import dagre from '@dagrejs/dagre';
import { Position } from '@xyflow/react';
import type { ArchitectureNode, ArchitectureEdge, FileTreeNode } from '@/types';

export interface NormalizedGraphNode {
  id: string;
  name: string;
  label: string;
  path: string;
  type: 'App' | 'Entrypoint' | 'Module' | 'API' | 'Database' | 'Services' | 'Components' | 'Subsystem' | 'File' | 'Auth' | 'External APIs' | string;
  category: string;
  description: string;
  filesCount: number;
  loc: number;
  fanIn: number;
  fanOut: number;
  isEntryPoint: boolean;
  isCycle: boolean;
  isIsolated: boolean;
  dependencies: string[];
  dependents: string[];
  relatedFiles: string[];
  hasDrillDown: boolean;
  health: 'stable' | 'active' | 'legacy';
  evidence?: string;
}

export interface NormalizedGraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: 'imports' | 're-exports' | 'uses' | 'calls' | 'type-only';
  confidence: number;
  evidence?: string;
  symbols?: string[];
  isCycle?: boolean;
  isIndirect?: boolean;
  sourcePath?: string;
  targetPath?: string;
  sourceLine?: number;
  connectionCount?: number;
}

export interface ArchitectureGraphModelResult {
  nodes: NormalizedGraphNode[];
  edges: NormalizedGraphEdge[];
  levelTitle: string;
  levelBreadcrumb: Array<{ label: string; path: string }>;
  isDrillDown: boolean;
  parentPath?: string;
  totalSubsystems: number;
  totalConnections: number;
  cyclesDetectedCount: number;
}

/**
 * Builds a normalized, deterministic architecture graph model from real repository evidence.
 * Supports both Level 1 (Project Topology) and Level 2 (Subsystem Drill-Down).
 */
export function buildArchitectureGraphModel(params: {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  dependencyEdges?: any[];
  cycles?: string[][];
  fileTree?: FileTreeNode[];
  activeLevel?: string;
  hideIsolated?: boolean;
  searchFilter?: string;
}): ArchitectureGraphModelResult {
  const {
    nodes = [],
    edges = [],
    dependencyEdges = [],
    cycles = [],
    fileTree = [],
    activeLevel = 'root',
    hideIsolated = false,
    searchFilter = '',
  } = params;

  const isDrillDown = activeLevel !== 'root' && Boolean(activeLevel);

  if (isDrillDown) {
    return buildDrillDownGraphModel({
      activePath: activeLevel,
      dependencyEdges,
      cycles,
      fileTree,
      searchFilter,
      hideIsolated,
    });
  }

  return buildProjectLevelGraphModel({
    nodes,
    edges,
    dependencyEdges,
    cycles,
    fileTree,
    searchFilter,
    hideIsolated,
  });
}

/**
 * Level 1: System Topology / Project Level
 */
function buildProjectLevelGraphModel(params: {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  dependencyEdges: any[];
  cycles: string[][];
  fileTree: FileTreeNode[];
  searchFilter?: string;
  hideIsolated?: boolean;
}): ArchitectureGraphModelResult {
  const { nodes, edges, dependencyEdges, cycles, fileTree, searchFilter, hideIsolated } = params;

  // Flatten all file paths from fileTree to accurately determine file counts and drill-down support
  const allTreePaths: string[] = [];
  const walkTree = (items: FileTreeNode[]) => {
    for (const item of items) {
      if (item.type === 'file') allTreePaths.push(item.path);
      if (item.children) walkTree(item.children);
    }
  };
  walkTree(fileTree);

  // 1. Build map of cycle node IDs
  const cycleModuleSet = new Set<string>();
  for (const cycle of cycles) {
    for (const filePath of cycle) {
      const mod = filePath.includes('/') ? filePath.split('/')[0] : 'root';
      cycleModuleSet.add(mod === 'root' ? 'node-app' : `node-${mod}`);
    }
  }

  // 2. Derive real cross-module edges if edges are empty or only default
  const derivedEdges: NormalizedGraphEdge[] = [];
  const edgeKeyMap = new Map<string, NormalizedGraphEdge>();

  // Use explicit edges if available
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (!edgeKeyMap.has(key) && e.source !== e.target) {
      const edgeObj: NormalizedGraphEdge = {
        id: e.id || `edge-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        relationship: (e.relationship as any) || 'imports',
        confidence: e.confidence ?? 1.0,
        isIndirect: Boolean(e.isIndirect),
        connectionCount: 1,
      };
      edgeKeyMap.set(key, edgeObj);
    }
  }

  // Enhance/complete with real dependency edges from AST parser
  for (const dep of dependencyEdges) {
    const srcMod = dep.source.includes('/') ? dep.source.split('/')[0] : 'root';
    const tgtMod = dep.target.includes('/') ? dep.target.split('/')[0] : 'root';
    if (srcMod !== tgtMod) {
      const srcId = srcMod === 'root' ? 'node-app' : `node-${srcMod}`;
      const tgtId = tgtMod === 'root' ? 'node-app' : `node-${tgtMod}`;
      const key = `${srcId}->${tgtId}`;

      const existing = edgeKeyMap.get(key);
      if (existing) {
        existing.connectionCount = (existing.connectionCount || 1) + 1;
        if (!existing.evidence && dep.source) {
          existing.evidence = `${dep.source}:${dep.line || 1} imports ${dep.target}`;
        }
      } else {
        const isCycleEdge = cycles.some((c) =>
          c.some((p) => p.startsWith(`${srcMod}/`) || (srcMod === 'root' && !p.includes('/'))) &&
          c.some((p) => p.startsWith(`${tgtMod}/`) || (tgtMod === 'root' && !p.includes('/')))
        );

        edgeKeyMap.set(key, {
          id: `edge-${srcMod}-${tgtMod}`,
          source: srcId,
          target: tgtId,
          relationship: dep.relationship || 'imports',
          confidence: dep.confidence ?? 1.0,
          evidence: `${dep.source}:${dep.line || 1} imports ${dep.target}`,
          symbols: dep.symbols,
          isCycle: isCycleEdge,
          connectionCount: 1,
        });
      }
    }
  }

  // 3. Compute accurate fanIn and fanOut per node
  const fanInMap = new Map<string, number>();
  const fanOutMap = new Map<string, number>();
  const dependenciesMap = new Map<string, Set<string>>();
  const dependentsMap = new Map<string, Set<string>>();

  for (const edge of Array.from(edgeKeyMap.values())) {
    fanOutMap.set(edge.source, (fanOutMap.get(edge.source) || 0) + 1);
    fanInMap.set(edge.target, (fanInMap.get(edge.target) || 0) + 1);

    if (!dependenciesMap.has(edge.source)) dependenciesMap.set(edge.source, new Set());
    dependenciesMap.get(edge.source)!.add(edge.target);

    if (!dependentsMap.has(edge.target)) dependentsMap.set(edge.target, new Set());
    dependentsMap.get(edge.target)!.add(edge.source);
  }

  // 4. Normalize Nodes
  const normalizedNodes: NormalizedGraphNode[] = nodes.map((node) => {
    const rawPath = node.id === 'node-app' ? '/' : node.id.replace(/^node-/, '');
    const cleanModName = node.id === 'node-app' ? 'root' : node.id.replace(/^node-/, '');

    // Count files under this module
    const matchingFiles = allTreePaths.filter((p) =>
      cleanModName === 'root' ? !p.includes('/') : p.startsWith(`${cleanModName}/`)
    );
    const filesCount = matchingFiles.length > 0 ? matchingFiles.length : (node.filesCount || 1);

    const fanIn = fanInMap.get(node.id) || 0;
    const fanOut = fanOutMap.get(node.id) || 0;
    const isIsolated = fanIn === 0 && fanOut === 0;
    const isEntryPoint = node.category === 'Entrypoint' || node.type === 'App';
    const isCycle = cycleModuleSet.has(node.id);

    // Can user drill down into this node? Yes if it has sub-paths or multiple files
    const subPaths = new Set(
      matchingFiles.map((p) => {
        const parts = p.split('/');
        return parts.length > 2 ? parts[1] : parts.slice(0, 2).join('/');
      })
    );
    const hasDrillDown = subPaths.size > 1 || matchingFiles.length > 3;

    const depsList = Array.from(dependenciesMap.get(node.id) || []).map((id) => {
      const tgt = nodes.find((n) => n.id === id);
      return tgt ? tgt.name : id.replace(/^node-/, '');
    });

    const dependentsList = Array.from(dependentsMap.get(node.id) || []).map((id) => {
      const src = nodes.find((n) => n.id === id);
      return src ? src.name : id.replace(/^node-/, '');
    });

    return {
      id: node.id,
      name: node.name,
      label: node.name,
      path: rawPath === '/' ? 'Project Root' : rawPath,
      type: node.type || (isEntryPoint ? 'App' : 'Module'),
      category: isEntryPoint ? 'Entrypoint' : isIsolated ? 'Standalone' : 'Module',
      description: node.description || `Module area /${rawPath}`,
      filesCount,
      loc: node.metrics?.loc || filesCount * 45,
      fanIn,
      fanOut,
      isEntryPoint,
      isCycle,
      isIsolated,
      dependencies: depsList,
      dependents: dependentsList,
      relatedFiles: node.relatedFiles && node.relatedFiles.length > 0 ? node.relatedFiles : matchingFiles.slice(0, 6),
      hasDrillDown,
      health: node.health || 'stable',
    };
  });

  // Filter nodes & edges if requested
  let filteredNodes = normalizedNodes;
  if (hideIsolated) {
    filteredNodes = filteredNodes.filter((n) => !n.isIsolated || n.isEntryPoint);
  }

  if (searchFilter && searchFilter.trim()) {
    const q = searchFilter.trim().toLowerCase();
    filteredNodes = filteredNodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.path.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q)
    );
  }

  const validNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = Array.from(edgeKeyMap.values()).filter(
    (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
  );

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    levelTitle: 'Project Architecture',
    levelBreadcrumb: [{ label: 'Project Architecture', path: 'root' }],
    isDrillDown: false,
    totalSubsystems: filteredNodes.length,
    totalConnections: filteredEdges.length,
    cyclesDetectedCount: cycles.length,
  };
}

/**
 * Level 2: Subsystem & Module Drill-Down
 */
function buildDrillDownGraphModel(params: {
  activePath: string;
  dependencyEdges: any[];
  cycles: string[][];
  fileTree: FileTreeNode[];
  searchFilter?: string;
  hideIsolated?: boolean;
}): ArchitectureGraphModelResult {
  const { activePath, dependencyEdges, cycles, fileTree, searchFilter, hideIsolated } = params;

  // Flatten all files under activePath
  const allPaths: string[] = [];
  const walkTree = (items: FileTreeNode[]) => {
    for (const item of items) {
      if (item.type === 'file' && item.path.startsWith(`${activePath}/`)) {
        allPaths.push(item.path);
      }
      if (item.children) walkTree(item.children);
    }
  };
  walkTree(fileTree);

  // Group files into immediate sub-areas under activePath
  const subAreaMap = new Map<string, { files: string[]; loc: number }>();
  for (const filePath of allPaths) {
    const relative = filePath.slice(activePath.length + 1);
    const subName = relative.includes('/') ? relative.split('/')[0] : relative;
    const fullSubPath = `${activePath}/${subName}`;

    if (!subAreaMap.has(fullSubPath)) {
      subAreaMap.set(fullSubPath, { files: [], loc: 0 });
    }
    subAreaMap.get(fullSubPath)!.files.push(filePath);
  }

  // Derive sub-area directional edges from real dependencyEdges
  const edgeKeyMap = new Map<string, NormalizedGraphEdge>();

  for (const dep of dependencyEdges) {
    const isSrcIn = dep.source.startsWith(`${activePath}/`);
    const isTgtIn = dep.target.startsWith(`${activePath}/`);

    if (isSrcIn || isTgtIn) {
      const getSubPath = (path: string) => {
        if (!path.startsWith(`${activePath}/`)) {
          // Out-of-module connection
          return path.includes('/') ? path.split('/')[0] : path;
        }
        const rel = path.slice(activePath.length + 1);
        const sub = rel.includes('/') ? rel.split('/')[0] : rel;
        return `${activePath}/${sub}`;
      };

      const srcSub = getSubPath(dep.source);
      const tgtSub = getSubPath(dep.target);

      // We only draw edges between distinct sub-areas
      if (srcSub !== tgtSub && (srcSub.startsWith(activePath) || tgtSub.startsWith(activePath))) {
        // Ensure both sub-areas are registered in subAreaMap if inside module
        if (srcSub.startsWith(activePath) && !subAreaMap.has(srcSub)) {
          subAreaMap.set(srcSub, { files: [dep.source], loc: 0 });
        }
        if (tgtSub.startsWith(activePath) && !subAreaMap.has(tgtSub)) {
          subAreaMap.set(tgtSub, { files: [dep.target], loc: 0 });
        }

        const srcNodeId = `node-sub-${srcSub.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const tgtNodeId = `node-sub-${tgtSub.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const key = `${srcNodeId}->${tgtNodeId}`;

        const isCycleEdge = cycles.some((c) =>
          c.some((p) => p.startsWith(srcSub)) && c.some((p) => p.startsWith(tgtSub))
        );

        const existing = edgeKeyMap.get(key);
        if (existing) {
          existing.connectionCount = (existing.connectionCount || 1) + 1;
        } else {
          edgeKeyMap.set(key, {
            id: `edge-${srcNodeId}-${tgtNodeId}`,
            source: srcNodeId,
            target: tgtNodeId,
            relationship: dep.relationship || 'imports',
            confidence: dep.confidence ?? 1.0,
            evidence: `${dep.source}:${dep.line || 1} imports ${dep.target}`,
            symbols: dep.symbols,
            isCycle: isCycleEdge,
            sourcePath: dep.source,
            targetPath: dep.target,
            sourceLine: dep.line,
            connectionCount: 1,
          });
        }
      }
    }
  }

  // Compute Fan-in & Fan-out
  const fanInMap = new Map<string, number>();
  const fanOutMap = new Map<string, number>();
  const depsMap = new Map<string, Set<string>>();
  const dependentsMap = new Map<string, Set<string>>();

  for (const edge of Array.from(edgeKeyMap.values())) {
    fanOutMap.set(edge.source, (fanOutMap.get(edge.source) || 0) + 1);
    fanInMap.set(edge.target, (fanInMap.get(edge.target) || 0) + 1);

    if (!depsMap.has(edge.source)) depsMap.set(edge.source, new Set());
    depsMap.get(edge.source)!.add(edge.target);

    if (!dependentsMap.has(edge.target)) dependentsMap.set(edge.target, new Set());
    dependentsMap.get(edge.target)!.add(edge.source);
  }

  // Build Normalized Sub-Nodes
  const normalizedNodes: NormalizedGraphNode[] = Array.from(subAreaMap.entries()).map(
    ([fullSubPath, data]) => {
      const nodeId = `node-sub-${fullSubPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const subName = fullSubPath.slice(activePath.length + 1) || fullSubPath;
      const lower = subName.toLowerCase();

      const isApi = lower.includes('api') || lower.includes('route') || lower.includes('server');
      const isDb = lower.includes('db') || lower.includes('prisma') || lower.includes('model');
      const isUi = lower.includes('component') || lower.includes('ui') || lower.includes('view');
      const isFile = !subName.includes('/') && subName.includes('.');

      const nodeType = isApi
        ? 'API'
        : isDb
        ? 'Database'
        : isUi
        ? 'Components'
        : isFile
        ? 'File'
        : 'Subsystem';

      const fanIn = fanInMap.get(nodeId) || 0;
      const fanOut = fanOutMap.get(nodeId) || 0;
      const isIsolated = fanIn === 0 && fanOut === 0;

      const isCycle = cycles.some((c) => c.some((p) => p.startsWith(fullSubPath)));
      const filesCount = data.files.length;

      return {
        id: nodeId,
        name: subName,
        label: subName,
        path: fullSubPath,
        type: nodeType,
        category: isFile ? 'File' : 'Subsystem',
        description: isFile ? `Source file /${fullSubPath}` : `Sub-area /${fullSubPath} (${filesCount} files)`,
        filesCount,
        loc: filesCount * 45,
        fanIn,
        fanOut,
        isEntryPoint: lower === 'app' || lower === 'index' || lower === 'main',
        isCycle,
        isIsolated,
        dependencies: Array.from(depsMap.get(nodeId) || []).map((id) =>
          id.replace(/^node-sub-/, '').replace(/_/g, '/')
        ),
        dependents: Array.from(dependentsMap.get(nodeId) || []).map((id) =>
          id.replace(/^node-sub-/, '').replace(/_/g, '/')
        ),
        relatedFiles: data.files.slice(0, 6),
        hasDrillDown: false,
        health: 'stable',
      };
    }
  );

  let filteredNodes = normalizedNodes;
  if (hideIsolated) {
    filteredNodes = filteredNodes.filter((n) => !n.isIsolated || n.isEntryPoint);
  }

  if (searchFilter && searchFilter.trim()) {
    const q = searchFilter.trim().toLowerCase();
    filteredNodes = filteredNodes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
    );
  }

  const validIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = Array.from(edgeKeyMap.values()).filter(
    (e) => validIds.has(e.source) && validIds.has(e.target)
  );

  // Compute breadcrumb
  const parts = activePath.split('/');
  const breadcrumb = [{ label: 'Project Architecture', path: 'root' }];
  let running = '';
  for (const part of parts) {
    running = running ? `${running}/${part}` : part;
    breadcrumb.push({ label: part, path: running });
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    levelTitle: `Subsystems in /${activePath}`,
    levelBreadcrumb: breadcrumb,
    isDrillDown: true,
    parentPath: parts.length > 1 ? parts.slice(0, -1).join('/') : 'root',
    totalSubsystems: filteredNodes.length,
    totalConnections: filteredEdges.length,
    cyclesDetectedCount: cycles.filter((c) => c.some((p) => p.startsWith(activePath))).length,
  };
}

/**
 * Computes deterministic, layered hierarchical coordinates for nodes and edges using Dagre.
 */
export function computeDagreLayout(
  nodes: NormalizedGraphNode[],
  edges: NormalizedGraphEdge[],
  options: {
    direction?: 'TB' | 'LR';
    nodeWidth?: number;
    nodeHeight?: number;
  } = {}
) {
  const { direction = 'TB', nodeWidth = 220, nodeHeight = 88 } = options;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 75,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const isTb = direction === 'TB';

  const layoutNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id) || { x: 0, y: 0 };
    return {
      id: node.id,
      type: 'architectureNode' as const,
      targetPosition: isTb ? Position.Top : Position.Left,
      sourcePosition: isTb ? Position.Bottom : Position.Right,
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
      data: {
        ...node,
        direction,
        targetPosition: isTb ? Position.Top : Position.Left,
        sourcePosition: isTb ? Position.Bottom : Position.Right,
      },
    };
  });

  const layoutEdges = edges.map((edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: edge.isCycle,
      data: edge,
    };
  });

  return { layoutNodes, layoutEdges };
}
