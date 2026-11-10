// Types and Interfaces for MarrowNode Developer Intelligence Platform

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string;
  role: string;
  githubAccount: string;
}

export interface RepositorySummary {
  id: string;
  name: string;
  owner: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  lastUpdated: string;
  isPrivate: boolean;
  defaultBranch: string;
  analyzed: boolean;
}

export interface AnalysisCoverage {
  files: {
    discovered: number;
    source: number;
    parsed: number;
    failed: number;
    ignored: number;
    coveragePercent: number;
  };
  architecture: {
    modulesDetected: number;
    modulesMapped: number;
    unresolvedModules: number;
    coveragePercent: number;
    detectedModuleNames: string[];
    unresolvedModuleNames: string[];
  };
  imports: {
    total: number;
    resolved: number;
    unresolved: number;
    external: number;
    resolutionPercent: number;
  };
  dependencies: {
    manifestsDetected: number;
    manifestsParsed: number;
    manifestParsingPercent: number;
    declaredDependencies: number;
    resolvedDependencies: number;
    unresolvedDependencies: number;
    usageResolutionPercent: number;
  };
  git: {
    commitsDiscovered: number;
    commitsIndexed: number;
    coveragePercent: number;
    historyScope: string;
  };
  documentation: {
    filesDetected: number;
    filesIndexed: number;
    docTypes: string[];
    hasReadme: boolean;
  };
  overallCoveragePercent: number;

  // Compatibility aliases for existing UI bindings
  overallPercentage?: number;
  breakdown?: {
    codebaseUnderstanding: number;
    architectureMapping: number;
    gitHistory: number;
    documentation: number;
    dependencyMapping: number;
  };
  metrics?: {
    totalFiles: number;
    totalLinesOfCode?: number;
    modulesCount?: number;
    commitsTracked: number;
    architectureNodes: number;
    relationshipsMapped: number;
    evidenceItemsCount?: number;
  };
}

export type ContextCoverage = AnalysisCoverage;

export interface ProjectMetadata {
  id: string;
  name: string;
  slug: string;
  repository: string;
  status: 'Analyzed' | 'Indexing' | 'Outdated' | 'Error';
  lastIndexed: string;
  defaultBranch: string;
  activeBranch: string;
  language: string;
  framework: string;
  database: string;
  coverage: ContextCoverage;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  extension?: string;
  size?: string;
  lines?: number;
  lastModified?: string;
  lastCommit?: string;
  author?: string;
  complexity?: 'Low' | 'Medium' | 'High';
}

export interface FileDetail {
  path: string;
  name: string;
  extension: string;
  size: string;
  lines: number;
  language: string;
  lastCommit: {
    hash: string;
    message: string;
    date: string;
    author: string;
  };
  imports: string[];
  exports: string[];
  relatedNodes: string[];
  content: string;
}

export type ArchitectureNodeType =
  | 'App'
  | 'Auth'
  | 'API'
  | 'Database'
  | 'Services'
  | 'Components'
  | 'External APIs';

export interface ArchitectureNode {
  id: string;
  name: string;
  type: ArchitectureNodeType;
  category: string;
  description: string;
  filesCount: number;
  health: 'stable' | 'active' | 'legacy';
  relatedFiles: string[];
  dependencies: string[];
  dependents: string[];
  recentChanges: {
    commit: string;
    description: string;
    date: string;
  }[];
  metrics: {
    loc: number;
    fanIn: number;
    fanOut: number;
  };
  position: { x: number; y: number };
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  protocol?: string;
  relationship: string;
  confidence: number;
  isIndirect?: boolean;
}

export interface ArchitectureGraphData {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

export interface TimelineEvent {
  id: string;
  date: string;
  year: number;
  month: string;
  type: 'milestone' | 'refactor' | 'feature' | 'security' | 'database';
  title: string;
  explanation: string;
  description?: string;
  architecturalImpact?: string;
  commitHash: string;
  commitShort: string;
  author: {
    name: string;
    avatar: string;
    handle: string;
  };
  filesAffected: string[];
  filesChanged?: string[];
  diffStats?: {
    additions: number;
    deletions: number;
  };
  evidencePointers: string[];
}

export interface ImpactAnalysisResult {
  selectedFile: string;
  selectedModule: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
  disclaimer: string;
  directlyAffected: {
    name: string;
    path: string;
    reason: string;
    type: 'route' | 'service' | 'middleware' | 'component' | 'query';
  }[];
  potentiallyAffected: {
    name: string;
    path: string;
    reason: string;
    likelihood: 'Possible' | 'Unlikely' | 'Conditional';
  }[];
  relatedDependencies: {
    name: string;
    version?: string;
    couplingType: 'Direct Import' | 'Schema Binding' | 'Configuration' | 'Network Call';
  }[];
  summary: string;
}

export type EvidenceCategory =
  | 'Files'
  | 'Commits'
  | 'Pull Requests'
  | 'Documentation'
  | 'Dependencies'
  | 'Architecture relationships';

export interface EvidenceItem {
  id: string;
  type: EvidenceCategory;
  name: string;
  pathOrIdentifier: string;
  date: string;
  relevanceScore: number; // e.g. 98%
  relevanceLevel: 'Primary' | 'High' | 'Supporting';
  snippetOrContext: string;
  relatedModules: string[];
  author?: string;
  commitHash?: string;
  prNumber?: number;
}

export interface IntelligenceAnswer {
  id: string;
  question: string;
  timestamp: string;
  answerText: string;
  status: 'verified' | 'inferred';
  confidenceScore: number;
  evidence: {
    type: 'file' | 'commit' | 'schema' | 'pr' | 'architecture';
    label: string;
    reference: string;
    preview?: string;
  }[];
  relatedQuestions?: string[];
}

export interface IndexingProgressStep {
  id: string;
  label: string;
  detail: string;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface UserSettings {
  general: {
    projectName: string;
    repository: string;
    defaultBranch: string;
    projectSlug: string;
  };
  analysis: {
    lastIndexed: string;
    filesAnalyzed: number;
    dependenciesDetected: number;
    autoIndexOnPush: boolean;
    includeTestFiles: boolean;
    indexingDepth: 'Deep' | 'Standard' | 'Surface';
  };
  github: {
    connectedAccount: string;
    accountType: string;
    permissions: string[];
    connectionStatus: 'Connected' | 'Token Expiring' | 'Disconnected';
    installedAppId: string;
  };
  appearance: {
    theme: 'light' | 'dark' | 'system';
    density: 'comfortable' | 'dense' | 'compact';
    codeFont: 'IBM Plex Mono' | 'Geist Mono' | 'JetBrains Mono';
  };
}

