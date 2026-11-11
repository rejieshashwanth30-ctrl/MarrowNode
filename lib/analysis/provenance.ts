/**
 * MarrowNode Evidence Provenance Tracking Engine
 * Provides mathematical provenance and traceability for every displayed analysis result.
 * 
 * Guarantees every fact, module edge, and metric is rooted in:
 * 1. RAW EVIDENCE (GitHub API response, repository blob, Git commit, package manifest)
 * 2. DETERMINISTIC DERIVED DATA (AST parser output, dependency graph calculation)
 * 3. AI INTERPRETATION (explicitly flagged inference)
 */

export type ProvenanceSourceType =
  | 'github_file'
  | 'github_commit'
  | 'ast'
  | 'dependency_manifest'
  | 'graph'
  | 'ai';

export interface EvidenceProvenance {
  sourceType: ProvenanceSourceType;
  repository: string;
  path: string;
  lineStart?: number;
  lineEnd?: number;
  commitSha?: string;
  analysisId: string;
  confidence: 'Deterministic' | 'Inferred';
  description?: string;
}

/**
 * Creates provenance metadata for a repository file discovered in the Git tree.
 */
export function createFileProvenance(params: {
  repository: string;
  path: string;
  commitSha?: string;
  analysisId: string;
  fileSize?: number;
}): EvidenceProvenance {
  return {
    sourceType: 'github_file',
    repository: params.repository,
    path: params.path,
    commitSha: params.commitSha,
    analysisId: params.analysisId,
    confidence: 'Deterministic',
    description: `Discovered from repository tree blob at commit ${params.commitSha?.substring(0, 7) || 'HEAD'}${params.fileSize ? ` (${params.fileSize} bytes)` : ''}`,
  };
}

/**
 * Creates provenance metadata for an AST-extracted import, export, or declaration.
 */
export function createASTProvenance(params: {
  repository: string;
  path: string;
  lineStart: number;
  lineEnd?: number;
  commitSha?: string;
  analysisId: string;
  symbolOrImport: string;
}): EvidenceProvenance {
  return {
    sourceType: 'ast',
    repository: params.repository,
    path: params.path,
    lineStart: params.lineStart,
    lineEnd: params.lineEnd || params.lineStart,
    commitSha: params.commitSha,
    analysisId: params.analysisId,
    confidence: 'Deterministic',
    description: `Extracted via TypeScript compiler AST parser from ${params.path}:${params.lineStart} (${params.symbolOrImport})`,
  };
}

/**
 * Creates provenance metadata for an inter-module or file-to-file dependency edge.
 */
export function createGraphProvenance(params: {
  repository: string;
  source: string;
  target: string;
  line: number;
  commitSha?: string;
  analysisId: string;
}): EvidenceProvenance {
  return {
    sourceType: 'graph',
    repository: params.repository,
    path: params.source,
    lineStart: params.line,
    commitSha: params.commitSha,
    analysisId: params.analysisId,
    confidence: 'Deterministic',
    description: `Dependency graph link resolved from ${params.source}:${params.line} -> ${params.target}`,
  };
}

/**
 * Creates provenance metadata for an ecosystem package manifest.
 */
export function createManifestProvenance(params: {
  repository: string;
  manifestPath: string;
  commitSha?: string;
  analysisId: string;
  dependenciesCount: number;
}): EvidenceProvenance {
  return {
    sourceType: 'dependency_manifest',
    repository: params.repository,
    path: params.manifestPath,
    commitSha: params.commitSha,
    analysisId: params.analysisId,
    confidence: 'Deterministic',
    description: `Parsed ecosystem manifest (${params.manifestPath}) identifying ${params.dependenciesCount} libraries`,
  };
}

/**
 * Creates provenance metadata for a Git history commit event.
 */
export function createCommitProvenance(params: {
  repository: string;
  commitSha: string;
  analysisId: string;
  author: string;
  date?: string;
}): EvidenceProvenance {
  return {
    sourceType: 'github_commit',
    repository: params.repository,
    path: `commit/${params.commitSha.substring(0, 7)}`,
    commitSha: params.commitSha,
    analysisId: params.analysisId,
    confidence: 'Deterministic',
    description: `Git history commit authored by ${params.author}${params.date ? ` on ${params.date}` : ''}`,
  };
}

/**
 * Creates provenance metadata for an AI-derived explanation or inference.
 */
export function createAIProvenance(params: {
  repository: string;
  topic: string;
  analysisId: string;
  citations: string[];
}): EvidenceProvenance {
  return {
    sourceType: 'ai',
    repository: params.repository,
    path: params.citations[0] || 'repository',
    analysisId: params.analysisId,
    confidence: 'Inferred',
    description: `AI inference synthesized from evidence citations: [${params.citations.join(', ')}]`,
  };
}
