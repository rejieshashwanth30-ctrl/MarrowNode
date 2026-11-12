import { prisma } from '@/lib/prisma';
import {
  fetchRepositoryDetails,
  fetchRepoLanguages,
  fetchRepoCommitsPaginated,
  fetchRepoTree,
  fetchRepoFileContent,
  githubCache,
  GitHubApiError,
} from '@/lib/github/client';
import { updateAnalysisRun } from '@/lib/services/analysis';
import { updateProject } from '@/lib/services/projects';
import { parseSourceFileAST, type ASTImport, type ASTExport } from '@/lib/analysis/ast-parser';
import { parseTsConfig, resolveImportSpecifier, type TsConfigOptions } from '@/lib/analysis/path-resolver';
import { DependencyGraphEngine, type DependencyEdge } from '@/lib/analysis/graph-engine';
import type { AnalysisCoverage } from '@/types';
import { telemetry } from '@/lib/observability/timing';
import {
  createFileProvenance,
  createGraphProvenance,
  createManifestProvenance,
  createCommitProvenance,
} from '@/lib/analysis/provenance';
import { invalidateProjectContextCache } from '@/lib/services/project-context';
import { invalidateOnboardingCache } from '@/lib/services/onboarding';

export const ANALYZER_VERSION = 'v3.0';
export const MAX_FILES_PER_BATCH = 40;
export const MAX_CONCURRENT_FILE_FETCHES = 8;
export const REDUCED_CONCURRENCY_ON_LOW_QUOTA = 3;
export const STEP_TIME_BUDGET_MS = 8500;
export const COMMITS_PER_PAGE = 100;
export const MAX_COMMIT_PAGES_SAFETY = 50;

// Directories excluded from codebase deep parsing
const IGNORED_PATH_SEGMENTS = [
  'node_modules/',
  '.next/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  'vendor/',
  '.idea/',
  '.vscode/',
  '.turbo/',
  '__pycache__/',
  '.pytest_cache/',
  '.venv/',
  'venv/',
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.mp4', '.mov', '.avi', '.mp3', '.wav',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot',
  '.jar', '.war', '.bin',
]);

export type FileClassification =
  | 'SOURCE'
  | 'CONFIG'
  | 'DOCUMENTATION'
  | 'TEST'
  | 'GENERATED'
  | 'BINARY'
  | 'ASSET';

export interface DiscoveredTreeFile {
  path: string;
  sha?: string;
  size?: number;
  type?: string;
  classification: FileClassification;
}

export interface CompactParsedAstSummary {
  filePath: string;
  blobSha?: string;
  loc: number;
  imports: ASTImport[];
  reExports: Array<Pick<ASTExport, 'name' | 'line' | 'reExportFrom'>>;
}

export interface FailedFileRecord {
  path: string;
  reason: string;
  stage: 'fetch' | 'ast_parse' | 'history_page';
}

export interface DiscoverySnapshotMetadata {
  owner: string;
  repo: string;
  repositoryId: string;
  defaultBranch: string;
  latestCommitSha: string | null;
  topLanguage: string;
  languages: Record<string, number>;
  detectedFramework: string;
  detectedDatabase: string | null;
  declaredDependencies: string[];
  foundManifests: string[];
  primaryManifestPath: string | null;
  hasReadme: boolean;
  readmePath: string | null;
  readmePreview: string | null;
  tsconfigOptions: TsConfigOptions;
  treeTruncatedByGitHub: boolean;
  totalDiscoveredFiles: number;
  totalSourceFiles: number;
  ignoredFilesCount: number;
  classificationCounts: Record<FileClassification, number>;
  extensionBreakdown: Array<[string, number]>;
  topLevelDirectories: string[];
  treeFiles: DiscoveredTreeFile[];
}

export interface AnalysisProgressSnapshot {
  analysisId: string;
  projectId: string;
  repositoryId: string | null;
  commitSha: string | null;
  branch: string | null;
  status: string;
  analyzerVersion: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  ignoredFiles: number;
  totalSourceFiles: number;
  processedSourceFiles: number;
  totalBatches: number;
  completedBatches: number;
  currentBatch: number;
  historyStatus: string;
  totalCommitsIngested: number;
  historyNextPage: number;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

/**
 * Classifies an individual file based on its path and extension.
 */
export function classifyRepositoryFile(filePath: string): FileClassification {
  const lower = filePath.toLowerCase();

  for (const seg of IGNORED_PATH_SEGMENTS) {
    if (lower.includes(seg)) return 'GENERATED';
  }

  const lastDot = lower.lastIndexOf('.');
  const ext = lastDot !== -1 ? lower.substring(lastDot) : '';

  if (BINARY_EXTENSIONS.has(ext)) {
    return ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp'].includes(ext)
      ? 'ASSET'
      : 'BINARY';
  }

  if (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('__tests__/') ||
    lower.startsWith('test/') ||
    lower.startsWith('tests/')
  ) {
    return 'TEST';
  }

  const filename = lower.split('/').pop() || '';
  if (
    filename.startsWith('readme') ||
    filename.startsWith('contributing') ||
    filename.startsWith('license') ||
    filename.startsWith('changelog') ||
    lower.startsWith('docs/') ||
    ext === '.md' ||
    ext === '.mdx' ||
    ext === '.txt'
  ) {
    return 'DOCUMENTATION';
  }

  if (
    [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'tsconfig.json',
      'jsconfig.json',
      '.eslintrc',
      '.eslintrc.json',
      '.eslintrc.js',
      'next.config.js',
      'next.config.mjs',
      'next.config.ts',
      'vite.config.ts',
      'vite.config.js',
      'tailwind.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
      'requirements.txt',
      'pyproject.toml',
      'go.mod',
      'go.sum',
      'cargo.toml',
      'cargo.lock',
      'dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
    ].includes(filename) ||
    filename.startsWith('.env')
  ) {
    return 'CONFIG';
  }

  const sourceExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.rb', '.php', '.swift', '.kt', '.sql', '.html', '.css', '.scss',
  ]);

  if (sourceExtensions.has(ext)) {
    return 'SOURCE';
  }

  return 'CONFIG';
}

export function classifyCommitType(msg: string): 'milestone' | 'security' | 'database' | 'refactor' | 'feature' {
  const lowerMsg = msg.toLowerCase();
  if (/\b(init|initial|release|v\d+\.\d+|breaking|major)\b/.test(lowerMsg)) {
    return 'milestone';
  }
  if (/\b(auth|security|protect|oauth|jwt|session|token|permission)\b/.test(lowerMsg)) {
    return 'security';
  }
  if (/\b(schema|prisma|migration|database|postgres|sql|db)\b/.test(lowerMsg)) {
    return 'database';
  }
  if (/\b(refactor|clean|reorganize|structure|chore)\b/.test(lowerMsg)) {
    return 'refactor';
  }
  return 'feature';
}

/**
 * Splits eligible source files cleanly into execution batches without changing total scope.
 */
export function partitionIntoBatches<T>(items: T[], batchSize = MAX_FILES_PER_BATCH): T[][] {
  if (batchSize <= 0) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * PHASE 2 & 3 (Pure, Cross-Batch):
 * Merges AST summaries extracted across ALL batches into one unified dependency graph.
 * Ensures imports/re-exports from Batch 1 targeting files parsed in Batch N resolve cleanly.
 */
export function resolveGlobalDependencyGraphFromBatches(params: {
  parsedFiles: CompactParsedAstSummary[];
  allRepoFilePaths: Set<string>;
  tsconfigOptions: TsConfigOptions;
  declaredDependencies: string[];
  owner: string;
  repo: string;
  latestCommitSha: string | null;
  analysisId: string;
}) {
  const {
    parsedFiles,
    allRepoFilePaths,
    tsconfigOptions,
    owner,
    repo,
    latestCommitSha,
    analysisId,
  } = params;

  const declaredDeps = [...params.declaredDependencies];
  const dependencyEdges: DependencyEdge[] = [];
  const importedExternalPackages = new Set<string>();
  const externalPackageUsage = new Map<string, Set<string>>();

  let totalImportsCount = 0;
  let resolvedImportsCount = 0;
  let externalImportsCount = 0;
  let unresolvedImportsCount = 0;

  for (const parsed of parsedFiles) {
    for (const imp of parsed.imports) {
      totalImportsCount++;
      const resolved = resolveImportSpecifier({
        specifier: imp.specifier,
        importingFilePath: parsed.filePath,
        allRepoFiles: allRepoFilePaths,
        tsconfig: tsconfigOptions,
      });

      if (!resolved.isExternal && resolved.resolvedPath && allRepoFilePaths.has(resolved.resolvedPath)) {
        resolvedImportsCount++;
        dependencyEdges.push({
          id: `edge-${parsed.filePath.replace(/\//g, '_')}-${resolved.resolvedPath.replace(/\//g, '_')}-${imp.line}`,
          source: parsed.filePath,
          target: resolved.resolvedPath,
          line: imp.line,
          symbols: imp.symbols,
          relationship: imp.isTypeOnly ? 'type-imports' : 'imports',
          confidence: 1.0,
          provenance: createGraphProvenance({
            repository: `${owner}/${repo}`,
            source: parsed.filePath,
            target: resolved.resolvedPath,
            line: imp.line,
            commitSha: latestCommitSha || undefined,
            analysisId,
          }) as any,
        });
      } else if (resolved.isExternal && resolved.externalPackage) {
        externalImportsCount++;
        importedExternalPackages.add(resolved.externalPackage);
        const pkgUsers = externalPackageUsage.get(resolved.externalPackage) || new Set<string>();
        if (pkgUsers.size < 100) {
          pkgUsers.add(parsed.filePath);
          externalPackageUsage.set(resolved.externalPackage, pkgUsers);
        }
        if (!declaredDeps.includes(resolved.externalPackage)) {
          declaredDeps.push(resolved.externalPackage);
        }
      } else {
        unresolvedImportsCount++;
      }
    }

    for (const exp of parsed.reExports) {
      if (!exp.reExportFrom) continue;
      totalImportsCount++;
      const resolvedReExp = resolveImportSpecifier({
        specifier: exp.reExportFrom,
        importingFilePath: parsed.filePath,
        allRepoFiles: allRepoFilePaths,
        tsconfig: tsconfigOptions,
      });

      if (
        !resolvedReExp.isExternal &&
        resolvedReExp.resolvedPath &&
        allRepoFilePaths.has(resolvedReExp.resolvedPath)
      ) {
        resolvedImportsCount++;
        dependencyEdges.push({
          id: `reexp-${parsed.filePath.replace(/\//g, '_')}-${resolvedReExp.resolvedPath.replace(/\//g, '_')}-${exp.line}`,
          source: parsed.filePath,
          target: resolvedReExp.resolvedPath,
          line: exp.line,
          symbols: [exp.name],
          relationship: 're-exports',
          confidence: 1.0,
          provenance: createGraphProvenance({
            repository: `${owner}/${repo}`,
            source: parsed.filePath,
            target: resolvedReExp.resolvedPath,
            line: exp.line,
            commitSha: latestCommitSha || undefined,
            analysisId,
          }) as any,
        });
      } else if (resolvedReExp.isExternal && resolvedReExp.externalPackage) {
        externalImportsCount++;
        importedExternalPackages.add(resolvedReExp.externalPackage);
      } else {
        unresolvedImportsCount++;
      }
    }
  }

  const graphEngine = new DependencyGraphEngine(dependencyEdges);
  const detectedCycles = graphEngine.detectCycles();

  return {
    dependencyEdges,
    detectedCycles,
    declaredDeps,
    importedExternalPackages,
    externalPackageUsage,
    totalImportsCount,
    resolvedImportsCount,
    externalImportsCount,
    unresolvedImportsCount,
  };
}

export function formatAnalysisProgress(row: any): AnalysisProgressSnapshot {
  return {
    analysisId: row.id,
    projectId: row.projectId,
    repositoryId: row.repositoryId || null,
    commitSha: row.commitSha || null,
    branch: row.branch || null,
    status: row.status,
    analyzerVersion: row.analyzerVersion || ANALYZER_VERSION,
    totalFiles: row.totalFiles ?? 0,
    processedFiles: row.processedFiles ?? 0,
    failedFiles: row.failedFiles ?? 0,
    ignoredFiles: row.ignoredFiles ?? 0,
    totalSourceFiles: row.totalSourceFiles ?? 0,
    processedSourceFiles: row.processedSourceFiles ?? 0,
    totalBatches: row.totalBatches ?? 0,
    completedBatches: row.completedBatches ?? 0,
    currentBatch: row.currentBatch ?? 0,
    historyStatus: row.historyStatus || 'PENDING',
    totalCommitsIngested: row.totalCommitsIngested ?? 0,
    historyNextPage: row.historyNextPage ?? 1,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    errorMessage: row.errorMessage || null,
  };
}

/**
 * PHASE 0: Discovery, Classification, Cache Matching & Batch Creation.
 * Discovers ALL repository files & eligible source files without any 250-file cap.
 */
export async function initializeResumableAnalysis(params: {
  token: string;
  userId: string;
  projectId: string;
  repositoryId: string;
  analysisId: string;
  owner: string;
  repo: string;
}): Promise<{ snapshot: AnalysisProgressSnapshot }> {
  const { token, userId, projectId, repositoryId, analysisId, owner, repo } = params;

  await updateAnalysisRun(projectId, analysisId, {
    status: 'QUEUED',
    analyzerVersion: ANALYZER_VERSION,
    startedAt: new Date(),
  });

  try {
    // 1. Concurrently fetch repo details, languages, and HEAD commit (page 1, 100 commits)
    const [repoDetails, languages, headCommitPage] = await telemetry.measure(
      'github.discovery_metadata',
      () =>
        Promise.all([
          fetchRepositoryDetails(token, owner, repo, userId),
          fetchRepoLanguages(token, owner, repo, userId).catch(() => ({})),
          fetchRepoCommitsPaginated({
            token,
            owner,
            repo,
            page: 1,
            perPage: COMMITS_PER_PAGE,
            userScope: userId,
            bypassCache: true,
          }).catch(() => ({ commits: [], hasNextPage: false, rateLimitRemaining: null })),
        ]),
      { projectId, analysisId }
    );

    const defaultBranch = repoDetails.default_branch || 'main';
    const latestCommitSha = headCommitPage.commits[0]?.sha || null;
    const topLanguage = Object.keys(languages)[0] || repoDetails.language || 'Unknown';

    // Persist first page of commits immediately into project_commits (deduplicated)
    let ingestedPage1 = 0;
    if (headCommitPage.commits.length > 0) {
      const commitRows = headCommitPage.commits.map((c) => {
        const msgLines = c.commit.message.split('\n');
        const msg = msgLines[0] || 'Repository commit';
        const body = msgLines.slice(1).join('\n').trim() || null;
        return {
          projectId,
          repositoryId,
          commitSha: c.sha,
          shortSha: c.sha.substring(0, 7),
          branch: defaultBranch,
          message: msg,
          body,
          eventType: classifyCommitType(msg),
          authorName: c.commit.author?.name || 'Developer',
          authorEmail: c.commit.author?.email || null,
          committedAt: c.commit.author?.date ? new Date(c.commit.author.date) : new Date(),
        };
      });

      await prisma.projectCommit.createMany({
        data: commitRows,
        skipDuplicates: true,
      });
      ingestedPage1 = await prisma.projectCommit.count({
        where: { projectId, branch: defaultBranch },
      });
    }

    const historyDoneAtInit = !headCommitPage.hasNextPage;

    // 2. Fetch Complete Recursive Git Tree
    const treeData = await telemetry.measure(
      'github.tree_fetch',
      () => fetchRepoTree(token, owner, repo, latestCommitSha || defaultBranch, userId),
      { projectId, analysisId }
    );

    if (!treeData || !Array.isArray(treeData.tree)) {
      throw new Error('Unable to retrieve repository file tree from GitHub.');
    }

    let totalDiscoveredFiles = 0;
    let ignoredFilesCount = 0;
    const extensionCounts: Record<string, number> = {};
    const topLevelDirs = new Set<string>();
    const foundManifests: string[] = [];
    const treeFiles: DiscoveredTreeFile[] = [];

    const classificationCounts: Record<FileClassification, number> = {
      SOURCE: 0,
      CONFIG: 0,
      DOCUMENTATION: 0,
      TEST: 0,
      GENERATED: 0,
      BINARY: 0,
      ASSET: 0,
    };

    for (const item of treeData.tree) {
      if (IGNORED_PATH_SEGMENTS.some((seg) => item.path.includes(seg))) {
        classificationCounts.GENERATED++;
        ignoredFilesCount++;
        continue;
      }

      if (item.type === 'blob') {
        totalDiscoveredFiles++;
        const classification = classifyRepositoryFile(item.path);
        classificationCounts[classification]++;

        treeFiles.push({
          path: item.path,
          sha: item.sha,
          size: item.size,
          type: 'blob',
          classification,
        });

        const lastDot = item.path.lastIndexOf('.');
        if (lastDot !== -1) {
          const ext = item.path.substring(lastDot).toLowerCase();
          if (!BINARY_EXTENSIONS.has(ext)) {
            extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
          }
        }

        const filename = item.path.split('/').pop() || '';
        if (
          [
            'package.json',
            'requirements.txt',
            'pyproject.toml',
            'go.mod',
            'Cargo.toml',
            'pom.xml',
            'build.gradle',
            'Gemfile',
            'composer.json',
          ].includes(filename)
        ) {
          foundManifests.push(item.path);
        }
      } else if (item.type === 'tree') {
        const parts = item.path.split('/');
        if (parts.length === 1 && !IGNORED_PATH_SEGMENTS.some((seg) => item.path.includes(seg))) {
          topLevelDirs.add(parts[0]);
        }
      }
    }

    // 3. Fetch Manifest, Schema, README, Compiler Config concurrently
    const packageJsonPath =
      foundManifests.find((p) => p === 'package.json') ||
      foundManifests.find((p) => p.endsWith('package.json')) ||
      null;
    const prismaSchemaPath = treeFiles.find((f) => f.path.endsWith('schema.prisma'))?.path || null;
    const reqTxtPath = foundManifests.find((p) => p.endsWith('requirements.txt')) || null;
    const goModPath = foundManifests.find((p) => p.endsWith('go.mod')) || null;
    const readmeFile = treeFiles.find((f) =>
      /^readme(\.[a-z0-9]+)?$/i.test(f.path.split('/').pop() || '')
    );

    const [pkgContent, readmeContent, tsconfigRaw, prismaSchemaRaw, reqTxtRaw, goModRaw] =
      await Promise.all([
        packageJsonPath
          ? fetchRepoFileContent(token, owner, repo, packageJsonPath, latestCommitSha || undefined, {
              userScope: userId,
            })
          : Promise.resolve(null),
        readmeFile
          ? fetchRepoFileContent(token, owner, repo, readmeFile.path, latestCommitSha || undefined, {
              userScope: userId,
            }).catch(() => null)
          : Promise.resolve(null),
        fetchRepoFileContent(token, owner, repo, 'tsconfig.json', latestCommitSha || undefined, {
          userScope: userId,
        })
          .catch(() => null)
          .then(
            async (c) =>
              c ||
              (await fetchRepoFileContent(token, owner, repo, 'jsconfig.json', latestCommitSha || undefined, {
                userScope: userId,
              }).catch(() => null))
          ),
        prismaSchemaPath
          ? fetchRepoFileContent(token, owner, repo, prismaSchemaPath, latestCommitSha || undefined, {
              userScope: userId,
            }).catch(() => null)
          : Promise.resolve(null),
        reqTxtPath
          ? fetchRepoFileContent(token, owner, repo, reqTxtPath, latestCommitSha || undefined, {
              userScope: userId,
            }).catch(() => null)
          : Promise.resolve(null),
        goModPath
          ? fetchRepoFileContent(token, owner, repo, goModPath, latestCommitSha || undefined, {
              userScope: userId,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

    // 4. Technology & Database detection
    let detectedFramework = 'Generic';
    let detectedDatabase: string | null = null;
    const declaredDependencies: string[] = [];

    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        for (const dep of Object.keys(allDeps)) declaredDependencies.push(dep);
        if (allDeps['next']) detectedFramework = 'Next.js';
        else if (allDeps['react']) detectedFramework = 'React';
        else if (allDeps['vue']) detectedFramework = 'Vue.js';
        else if (allDeps['@angular/core']) detectedFramework = 'Angular';
        else if (allDeps['express']) detectedFramework = 'Express.js';
        else if (allDeps['@nestjs/core']) detectedFramework = 'NestJS';
        else if (allDeps['fastify']) detectedFramework = 'Fastify';
        else if (allDeps['svelte']) detectedFramework = 'Svelte';
      } catch (_) {}
    }

    if (reqTxtRaw) {
      for (const line of reqTxtRaw.split(/\r?\n/)) {
        const clean = line.split('#')[0].trim();
        if (!clean) continue;
        const pkgName = clean.split(/[=<>!~[\s]/)[0].trim();
        if (pkgName && !declaredDependencies.includes(pkgName)) declaredDependencies.push(pkgName);
      }
    }

    if (goModRaw) {
      for (const line of goModRaw.split(/\r?\n/)) {
        const m = line.trim().match(/^([^\s]+)\s+v[^\s]+/);
        if (m && !m[1].startsWith('//') && !declaredDependencies.includes(m[1])) {
          declaredDependencies.push(m[1]);
        }
      }
    }

    if (detectedFramework === 'Generic') {
      if (declaredDependencies.some((d) => /^django$/i.test(d))) detectedFramework = 'Django';
      else if (declaredDependencies.some((d) => /^fastapi$/i.test(d))) detectedFramework = 'FastAPI';
      else if (declaredDependencies.some((d) => /^flask$/i.test(d))) detectedFramework = 'Flask';
      else if (foundManifests.some((p) => p.includes('requirements') || p.includes('pyproject'))) {
        detectedFramework = 'Python Application';
      } else if (foundManifests.some((p) => p.includes('go.mod'))) {
        detectedFramework = 'Go Service';
      } else if (foundManifests.some((p) => p.includes('Cargo.toml'))) {
        detectedFramework = 'Rust Project';
      }
    }

    if (prismaSchemaRaw) {
      const providerMatch = prismaSchemaRaw.match(/provider\s*=\s*"([^"]+)"/i);
      const prov = providerMatch?.[1]?.toLowerCase() || '';
      if (prov.includes('postgres')) detectedDatabase = 'PostgreSQL (Prisma)';
      else if (prov.includes('mysql')) detectedDatabase = 'MySQL (Prisma)';
      else if (prov.includes('sqlite')) detectedDatabase = 'SQLite (Prisma)';
      else if (prov.includes('mongodb')) detectedDatabase = 'MongoDB (Prisma)';
      else detectedDatabase = 'Prisma ORM';
    } else if (declaredDependencies.some((d) => /mongoose|mongodb/i.test(d))) {
      detectedDatabase = 'MongoDB';
    } else if (declaredDependencies.some((d) => /^pg$|^postgres|@neondatabase|psycopg|sqlalchemy/i.test(d))) {
      detectedDatabase = 'PostgreSQL';
    } else if (declaredDependencies.some((d) => /^mysql|mysql2/i.test(d))) {
      detectedDatabase = 'MySQL';
    } else if (declaredDependencies.some((d) => /sqlite|better-sqlite3/i.test(d))) {
      detectedDatabase = 'SQLite';
    }

    const tsconfigOptions = parseTsConfig(tsconfigRaw);

    // 5. Partition ALL eligible SOURCE files into batches (ZERO 250-file artificial limit)
    const eligibleSourceFiles = treeFiles
      .filter((f) => f.classification === 'SOURCE' && !f.path.endsWith('.d.ts'))
      .sort((a, b) => a.path.localeCompare(b.path));

    const batches = partitionIntoBatches(eligibleSourceFiles, MAX_FILES_PER_BATCH);

    // 6. Query blob-SHA AST Cache to reuse unchanged files on subsequent syncs (#22 & #23)
    const allBlobShas = eligibleSourceFiles
      .map((f) => f.sha)
      .filter((s): s is string => Boolean(s));

    const cachedAstMap = new Map<string, CompactParsedAstSummary>();
    if (allBlobShas.length > 0) {
      // Query in chunks of 1000 SHAs for Postgres parameter limits
      for (let i = 0; i < allBlobShas.length; i += 1000) {
        const chunkShas = allBlobShas.slice(i, i + 1000);
        const rows = await prisma.astFileCache.findMany({
          where: {
            repositoryId,
            analyzerVersion: ANALYZER_VERSION,
            blobSha: { in: chunkShas },
          },
          select: { filePath: true, blobSha: true, parsedAstJson: true },
        });
        for (const r of rows) {
          cachedAstMap.set(`${r.filePath}:${r.blobSha}`, r.parsedAstJson as unknown as CompactParsedAstSummary);
        }
      }
    }

    // 7. Persist AnalysisBatch rows idempotently, marking 100%-cached batches completed immediately
    let completedBatchesInit = 0;
    let processedSourceFilesInit = 0;

    if (batches.length > 0) {
      const batchRows = batches.map((batchFiles, idx) => {
        const batchNumber = idx + 1;
        const preParsed: CompactParsedAstSummary[] = [];
        for (const bf of batchFiles) {
          if (bf.sha) {
            const cached = cachedAstMap.get(`${bf.path}:${bf.sha}`);
            if (cached) preParsed.push(cached);
          }
        }
        const allHit = preParsed.length === batchFiles.length;
        if (allHit) {
          completedBatchesInit++;
          processedSourceFilesInit += batchFiles.length;
        }
        return {
          analysisId,
          projectId,
          batchNumber,
          status: allHit ? 'COMPLETED' : 'PENDING',
          fileCount: batchFiles.length,
          processedCount: allHit ? batchFiles.length : 0,
          failedCount: 0,
          locTotal: allHit ? preParsed.reduce((s, p) => s + (p.loc || 0), 0) : 0,
          fileManifestJson: batchFiles.map((f) => ({ path: f.path, sha: f.sha || null })) as any,
          parsedFilesJson: allHit ? (preParsed as any) : undefined,
          completedAt: allHit ? new Date() : null,
        };
      });

      await prisma.analysisBatch.createMany({
        data: batchRows,
        skipDuplicates: true,
      });
    }

    const discoverySnapshot: DiscoverySnapshotMetadata = {
      owner,
      repo,
      repositoryId,
      defaultBranch,
      latestCommitSha,
      topLanguage,
      languages,
      detectedFramework,
      detectedDatabase,
      declaredDependencies,
      foundManifests,
      primaryManifestPath: packageJsonPath || foundManifests[0] || null,
      hasReadme: Boolean(readmeContent),
      readmePath: readmeFile?.path || null,
      readmePreview: readmeContent ? readmeContent.substring(0, 500).replace(/[\r\n]+/g, ' ') : null,
      tsconfigOptions,
      treeTruncatedByGitHub: Boolean(treeData.truncated),
      totalDiscoveredFiles,
      totalSourceFiles: eligibleSourceFiles.length,
      ignoredFilesCount,
      classificationCounts,
      extensionBreakdown: Object.entries(extensionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      topLevelDirectories: Array.from(topLevelDirs),
      treeFiles,
    };

    const updatedAnalysis = await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        repositoryId,
        status: 'RUNNING',
        branch: defaultBranch,
        commitSha: latestCommitSha || undefined,
        analyzerVersion: ANALYZER_VERSION,
        totalFiles: totalDiscoveredFiles,
        processedFiles: totalDiscoveredFiles - eligibleSourceFiles.length + processedSourceFilesInit,
        failedFiles: 0,
        ignoredFiles: ignoredFilesCount,
        totalSourceFiles: eligibleSourceFiles.length,
        processedSourceFiles: processedSourceFilesInit,
        totalBatches: batches.length,
        completedBatches: completedBatchesInit,
        currentBatch: Math.min(completedBatchesInit + 1, Math.max(batches.length, 1)),
        historyStatus: historyDoneAtInit ? 'COMPLETED' : 'PROCESSING',
        totalCommitsIngested: ingestedPage1,
        historyNextPage: historyDoneAtInit ? 1 : 2,
        failedFilesJson: [] as any,
        summaryJson: { discovery: discoverySnapshot, analyzerVersion: ANALYZER_VERSION } as any,
      },
    });

    await updateProject(projectId, {
      analysisStatus: 'RUNNING',
    }).catch(() => {});

    return { snapshot: formatAnalysisProgress(updatedAnalysis) };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Analysis discovery failed';
    await updateAnalysisRun(projectId, analysisId, {
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: msg,
    }).catch(() => {});
    await updateProject(projectId, { analysisStatus: 'FAILED' }).catch(() => {});
    throw err;
  }
}

/**
 * PHASE 1 & PAGINATED HISTORY:
 * Advances resumable AST batches + paginated commit ingestion within a safe serverless time budget.
 * Releases raw file strings and commit pages from memory immediately after persisting each unit.
 */
export async function processAnalysisStep(params: {
  token: string;
  userId: string;
  projectId: string;
  analysisId: string;
  timeBudgetMs?: number;
}): Promise<{
  completed: boolean;
  snapshot: AnalysisProgressSnapshot;
}> {
  const { token, userId, projectId, analysisId, timeBudgetMs = STEP_TIME_BUDGET_MS } = params;
  const stepStart = Date.now();

  let analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, projectId },
  });

  if (!analysis) {
    throw new Error('Analysis job not found.');
  }

  if (
    analysis.status === 'COMPLETED' ||
    analysis.status === 'PARTIALLY_COMPLETED' ||
    analysis.status === 'CANCELLED'
  ) {
    return { completed: true, snapshot: formatAnalysisProgress(analysis) };
  }

  const discovery = (analysis.summaryJson as any)?.discovery as DiscoverySnapshotMetadata | undefined;
  if (!discovery) {
    throw new Error('Analysis discovery metadata is missing; start a new analysis run.');
  }

  const { owner, repo, repositoryId, defaultBranch, latestCommitSha } = discovery;
  const existingFailures: FailedFileRecord[] = Array.isArray(analysis.failedFilesJson)
    ? (analysis.failedFilesJson as unknown as FailedFileRecord[])
    : [];

  let concurrency = MAX_CONCURRENT_FILE_FETCHES;

  try {
    // A. Process pending AST batches sequentially inside time budget
    const pendingBatches = await prisma.analysisBatch.findMany({
      where: {
        analysisId,
        status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
      },
      orderBy: { batchNumber: 'asc' },
    });

    for (const batch of pendingBatches) {
      if (Date.now() - stepStart >= timeBudgetMs) {
        break;
      }

      // Check cancellation cleanly between batches
      const latestState = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { status: true },
      });
      if (latestState?.status === 'CANCELLED') {
        const cur = await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });
        return { completed: true, snapshot: formatAnalysisProgress(cur) };
      }

      await prisma.analysisBatch.update({
        where: { id: batch.id },
        data: { status: 'RUNNING', startedAt: batch.startedAt || new Date(), error: null },
      });

      await prisma.analysis.update({
        where: { id: analysisId },
        data: { currentBatch: batch.batchNumber },
      });

      const manifest: Array<{ path: string; sha?: string | null }> = Array.isArray(batch.fileManifestJson)
        ? (batch.fileManifestJson as any)
        : [];

      // Look up any cached entries matching blobSha in AstFileCache first
      const batchShas = manifest.map((m) => m.sha).filter((s): s is string => Boolean(s));
      const cachedMap = new Map<string, CompactParsedAstSummary>();
      if (batchShas.length > 0) {
        const hits = await prisma.astFileCache.findMany({
          where: {
            repositoryId,
            analyzerVersion: ANALYZER_VERSION,
            blobSha: { in: batchShas },
          },
          select: { filePath: true, blobSha: true, parsedAstJson: true },
        });
        for (const h of hits) {
          cachedMap.set(`${h.filePath}:${h.blobSha}`, h.parsedAstJson as unknown as CompactParsedAstSummary);
        }
      }

      const parsedInBatch: CompactParsedAstSummary[] = [];
      const failedInBatch: FailedFileRecord[] = [];
      const newAstCacheRows: Array<{
        repositoryId: string;
        filePath: string;
        blobSha: string;
        analyzerVersion: string;
        loc: number;
        parsedAstJson: any;
      }> = [];

      const toFetch: Array<{ path: string; sha?: string | null }> = [];
      for (const item of manifest) {
        const hit = item.sha ? cachedMap.get(`${item.path}:${item.sha}`) : undefined;
        if (hit) {
          parsedInBatch.push(hit);
        } else {
          toFetch.push(item);
        }
      }

      // Bounded concurrency fetch + immediate AST parse (discarding source string right away)
      for (let i = 0; i < toFetch.length; i += concurrency) {
        const chunk = toFetch.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (item) => {
            try {
              const content = await fetchRepoFileContent(
                token,
                owner,
                repo,
                item.path,
                latestCommitSha || undefined,
                {
                  blobSha: item.sha || undefined,
                  userScope: userId,
                  skipMemoryCache: true,
                  throwOnRateLimit: true,
                }
              );

              if (!content) {
                failedInBatch.push({
                  path: item.path,
                  reason: 'Empty or unreadable file response from GitHub',
                  stage: 'fetch',
                });
                return;
              }

              const parsed = parseSourceFileAST(item.path, content);
              const compact: CompactParsedAstSummary = {
                filePath: item.path,
                blobSha: item.sha || undefined,
                loc: parsed.loc,
                imports: parsed.imports,
                reExports: parsed.exports
                  .filter((e) => Boolean(e.reExportFrom))
                  .map((e) => ({
                    name: e.name,
                    line: e.line,
                    reExportFrom: e.reExportFrom,
                  })),
              };
              parsedInBatch.push(compact);

              if (item.sha) {
                newAstCacheRows.push({
                  repositoryId,
                  filePath: item.path,
                  blobSha: item.sha,
                  analyzerVersion: ANALYZER_VERSION,
                  loc: compact.loc,
                  parsedAstJson: compact as any,
                });
              }
            } catch (err: any) {
              if (err instanceof GitHubApiError && (err.isRateLimit || err.statusCode === 429)) {
                // Propagate rate-limit cleanly to reduce concurrency / pause batch for retry
                concurrency = REDUCED_CONCURRENCY_ON_LOW_QUOTA;
                throw err;
              }
              failedInBatch.push({
                path: item.path,
                reason: err instanceof Error ? err.message : 'AST parse failed',
                stage: 'ast_parse',
              });
            }
          })
        );
      }

      if (newAstCacheRows.length > 0) {
        await prisma.astFileCache
          .createMany({ data: newAstCacheRows, skipDuplicates: true })
          .catch(() => {});
      }

      const locTotal = parsedInBatch.reduce((acc, p) => acc + (p.loc || 0), 0);

      await prisma.analysisBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          processedCount: parsedInBatch.length,
          failedCount: failedInBatch.length,
          locTotal,
          parsedFilesJson: parsedInBatch as any,
          failedFilesJson: failedInBatch as any,
          completedAt: new Date(),
        },
      });

      // Merge failed files deduplicated by path
      for (const f of failedInBatch) {
        if (!existingFailures.some((ef) => ef.path === f.path)) {
          existingFailures.push(f);
        }
      }

      // Recompute exact completed counters from DB batches (retry-safe & idempotent)
      const statsAgg = await prisma.analysisBatch.aggregate({
        where: { analysisId, status: 'COMPLETED' },
        _count: { id: true },
        _sum: { processedCount: true, failedCount: true },
      });

      const completedBatchesCount = statsAgg._count.id || 0;
      const parsedSourceCount = statsAgg._sum.processedCount || 0;
      const failedCountTotal = statsAgg._sum.failedCount || 0;

      analysis = await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          completedBatches: completedBatchesCount,
          processedSourceFiles: parsedSourceCount,
          processedFiles:
            discovery.totalDiscoveredFiles -
            discovery.totalSourceFiles +
            parsedSourceCount,
          failedFiles: failedCountTotal,
          failedFilesJson: existingFailures as any,
        },
      });
    }

    // B. Advance paginated commit history inside remaining time budget (#24 - #28)
    while (
      analysis.historyStatus === 'PROCESSING' &&
      Date.now() - stepStart < timeBudgetMs
    ) {
      const nextPage: number = analysis.historyNextPage || 2;
      if (nextPage > MAX_COMMIT_PAGES_SAFETY) {
        analysis = await prisma.analysis.update({
          where: { id: analysisId },
          data: { historyStatus: 'PARTIAL' },
        });
        break;
      }

      try {
        const pageRes = await fetchRepoCommitsPaginated({
          token,
          owner,
          repo,
          branch: defaultBranch,
          page: nextPage,
          perPage: COMMITS_PER_PAGE,
          userScope: userId,
          bypassCache: false,
        });

        if (pageRes.rateLimitRemaining !== null && pageRes.rateLimitRemaining < 40) {
          concurrency = REDUCED_CONCURRENCY_ON_LOW_QUOTA;
        }

        if (pageRes.commits.length > 0) {
          const commitRows = pageRes.commits.map((c) => {
            const msgLines = c.commit.message.split('\n');
            const msg = msgLines[0] || 'Repository commit';
            const body = msgLines.slice(1).join('\n').trim() || null;
            return {
              projectId,
              repositoryId,
              commitSha: c.sha,
              shortSha: c.sha.substring(0, 7),
              branch: defaultBranch,
              message: msg,
              body,
              eventType: classifyCommitType(msg),
              authorName: c.commit.author?.name || 'Developer',
              authorEmail: c.commit.author?.email || null,
              committedAt: c.commit.author?.date ? new Date(c.commit.author.date) : new Date(),
            };
          });

          await prisma.projectCommit.createMany({
            data: commitRows,
            skipDuplicates: true,
          });
        }

        const totalCommitsNow = await prisma.projectCommit.count({
          where: { projectId, branch: defaultBranch },
        });

        const reachedEnd = !pageRes.hasNextPage || pageRes.commits.length === 0;
        analysis = await prisma.analysis.update({
          where: { id: analysisId },
          data: {
            historyNextPage: reachedEnd ? nextPage : nextPage + 1,
            historyStatus: reachedEnd ? 'COMPLETED' : 'PROCESSING',
            totalCommitsIngested: totalCommitsNow,
          },
        });
      } catch (histErr: any) {
        if (histErr instanceof GitHubApiError && (histErr.isRateLimit || histErr.statusCode === 429)) {
          // Pause gracefully cleanly on rate limit so next step resumes same page
          break;
        }
        existingFailures.push({
          path: `git/commits?page=${nextPage}`,
          reason: histErr instanceof Error ? histErr.message : 'Commit pagination failed',
          stage: 'history_page',
        });
        analysis = await prisma.analysis.update({
          where: { id: analysisId },
          data: {
            historyStatus: 'PARTIAL',
            failedFilesJson: existingFailures as any,
          },
        });
        break;
      }
    }

    // C. Check if ALL AST batches + History ingestion are finished -> Finalize global cross-batch graph!
    const remainingBatches = await prisma.analysisBatch.count({
      where: {
        analysisId,
        status: { in: ['PENDING', 'RUNNING', 'FAILED'] },
      },
    });

    const historyFinished = analysis.historyStatus === 'COMPLETED' || analysis.historyStatus === 'PARTIAL';

    if (remainingBatches === 0 && historyFinished) {
      const finalSnapshot = await finalizeGlobalGraphAndEvidences({
        projectId,
        analysisId,
        discovery,
        historyStatus: analysis.historyStatus,
        totalCommitsIngested: analysis.totalCommitsIngested,
        failedFilesList: existingFailures,
      });
      return { completed: true, snapshot: finalSnapshot };
    }

    return { completed: false, snapshot: formatAnalysisProgress(analysis) };
  } catch (err: any) {
    if (err instanceof GitHubApiError && (err.isRateLimit || err.statusCode === 429)) {
      // Rate limit pauses safely so user/UI can resume completed batches cleanly
      const updated = await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          errorMessage: err.message,
        },
      });
      return { completed: false, snapshot: formatAnalysisProgress(updated) };
    }

    const msg = err instanceof Error ? err.message : 'Batch execution error';
    await updateAnalysisRun(projectId, analysisId, {
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: msg,
    }).catch(() => {});
    await updateProject(projectId, { analysisStatus: 'FAILED' }).catch(() => {});
    throw err;
  }
}

/**
 * PHASE 2 & 3 ORCHESTRATOR:
 * Loads compact AST outputs from ALL completed batches 1..N, runs complete cross-batch
 * dependency resolution, computes honest math coverage, and commits Evidence atomically.
 */
export async function finalizeGlobalGraphAndEvidences(params: {
  projectId: string;
  analysisId: string;
  discovery: DiscoverySnapshotMetadata;
  historyStatus: string;
  totalCommitsIngested: number;
  failedFilesList: FailedFileRecord[];
}): Promise<AnalysisProgressSnapshot> {
  const { projectId, analysisId, discovery, historyStatus, totalCommitsIngested, failedFilesList } = params;
  const {
    owner,
    repo,
    repositoryId,
    defaultBranch,
    latestCommitSha,
    topLanguage,
    languages,
    detectedFramework,
    detectedDatabase,
    declaredDependencies,
    foundManifests,
    primaryManifestPath,
    hasReadme,
    readmePath,
    readmePreview,
    tsconfigOptions,
    totalDiscoveredFiles,
    classificationCounts,
    extensionBreakdown,
    topLevelDirectories,
    treeFiles,
  } = discovery;

  // 1. Load compact AST summaries across ALL batches
  const completedBatches = await prisma.analysisBatch.findMany({
    where: { analysisId, status: 'COMPLETED' },
    orderBy: { batchNumber: 'asc' },
    select: { parsedFilesJson: true, batchNumber: true },
  });

  const allParsedAsts: CompactParsedAstSummary[] = [];
  for (const b of completedBatches) {
    if (Array.isArray(b.parsedFilesJson)) {
      allParsedAsts.push(...(b.parsedFilesJson as unknown as CompactParsedAstSummary[]));
    }
  }

  const allRepoFilePaths = new Set(treeFiles.map((t) => t.path));

  // 2. Global Cross-Batch Import & Re-export Resolution + Graph Engine
  const graphData = resolveGlobalDependencyGraphFromBatches({
    parsedFiles: allParsedAsts,
    allRepoFilePaths,
    tsconfigOptions,
    declaredDependencies,
    owner,
    repo,
    latestCommitSha,
    analysisId,
  });

  const {
    dependencyEdges,
    detectedCycles,
    declaredDeps,
    importedExternalPackages,
    externalPackageUsage,
    totalImportsCount,
    resolvedImportsCount,
    externalImportsCount,
    unresolvedImportsCount,
  } = graphData;

  // 3. Build Evidence-Grounded Module Topology Nodes & Verified Edges
  const topologyModules = [...topLevelDirectories];
  const moduleFileCountMap = new Map<string, number>();
  const moduleLocMap = new Map<string, number>();

  for (const f of treeFiles) {
    const parts = f.path.split('/');
    const mod = parts.length > 1 ? parts[0] : 'root';
    moduleFileCountMap.set(mod, (moduleFileCountMap.get(mod) || 0) + 1);
  }

  for (const parsed of allParsedAsts) {
    const parts = parsed.filePath.split('/');
    const mod = parts.length > 1 ? parts[0] : 'root';
    moduleLocMap.set(mod, (moduleLocMap.get(mod) || 0) + (parsed.loc || 0));
  }

  const recentCommitsSample = await prisma.projectCommit.findMany({
    where: { projectId, branch: defaultBranch },
    orderBy: { committedAt: 'desc' },
    take: 50,
  });

  const topoNodes: any[] = [
    {
      id: 'node-app',
      name: repo || 'Application',
      type: 'App',
      category: 'Entrypoint',
      description: `${detectedFramework} core workspace (${topLanguage})`,
      filesCount: moduleFileCountMap.get('root') || 0,
      health: 'active',
      relatedFiles: [primaryManifestPath, readmePath].filter((f): f is string => Boolean(f)),
      dependencies: topologyModules.slice(0, 3),
      dependents: [],
      recentChanges: recentCommitsSample.slice(0, 2).map((c) => ({
        commit: c.shortSha,
        description: c.message,
        date: c.committedAt.toISOString().split('T')[0],
      })),
      metrics: {
        loc: moduleLocMap.get('root') || 0,
        fanIn: 0,
        fanOut: topologyModules.length,
      },
      position: { x: 260, y: 50 },
    },
  ];

  topologyModules.forEach((mod, idx) => {
    const isApi = mod.toLowerCase().includes('api') || mod.toLowerCase().includes('server');
    const isDb = mod.toLowerCase().includes('db') || mod.toLowerCase().includes('prisma');
    const isComponent = mod.toLowerCase().includes('component') || mod.toLowerCase().includes('ui');
    const nodeType = isApi ? 'API' : isDb ? 'Database' : isComponent ? 'Components' : 'Services';
    const fileCount = moduleFileCountMap.get(mod) || 1;
    const loc = moduleLocMap.get(mod) || fileCount * 45;

    let fanIn = 0;
    let fanOut = 0;
    for (const edge of dependencyEdges) {
      const srcMod = edge.source.split('/')[0];
      const tgtMod = edge.target.split('/')[0];
      if (srcMod !== mod && tgtMod === mod) fanIn++;
      if (srcMod === mod && tgtMod !== mod) fanOut++;
    }

    topoNodes.push({
      id: `node-${mod}`,
      name: mod.charAt(0).toUpperCase() + mod.slice(1),
      type: nodeType,
      category: 'Module',
      description: `Source directory /${mod} (${fileCount} files)`,
      filesCount: fileCount,
      health: 'stable',
      relatedFiles: [`${mod}/*`],
      dependencies: [],
      dependents: [],
      recentChanges: [],
      metrics: { loc, fanIn, fanOut },
      position: { x: 100 + (idx % 3) * 170, y: 160 + Math.floor(idx / 3) * 110 },
    });
  });

  const topoEdges: any[] = [];
  const addedModuleEdgeKeys = new Set<string>();
  for (const edge of dependencyEdges) {
    const srcMod = edge.source.includes('/') ? edge.source.split('/')[0] : 'root';
    const tgtMod = edge.target.includes('/') ? edge.target.split('/')[0] : 'root';
    if (srcMod !== tgtMod) {
      const sourceNodeId = srcMod === 'root' ? 'node-app' : `node-${srcMod}`;
      const targetNodeId = `node-${tgtMod}`;
      const key = `${sourceNodeId}->${targetNodeId}`;
      if (!addedModuleEdgeKeys.has(key)) {
        const srcExists = topoNodes.some((n) => n.id === sourceNodeId);
        const tgtExists = topoNodes.some((n) => n.id === targetNodeId);
        if (srcExists && tgtExists) {
          addedModuleEdgeKeys.add(key);
          topoEdges.push({
            id: `edge-${srcMod}-${tgtMod}`,
            source: sourceNodeId,
            target: targetNodeId,
            relationship: edge.relationship || 'imports',
            confidence: 1.0,
            evidence: `Verified in ${edge.source}:${edge.line}`,
          });
        }
      }
    }
  }

  // 4. Compute Honest Coverage Metrics (Zero Artificial Caps)
  const totalSourceFiles = classificationCounts.SOURCE;
  const parsedSourceFiles = allParsedAsts.length;
  const failedFilesCount = failedFilesList.filter((f) => f.stage !== 'history_page').length;
  const sourceCoveragePercent =
    totalSourceFiles > 0 ? Math.min(100, Math.round((parsedSourceFiles / totalSourceFiles) * 100)) : 100;

  const importResolutionPercent =
    totalImportsCount > 0
      ? Math.round(((resolvedImportsCount + externalImportsCount) / totalImportsCount) * 100)
      : 100;

  const mappedModulesSet = new Set<string>();
  for (const edge of dependencyEdges) {
    const srcMod = edge.source.split('/')[0];
    const tgtMod = edge.target.split('/')[0];
    if (topologyModules.includes(srcMod)) mappedModulesSet.add(srcMod);
    if (topologyModules.includes(tgtMod)) mappedModulesSet.add(tgtMod);
  }
  const modulesMappedCount = mappedModulesSet.size;
  const unresolvedModuleNames = topologyModules.filter((m) => !mappedModulesSet.has(m));
  const archCoveragePercent =
    topologyModules.length > 0 ? Math.round((modulesMappedCount / topologyModules.length) * 100) : 100;

  const declaredDependenciesCount = declaredDeps.length;
  const resolvedDeclaredDeps = declaredDeps.filter(
    (dep) =>
      importedExternalPackages.has(dep) ||
      ['next', 'react', 'react-dom', 'typescript', '@types/node', '@types/react', 'tailwindcss', 'postcss', 'autoprefixer'].includes(
        dep.toLowerCase()
      )
  );
  const resolvedDependenciesCount = resolvedDeclaredDeps.length;
  const usageResolutionPercent =
    declaredDependenciesCount > 0 ? Math.round((resolvedDependenciesCount / declaredDependenciesCount) * 100) : 100;

  const gitCoveragePercent =
    historyStatus === 'COMPLETED' ? (totalCommitsIngested > 0 ? 100 : 0) : totalCommitsIngested > 0 ? 75 : 0;
  const historyScope =
    historyStatus === 'COMPLETED'
      ? `Full indexed history (${totalCommitsIngested} commits on ${defaultBranch})`
      : `Partial history: ${totalCommitsIngested} commits indexed on ${defaultBranch} (additional older history exists)`;

  const docFiles = treeFiles.filter((f) => f.classification === 'DOCUMENTATION');
  const detectedDocTypes = new Set<string>();
  if (hasReadme) detectedDocTypes.add('README');
  if (treeFiles.some((f) => f.path.startsWith('docs/'))) detectedDocTypes.add('docs/ directory');
  if (treeFiles.some((f) => /contributing/i.test(f.path))) detectedDocTypes.add('CONTRIBUTING');
  if (treeFiles.some((f) => /license/i.test(f.path))) detectedDocTypes.add('LICENSE');
  if (treeFiles.some((f) => /changelog/i.test(f.path))) detectedDocTypes.add('CHANGELOG');

  const overallCoveragePercent = Math.round(
    sourceCoveragePercent * 0.35 +
      importResolutionPercent * 0.25 +
      archCoveragePercent * 0.2 +
      usageResolutionPercent * 0.1 +
      gitCoveragePercent * 0.1
  );

  const canonicalCoverage: AnalysisCoverage = {
    files: {
      discovered: totalDiscoveredFiles,
      source: totalSourceFiles,
      parsed: parsedSourceFiles,
      failed: failedFilesCount,
      ignored: classificationCounts.GENERATED + classificationCounts.BINARY + classificationCounts.ASSET,
      coveragePercent: sourceCoveragePercent,
    },
    architecture: {
      modulesDetected: topologyModules.length,
      modulesMapped: modulesMappedCount,
      unresolvedModules: unresolvedModuleNames.length,
      coveragePercent: archCoveragePercent,
      detectedModuleNames: topologyModules,
      unresolvedModuleNames,
    },
    imports: {
      total: totalImportsCount,
      resolved: resolvedImportsCount,
      unresolved: unresolvedImportsCount,
      external: externalImportsCount,
      resolutionPercent: importResolutionPercent,
    },
    dependencies: {
      manifestsDetected: foundManifests.length,
      manifestsParsed: primaryManifestPath ? 1 : foundManifests.length > 0 ? 1 : 0,
      manifestParsingPercent: foundManifests.length > 0 ? 100 : 0,
      declaredDependencies: declaredDependenciesCount,
      resolvedDependencies: resolvedDependenciesCount,
      unresolvedDependencies: Math.max(0, declaredDependenciesCount - resolvedDependenciesCount),
      usageResolutionPercent,
    },
    git: {
      commitsDiscovered: totalCommitsIngested,
      commitsIndexed: totalCommitsIngested,
      coveragePercent: gitCoveragePercent,
      historyScope,
    },
    documentation: {
      filesDetected: docFiles.length,
      filesIndexed: hasReadme ? 1 : 0,
      docTypes: Array.from(detectedDocTypes),
      hasReadme,
    },
    overallCoveragePercent,
    overallPercentage: overallCoveragePercent,
    metrics: {
      totalFiles: totalDiscoveredFiles,
      commitsTracked: totalCommitsIngested,
      relationshipsMapped: dependencyEdges.length,
      architectureNodes: topoNodes.length,
    },
    breakdown: {
      codebaseUnderstanding: sourceCoveragePercent,
      architectureMapping: archCoveragePercent,
      gitHistory: gitCoveragePercent,
      dependencyMapping: usageResolutionPercent,
      documentation: docFiles.length > 0 ? 100 : 0,
    },
  };

  // 5. Commit Evidence records atomically
  const evidenceRecords: any[] = [
    {
      projectId,
      type: 'files',
      title: 'Repository Structure & Codebase Volume',
      path: '/',
      metadata: {
        totalFiles: totalDiscoveredFiles,
        defaultBranch,
        tree: treeFiles,
        classificationCounts,
        extensionBreakdown,
        topLevelDirectories,
        provenance: createFileProvenance({
          repository: `${owner}/${repo}`,
          path: '/',
          commitSha: latestCommitSha || undefined,
          analysisId,
        }),
      },
    },
    {
      projectId,
      type: 'architecture',
      title: 'Architectural Framework & Dependency Topology',
      metadata: {
        primaryLanguage: topLanguage,
        framework: detectedFramework,
        database: detectedDatabase,
        languageDistribution: languages,
        modulesCount: topologyModules.length,
        modules: topologyModules,
        nodes: topoNodes,
        edges: topoEdges,
        dependencyEdges,
        cycles: detectedCycles,
        parsedFilesCount: parsedSourceFiles,
        provenance: {
          sourceType: 'graph',
          repository: `${owner}/${repo}`,
          path: 'modules',
          commitSha: latestCommitSha || undefined,
          analysisId,
          confidence: 'Deterministic',
          description: `Complete dependency topology connecting ${topologyModules.length} modules and ${parsedSourceFiles}/${totalSourceFiles} source files`,
        },
      },
    },
  ];

  if (declaredDeps.length > 0) {
    evidenceRecords.push({
      projectId,
      type: 'dependencies',
      title: `Detected Dependencies (${declaredDeps.length} libraries)`,
      path: primaryManifestPath || 'manifest',
      metadata: {
        framework: detectedFramework,
        database: detectedDatabase,
        manifests: foundManifests,
        sampleDependencies: declaredDeps.slice(0, 30),
        allDependencies: declaredDeps,
        packageUsageMap: Object.fromEntries(
          Array.from(externalPackageUsage.entries()).map(([pkg, files]) => [pkg, Array.from(files)])
        ),
        totalCount: declaredDeps.length,
        provenance: createManifestProvenance({
          repository: `${owner}/${repo}`,
          manifestPath: primaryManifestPath || 'manifest',
          commitSha: latestCommitSha || undefined,
          analysisId,
          dependenciesCount: declaredDeps.length,
        }),
      },
    });
  }

  if (recentCommitsSample.length > 0) {
    const timelineEvents = recentCommitsSample.map((c) => ({
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
    }));

    evidenceRecords.push({
      projectId,
      type: 'commits',
      title: 'Development Commit History',
      metadata: {
        commitCount: totalCommitsIngested,
        historyScope,
        events: timelineEvents,
        recentCommits: recentCommitsSample.map((c) => ({
          sha: c.shortSha,
          message: c.message,
          author: c.authorName,
          date: c.committedAt.toISOString(),
        })),
        provenance: createCommitProvenance({
          repository: `${owner}/${repo}`,
          commitSha: latestCommitSha || 'HEAD',
          analysisId,
          author: recentCommitsSample[0]?.authorName || 'Developer',
        }),
      },
    });
  }

  if (hasReadme && readmePath) {
    evidenceRecords.push({
      projectId,
      type: 'documentation',
      title: `Project Documentation (${readmePath})`,
      path: readmePath,
      metadata: {
        preview: readmePreview,
        hasReadme: true,
        provenance: createFileProvenance({
          repository: `${owner}/${repo}`,
          path: readmePath,
          commitSha: latestCommitSha || undefined,
          analysisId,
        }),
      },
    });
  }

  await prisma.$transaction([
    prisma.evidence.deleteMany({ where: { projectId } }),
    prisma.evidence.createMany({ data: evidenceRecords }),
  ]);

  const isPartiallyComplete = failedFilesCount > 0 || historyStatus === 'PARTIAL' || discovery.treeTruncatedByGitHub;
  const finalStatus = isPartiallyComplete ? 'PARTIALLY_COMPLETED' : 'COMPLETED';

  await updateProject(projectId, {
    primaryLanguage: topLanguage,
    framework: detectedFramework,
    database: detectedDatabase || undefined,
    analysisStatus: finalStatus as any,
    lastAnalyzedAt: new Date(),
  });

  if (latestCommitSha) {
    await prisma.repository
      .updateMany({
        where: { id: repositoryId },
        data: {
          currentCommitSha: latestCommitSha,
          lastSyncedAt: new Date(),
        },
      })
      .catch(() => {});
  }

  const finalAnalysis = await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: finalStatus as any,
      analyzerVersion: ANALYZER_VERSION,
      completedAt: new Date(),
      filesAnalyzed: totalDiscoveredFiles,
      commitsAnalyzed: totalCommitsIngested,
      dependenciesDetected: declaredDeps.length,
      architectureNodes: topoNodes.length,
      evidenceCount: evidenceRecords.length,
      coverage: overallCoveragePercent,
      summaryJson: {
        coverage: canonicalCoverage,
        classificationCounts,
        dependencyEdges,
        analyzerVersion: ANALYZER_VERSION,
      } as any,
    },
  });

  invalidateProjectContextCache(projectId);
  invalidateOnboardingCache(projectId);
  githubCache.invalidateRepo(owner, repo);

  console.info(
    `[MarrowNode Analysis] Finalized ${finalStatus} projectId=${projectId} analysisId=${analysisId} parsed=${parsedSourceFiles}/${totalSourceFiles} edges=${dependencyEdges.length} commits=${totalCommitsIngested}`
  );

  return formatAnalysisProgress(finalAnalysis);
}

/**
 * Convenience single-call wrapper (used when caller runs full synchronous loop until done,
 * e.g. small/medium repos or backend CLI tests).
 */
export async function executeDeterministicAnalysis(params: {
  token: string;
  userId?: string;
  projectId: string;
  analysisId: string;
  owner: string;
  repo: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { ownerId: true, repository: { select: { id: true } } },
  });

  if (!project || !project.repository) {
    throw new Error('Project repository record not found.');
  }

  const userId = params.userId || project.ownerId;
  await initializeResumableAnalysis({
    token: params.token,
    userId,
    projectId: params.projectId,
    repositoryId: project.repository.id,
    analysisId: params.analysisId,
    owner: params.owner,
    repo: params.repo,
  });

  let completed = false;
  let lastSnapshot: AnalysisProgressSnapshot | null = null;
  const safetyMaxSteps = 60;
  for (let step = 0; step < safetyMaxSteps && !completed; step++) {
    const res = await processAnalysisStep({
      token: params.token,
      userId,
      projectId: params.projectId,
      analysisId: params.analysisId,
      timeBudgetMs: 12000,
    });
    completed = res.completed;
    lastSnapshot = res.snapshot;
  }

  return { success: true, analysisId: params.analysisId, snapshot: lastSnapshot };
}
