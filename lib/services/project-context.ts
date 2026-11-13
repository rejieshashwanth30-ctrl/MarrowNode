import { prisma } from '@/lib/prisma';
import { getOrCreateCurrentProfile, AuthError } from '@/lib/auth';
import { getActiveUserProject } from '@/lib/services/projects';
import { telemetry } from '@/lib/observability/timing';
import {
  getCurrentRepositoryHead,
  verifyRepositoryHeadSha,
  type RepositoryHeadResult,
} from '@/lib/github/client';
import { getServerGitHubTokenForUser } from '@/lib/github/pr-client';
import type {
  FileTreeNode,
  ArchitectureNode,
  ArchitectureEdge,
  TimelineEvent,
  EvidenceItem,
  EvidenceCategory,
  AnalysisCoverage,
} from '@/types';

// In-memory workstation context cache with short TTL
// Keyed strictly by `${userId}:${projectId}:${latestAnalysisId || 'none'}`
interface CachedWorkstationContext {
  context: ProjectWorkstationContext;
  expiresAt: number;
}

const contextCache = new Map<string, CachedWorkstationContext>();
const CONTEXT_CACHE_TTL_MS = 30 * 1000; // 30s so live GitHub HEAD stale checks stay accurate without slowing navigation

const contextInvalidationListeners: Array<(projectId?: string) => void> = [];
export function registerCacheInvalidationListener(fn: (projectId?: string) => void) {
  contextInvalidationListeners.push(fn);
}

/**
 * Invalidate cached workstation context (and registered derived caches) for a project or all projects.
 */
export function invalidateProjectContextCache(projectId?: string) {
  if (!projectId) {
    contextCache.clear();
  } else {
    for (const key of Array.from(contextCache.keys())) {
      if (key.includes(`:${projectId}:`)) {
        contextCache.delete(key);
      }
    }
  }
  for (const listener of contextInvalidationListeners) {
    try {
      listener(projectId);
    } catch {
      // ignore listener errors cleanly
    }
  }
}

export interface ProjectWorkstationContext {
  project: {
    id: string;
    name: string;
    description: string | null;
    githubOwner: string | null;
    githubRepositoryName: string | null;
    defaultBranch: string;
    visibility: string;
    primaryLanguage: string | null;
    framework: string | null;
    database: string | null;
    analysisStatus: string;
    lastAnalyzedAt: Date | null;
  };
  repository: {
    fullName: string;
    isPrivate: boolean;
    stars: number;
    isFork: boolean;
    lastSyncedAt: Date | null;
  } | null;
  latestAnalysis: {
    id: string;
    status: string;
    freshness: 'CURRENT' | 'STALE' | 'ANALYZING' | 'PARTIAL' | 'FAILED' | 'UNVERIFIED' | 'SYNC_FAILED';
    freshnessVerified?: boolean;
    freshnessMessage?: string;
    liveHeadSha?: string | null;
    latestRunStatus?: string | null;
    tokenValid?: boolean;
    isPublicFallback?: boolean;
    providerStatus?: string;
    verifiedAt?: string;
    commitSha: string | null;
    branch: string | null;
    analyzerVersion: string | null;
    coverage: number | null;
    createdAt: Date | null;
    filesAnalyzed: number | null;
    commitsAnalyzed: number | null;
    dependenciesDetected: number | null;
    architectureNodes: number | null;
    evidenceCount: number | null;
    completedAt: Date | null;
    errorMessage: string | null;
  } | null;
  historyTotalCount?: number;
  activeProgress?: {
    analysisId: string;
    status: string;
    totalSourceFiles: number;
    processedSourceFiles: number;
    totalBatches: number;
    completedBatches: number;
    totalCommitsIngested: number;
    historyStatus: string;
  } | null;
  fileTree: FileTreeNode[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  timeline: TimelineEvent[];
  evidenceItems: EvidenceItem[];
  dependencies: string[];
  modules: string[];
  coverage: AnalysisCoverage | null;
  summary: {
    totalFiles: number;
    topLanguage: string;
    framework: string;
    hasReadme: boolean;
    readmePreview: string | null;
  };
}

/**
 * Builds a hierarchical FileTreeNode tree from flat paths.
 */
function buildFileTreeFromPaths(
  files: Array<{ path: string; size?: number; type?: string }>
): FileTreeNode[] {
  const rootNodes: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  for (const file of files) {
    const parts = file.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFolder = i < parts.length - 1;
      const prevPath = currentPath;
      currentPath = prevPath ? `${prevPath}/${part}` : part;

      if (!nodeMap.has(currentPath)) {
        const ext = !isFolder && part.includes('.') ? `.${part.split('.').pop()}` : undefined;
        const newNode: FileTreeNode = {
          id: currentPath,
          name: part,
          path: currentPath,
          type: isFolder ? 'folder' : 'file',
          extension: ext,
          size: file.size ? `${Math.round(file.size / 1024)} KB` : undefined,
          children: isFolder ? [] : undefined,
        };

        nodeMap.set(currentPath, newNode);

        if (prevPath && nodeMap.has(prevPath)) {
          const parent = nodeMap.get(prevPath)!;
          if (parent.children) {
            parent.children.push(newNode);
          }
        } else if (i === 0) {
          rootNodes.push(newNode);
        }
      }
    }
  }

  // Sort folders first, then alphabetically
  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(rootNodes);
  return rootNodes;
}

/**
 * Resolves the active project context for the authenticated user.
 * Single server-side source of truth.
 */
export async function resolveActiveProjectContext(
  targetProjectId?: string
): Promise<ProjectWorkstationContext | null> {
  let projectId = targetProjectId;

  if (!projectId) {
    const activeProject = await getActiveUserProject();
    if (!activeProject) {
      return null;
    }
    projectId = activeProject.id;
  }

  return getProjectWorkstationContext(projectId);
}

/**
 * Retrieve the complete workstation context for a specific project.
 * Strictly verifies ownership via authenticated profile.
 */
export async function getProjectWorkstationContext(
  projectId: string,
  options: { forceFresh?: boolean; profile?: any } = {}
): Promise<ProjectWorkstationContext> {
  const profile = options.profile || (await getOrCreateCurrentProfile());

  // 1. Check in-memory workstation context cache (isolated by profile.id)
  if (!options.forceFresh) {
    for (const [key, cached] of Array.from(contextCache.entries())) {
      if (key.startsWith(`${profile.id}:${projectId}:`) && Date.now() < cached.expiresAt) {
        telemetry.record({
          operation: 'project_context.cache_hit',
          durationMs: 0,
          projectId,
          cacheHit: true,
          status: 'success',
        });
        return cached.context;
      }
    }
  }

  const project = await telemetry.measure(
    'database.fetch_project_evidences',
    () =>
      prisma.project.findFirst({
        where: {
          id: projectId,
          ownerId: profile.id,
        },
        include: {
          repository: true,
          analyses: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          evidences: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    { projectId }
  );

  if (!project) {
    throw new AuthError('Project not found or access denied', 404);
  }

  // Prefer the latest COMPLETED or PARTIALLY_COMPLETED snapshot so in-progress/failed reruns never blind the workspace
  const rawLatestAnalysis = project.analyses[0] || null;
  const completedAnalysis =
    project.analyses.find(
      (a) => a.status === 'COMPLETED' || a.status === 'PARTIALLY_COMPLETED'
    ) || null;
  const latestAnalysis = completedAnalysis || rawLatestAnalysis;
  const evidences = project.evidences || [];

  // Query indexed ProjectCommit history cleanly (page 1 = latest 50 + exact total count)
  const targetBranch = latestAnalysis?.branch || project.defaultBranch || 'main';
  const [dbCommitCount, dbRecentCommits] = await Promise.all([
    prisma.projectCommit.count({ where: { projectId, branch: targetBranch } }).catch(() => 0),
    prisma.projectCommit
      .findMany({
        where: { projectId, branch: targetBranch },
        orderBy: { committedAt: 'desc' },
        take: 50,
      })
      .catch(() => []),
  ]);

  // Parse evidence records into workstation objects
  let fileTree: FileTreeNode[] = [];
  let nodes: ArchitectureNode[] = [];
  let edges: ArchitectureEdge[] = [];
  let timeline: TimelineEvent[] = [];
  let dependencies: string[] = [];
  let modules: string[] = [];
  let hasReadme = false;
  let readmePreview: string | null = null;
  let totalFilesCount = latestAnalysis?.filesAnalyzed || 0;

  const evidenceItems: EvidenceItem[] = [];

  for (const ev of evidences) {
    const meta = (ev.metadata as any) || {};

    // 1. Files evidence
    if (ev.type === 'files') {
      if (Array.isArray(meta.tree)) {
        fileTree = buildFileTreeFromPaths(meta.tree);
      } else if (Array.isArray(meta.topLevelDirectories)) {
        // Fallback to top-level directories as folder nodes
        fileTree = meta.topLevelDirectories.map((dir: string) => ({
          id: dir,
          name: dir,
          path: dir,
          type: 'folder' as const,
          children: [],
        }));
      }
      if (meta.totalFiles) {
        totalFilesCount = meta.totalFiles;
      }

      evidenceItems.push({
        id: ev.id,
        type: 'Files',
        name: 'Project Size & Structure',
        pathOrIdentifier: ev.path || '/',
        date: ev.createdAt.toISOString().split('T')[0],
        relevanceScore: 98,
        relevanceLevel: 'Primary',
        snippetOrContext: `Found ${totalFilesCount} files across ${meta.topLevelDirectories?.length || 0} main folders`,
        relatedModules: meta.topLevelDirectories || [],
      });
    }

    // 2. Architecture evidence
    if (ev.type === 'architecture') {
      if (Array.isArray(meta.nodes) && meta.nodes.length > 0) {
        nodes = meta.nodes;
      }
      if (Array.isArray(meta.edges) && meta.edges.length > 0) {
        edges = meta.edges;
      }
      if (Array.isArray(meta.modules)) {
        modules = meta.modules;
      }

      evidenceItems.push({
        id: ev.id,
        type: 'Architecture relationships',
        name: 'Project Technology & Structure',
        pathOrIdentifier: meta.framework || 'Project Structure',
        date: ev.createdAt.toISOString().split('T')[0],
        relevanceScore: 95,
        relevanceLevel: 'Primary',
        snippetOrContext: `${meta.framework || 'Software'} project organized into ${modules.length} main areas`,
        relatedModules: modules,
      });
    }

    // 3. Commits evidence (Timeline)
    if (ev.type === 'commits') {
      if (Array.isArray(meta.events) && meta.events.length > 0) {
        timeline = meta.events;
      } else if (Array.isArray(meta.recentCommits)) {
        timeline = meta.recentCommits.map((c: any, idx: number) => {
          const commitDate = c.date ? new Date(c.date) : new Date();
          const lowerMsg = (c.message || '').toLowerCase();
          let eventType: 'milestone' | 'security' | 'database' | 'refactor' | 'feature' = 'feature';
          if (/\b(init|initial|release|v\d+\.\d+|breaking|major)\b/.test(lowerMsg)) {
            eventType = 'milestone';
          } else if (/\b(auth|security|protect|oauth|jwt|session|token|permission)\b/.test(lowerMsg)) {
            eventType = 'security';
          } else if (/\b(schema|prisma|migration|database|postgres|sql|db)\b/.test(lowerMsg)) {
            eventType = 'database';
          } else if (/\b(refactor|clean|reorganize|structure|chore)\b/.test(lowerMsg)) {
            eventType = 'refactor';
          }

          return {
            id: `commit-${c.sha || idx}`,
            date: commitDate.toISOString().split('T')[0],
            year: commitDate.getFullYear(),
            month: commitDate.toLocaleString('default', { month: 'short' }),
            type: eventType,
            title: c.message || `Commit ${c.sha}`,
            explanation: `Change in commit ${c.sha} by ${c.author || 'Developer'}`,
            architecturalImpact: undefined,
            commitHash: c.sha || 'unknown',
            commitShort: (c.sha || 'unknown').substring(0, 7),
            author: {
              name: c.author || 'Developer',
              avatar: '',
              handle: c.author?.toLowerCase().replace(/\s+/g, '') || 'dev',
            },
          };
        });
      }

      evidenceItems.push({
        id: ev.id,
        type: 'Commits',
        name: 'Recent Development History',
        pathOrIdentifier: `Recent ${timeline.length} commits`,
        date: ev.createdAt.toISOString().split('T')[0],
        relevanceScore: 92,
        relevanceLevel: 'High',
        snippetOrContext: timeline[0]?.title || 'Recent project commits analyzed',
        relatedModules: [],
      });
    }

    // 4. Dependencies evidence
    if (ev.type === 'dependencies') {
      if (Array.isArray(meta.allDependencies) && meta.allDependencies.length > 0) {
        dependencies = meta.allDependencies;
      } else if (Array.isArray(meta.sampleDependencies)) {
        dependencies = meta.sampleDependencies;
      }

      evidenceItems.push({
        id: ev.id,
        type: 'Dependencies',
        name: 'External Packages',
        pathOrIdentifier: ev.path || 'package.json',
        date: ev.createdAt.toISOString().split('T')[0],
        relevanceScore: 90,
        relevanceLevel: 'High',
        snippetOrContext: `${meta.totalCount || dependencies.length} packages found (${dependencies.slice(0, 5).join(', ')}...)`,
        relatedModules: [],
      });
    }

    // 5. Documentation evidence
    if (ev.type === 'documentation') {
      hasReadme = Boolean(meta.hasReadme);
      readmePreview = meta.preview || null;

      evidenceItems.push({
        id: ev.id,
        type: 'Documentation',
        name: 'Project Documentation',
        pathOrIdentifier: ev.path || 'README.md',
        date: ev.createdAt.toISOString().split('T')[0],
        relevanceScore: 88,
        relevanceLevel: 'Supporting',
        snippetOrContext: readmePreview || 'Project documentation found',
        relatedModules: [],
      });
    }
  }

  // If nodes were not stored explicitly, synthesize deterministic nodes from detected modules
  if (nodes.length === 0 && (modules.length > 0 || project.framework)) {
    const frameworkName = project.framework || 'Application Core';
    nodes = [
      {
        id: 'node-app',
        name: project.name || 'Application',
        type: 'App',
        category: 'Entrypoint',
        description: `${frameworkName} root workspace application`,
        filesCount: Math.max(1, Math.round(totalFilesCount * 0.2)),
        health: 'active',
        relatedFiles: ['package.json', hasReadme ? 'README.md' : null].filter(Boolean) as string[],
        dependencies: modules.slice(0, 3),
        dependents: [],
        recentChanges: timeline.slice(0, 2).map((t) => ({
          commit: t.commitShort,
          description: t.title,
          date: t.date,
        })),
        metrics: { loc: totalFilesCount * 50, fanIn: 0, fanOut: modules.length },
        position: { x: 250, y: 50 },
      },
    ];

    modules.forEach((mod, idx) => {
      const isApi = mod.toLowerCase().includes('api') || mod.toLowerCase().includes('server');
      const isDb = mod.toLowerCase().includes('db') || mod.toLowerCase().includes('prisma');
      const isComponent = mod.toLowerCase().includes('component') || mod.toLowerCase().includes('ui');
      const nodeType = isApi ? 'API' : isDb ? 'Database' : isComponent ? 'Components' : 'Services';

      nodes.push({
        id: `node-${mod}`,
        name: mod.charAt(0).toUpperCase() + mod.slice(1),
        type: nodeType,
        category: 'Module',
        description: `Source module directory /${mod}`,
        filesCount: Math.max(1, Math.round(totalFilesCount / Math.max(modules.length, 1))),
        health: 'stable',
        relatedFiles: [`${mod}/*`],
        dependencies: [],
        dependents: ['node-app'],
        recentChanges: [],
        metrics: { loc: 200, fanIn: 1, fanOut: 0 },
        position: { x: 100 + (idx % 3) * 160, y: 160 + Math.floor(idx / 3) * 100 },
      });

      edges.push({
        id: `edge-app-${mod}`,
        source: 'node-app',
        target: `node-${mod}`,
        relationship: 'imports',
        confidence: 0.9,
      });
    });
  }

  // Canonical analysis coverage calculation
  let rawCoverage = (latestAnalysis?.summaryJson as any)?.coverage || null;
  let computedCoverage: AnalysisCoverage | null = null;

  if (rawCoverage && rawCoverage.files && rawCoverage.imports) {
    computedCoverage = rawCoverage as AnalysisCoverage;
  } else if (latestAnalysis && latestAnalysis.status === 'COMPLETED') {
    const countLeafFiles = (items: FileTreeNode[]): number =>
      items.reduce(
        (acc, item) =>
          acc + (item.type === 'file' ? 1 : item.children ? countLeafFiles(item.children) : 0),
        0
      );
    const totalSourceFiles = countLeafFiles(fileTree) || latestAnalysis.filesAnalyzed || 0;
    const parsedSourceFiles = latestAnalysis.filesAnalyzed || totalSourceFiles;
    const sourceCoveragePercent = totalSourceFiles > 0
      ? Math.min(100, Math.round((parsedSourceFiles / totalSourceFiles) * 100))
      : 0;
    const archCoveragePercent = modules.length > 0
      ? Math.min(100, Math.round((nodes.length / modules.length) * 100))
      : 100;
    const gitCoveragePercent = timeline.length > 0 ? 100 : 0;
    const overallCoveragePercent = Math.round(
      sourceCoveragePercent * 0.35 +
      archCoveragePercent * 0.25 +
      100 * 0.20 +
      (dependencies.length > 0 ? 100 : 0) * 0.10 +
      gitCoveragePercent * 0.10
    );

    computedCoverage = {
      files: {
        discovered: totalFilesCount,
        source: totalSourceFiles,
        parsed: parsedSourceFiles,
        failed: 0,
        ignored: Math.max(0, totalFilesCount - totalSourceFiles),
        coveragePercent: sourceCoveragePercent,
      },
      architecture: {
        modulesDetected: modules.length,
        modulesMapped: Math.min(modules.length, nodes.length),
        unresolvedModules: Math.max(0, modules.length - nodes.length),
        coveragePercent: archCoveragePercent,
        detectedModuleNames: modules,
        unresolvedModuleNames: [],
      },
      imports: {
        total: edges.length,
        resolved: edges.length,
        unresolved: 0,
        external: dependencies.length,
        resolutionPercent: 100,
      },
      dependencies: {
        manifestsDetected: dependencies.length > 0 ? 1 : 0,
        manifestsParsed: dependencies.length > 0 ? 1 : 0,
        manifestParsingPercent: dependencies.length > 0 ? 100 : 0,
        declaredDependencies: dependencies.length,
        resolvedDependencies: dependencies.length,
        unresolvedDependencies: 0,
        usageResolutionPercent: dependencies.length > 0 ? 100 : 0,
      },
      git: {
        commitsDiscovered: timeline.length,
        commitsIndexed: timeline.length,
        coveragePercent: gitCoveragePercent,
        historyScope: `Latest ${timeline.length} commits on ${project.defaultBranch}`,
      },
      documentation: {
        filesDetected: hasReadme ? 1 : 0,
        filesIndexed: hasReadme ? 1 : 0,
        docTypes: hasReadme ? ['README'] : [],
        hasReadme,
      },
      overallCoveragePercent,
      overallPercentage: overallCoveragePercent,
      metrics: {
        totalFiles: totalFilesCount,
        commitsTracked: timeline.length,
        relationshipsMapped: edges.length,
        architectureNodes: nodes.length,
      },
      breakdown: {
        codebaseUnderstanding: sourceCoveragePercent,
        architectureMapping: archCoveragePercent,
        gitHistory: gitCoveragePercent,
        dependencyMapping: dependencies.length > 0 ? 100 : 0,
        documentation: hasReadme ? 100 : 0,
      },
    };
  }

  // 13. Live GitHub HEAD Freshness & Stale Detection
  let liveHeadSha: string | null = null;
  let freshnessVerified = false;
  let headResult: RepositoryHeadResult | null = null;

  if (
    project.githubOwner &&
    project.githubRepositoryName &&
    (latestAnalysis?.status === 'COMPLETED' || latestAnalysis?.status === 'PARTIALLY_COMPLETED')
  ) {
    const ownerToken = await getServerGitHubTokenForUser(profile.id).catch(() => null);
    headResult = await getCurrentRepositoryHead({
      token: ownerToken,
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
      branch: latestAnalysis.branch || project.defaultBranch || 'main',
      userScope: profile.id,
      repositoryId: project.repository?.id,
      projectId: project.id,
      analyzedCommitSha: latestAnalysis.commitSha,
      bypassCache: options.forceFresh,
    });
    liveHeadSha = headResult.currentHeadSha;
    freshnessVerified = headResult.verified;
  }

  let freshness: 'CURRENT' | 'STALE' | 'ANALYZING' | 'PARTIAL' | 'FAILED' | 'UNVERIFIED' | 'SYNC_FAILED' = 'CURRENT';
  let freshnessMessage = 'Repository analysis matches the latest verified GitHub commit.';

  if (!latestAnalysis) {
    freshness = 'STALE';
    freshnessMessage = 'Repository has not been analyzed yet.';
  } else if (
    rawLatestAnalysis?.status === 'RUNNING' ||
    rawLatestAnalysis?.status === 'PENDING' ||
    rawLatestAnalysis?.status === 'QUEUED'
  ) {
    freshness = 'ANALYZING';
    freshnessMessage = `Analyzing repository (${rawLatestAnalysis.processedSourceFiles ?? 0}/${rawLatestAnalysis.totalSourceFiles ?? 0} source files).`;
  } else if (completedAnalysis && rawLatestAnalysis && rawLatestAnalysis.id !== completedAnalysis.id && rawLatestAnalysis.status === 'FAILED') {
    // Preserve existing completed analysis while honestly showing sync failure
    freshness = 'SYNC_FAILED';
    freshnessMessage = 'Sync failed — showing the last successfully analyzed version.';
  } else if (!completedAnalysis && rawLatestAnalysis?.status === 'FAILED') {
    freshness = 'FAILED';
    freshnessMessage = 'The latest analysis attempt failed.';
  } else if (
    freshnessVerified &&
    liveHeadSha &&
    latestAnalysis.commitSha &&
    liveHeadSha !== latestAnalysis.commitSha
  ) {
    freshness = 'STALE';
    freshnessMessage = 'Repository has changed since this analysis (newer commit available on GitHub).';
  } else if (!freshnessVerified && project.githubOwner && project.githubRepositoryName) {
    freshness = 'UNVERIFIED';
    freshnessMessage = headResult?.statusMessage || 'Repository freshness could not be verified.';
  } else if (
    latestAnalysis.status === 'PARTIALLY_COMPLETED' ||
    (computedCoverage &&
      computedCoverage.files.coveragePercent < 100 &&
      computedCoverage.files.source > computedCoverage.files.parsed)
  ) {
    freshness = 'PARTIAL';
    freshnessMessage = `Partially analyzed: ${computedCoverage?.files?.parsed ?? 0}/${computedCoverage?.files?.source ?? 0} source files inspected.`;
  } else {
    freshness = 'CURRENT';
  }

  // Prefer paginated ProjectCommit rows when ingested so large histories stay bounded in context
  if (dbRecentCommits.length > 0) {
    timeline = dbRecentCommits.map((c) => ({
      id: `ev-${c.shortSha}`,
      date: c.committedAt.toISOString().split('T')[0],
      year: c.committedAt.getFullYear(),
      month: c.committedAt.toLocaleString('default', { month: 'short' }),
      type: c.eventType as any,
      title: c.message,
      explanation: `Observed change in commit ${c.shortSha} by ${c.authorName}: ${c.message}`,
      architecturalImpact: c.body ? `Commit body documentation: ${c.body}` : undefined,
      commitHash: c.commitSha,
      commitShort: c.shortSha,
      author: {
        name: c.authorName,
        avatar: '',
        handle: c.authorName.toLowerCase().replace(/\s+/g, ''),
      },
      filesAffected: [],
      evidencePointers: [],
    }));
  }

  const activeProgress =
    rawLatestAnalysis &&
    (rawLatestAnalysis.status === 'RUNNING' || rawLatestAnalysis.status === 'QUEUED')
      ? {
          analysisId: rawLatestAnalysis.id,
          status: rawLatestAnalysis.status,
          totalSourceFiles: rawLatestAnalysis.totalSourceFiles ?? 0,
          processedSourceFiles: rawLatestAnalysis.processedSourceFiles ?? 0,
          totalBatches: rawLatestAnalysis.totalBatches ?? 0,
          completedBatches: rawLatestAnalysis.completedBatches ?? 0,
          totalCommitsIngested: rawLatestAnalysis.totalCommitsIngested ?? 0,
          historyStatus: rawLatestAnalysis.historyStatus || 'PENDING',
        }
      : null;

  const resolvedContext: ProjectWorkstationContext = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      githubOwner: project.githubOwner,
      githubRepositoryName: project.githubRepositoryName,
      defaultBranch: project.defaultBranch,
      visibility: project.visibility,
      primaryLanguage: project.primaryLanguage,
      framework: project.framework,
      database: project.database,
      analysisStatus: project.analysisStatus,
      lastAnalyzedAt: project.lastAnalyzedAt,
    },
    repository: project.repository
      ? {
          fullName: project.repository.fullName,
          isPrivate: project.repository.isPrivate,
          stars: project.repository.stars,
          isFork: project.repository.isFork,
          lastSyncedAt: project.repository.lastSyncedAt,
        }
      : null,
    latestAnalysis: latestAnalysis
      ? {
          id: latestAnalysis.id,
          status: latestAnalysis.status,
          freshness,
          freshnessVerified,
          freshnessMessage,
          liveHeadSha,
          latestRunStatus: rawLatestAnalysis?.status || latestAnalysis.status,
          tokenValid: headResult ? headResult.tokenValid : true,
          isPublicFallback: headResult ? headResult.isPublicFallback : false,
          providerStatus: headResult ? headResult.providerStatus : undefined,
          verifiedAt: headResult ? headResult.verifiedAt : undefined,
          commitSha: latestAnalysis.commitSha || null,
          branch: latestAnalysis.branch || project.defaultBranch,
          analyzerVersion: latestAnalysis.analyzerVersion || 'v2.0',
          coverage: latestAnalysis.coverage ?? computedCoverage?.overallCoveragePercent ?? null,
          createdAt: latestAnalysis.createdAt,
          filesAnalyzed: latestAnalysis.filesAnalyzed,
          commitsAnalyzed: latestAnalysis.commitsAnalyzed,
          dependenciesDetected: latestAnalysis.dependenciesDetected,
          architectureNodes: latestAnalysis.architectureNodes,
          evidenceCount: latestAnalysis.evidenceCount,
          completedAt: latestAnalysis.completedAt,
          errorMessage: latestAnalysis.errorMessage,
        }
      : null,
    historyTotalCount: dbCommitCount > 0 ? dbCommitCount : timeline.length,
    activeProgress,
    fileTree,
    nodes,
    edges,
    timeline,
    evidenceItems,
    dependencies,
    modules,
    coverage: computedCoverage,
    summary: {
      totalFiles: totalFilesCount,
      topLanguage: project.primaryLanguage || 'Unknown',
      framework: project.framework || 'Standard',
      hasReadme,
      readmePreview,
    },
  };

  // Populate cache for subsequent requests
  contextCache.set(`${profile.id}:${projectId}:${latestAnalysis?.id || 'none'}`, {
    context: resolvedContext,
    expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
  });

  return resolvedContext;
}
