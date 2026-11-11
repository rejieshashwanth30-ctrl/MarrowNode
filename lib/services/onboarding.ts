import { prisma } from '@/lib/prisma';
import { getOrCreateCurrentProfile } from '@/lib/auth';
import { telemetry } from '@/lib/observability/timing';
import { DependencyGraphEngine, type DependencyEdge } from '@/lib/analysis/graph-engine';
import type { FileClassification } from '@/lib/github/analysis';
import {
  getProjectWorkstationContext,
  type ProjectWorkstationContext,
} from '@/lib/services/project-context';

export type EpistemicClass = 'FACT' | 'INFERENCE' | 'UNKNOWN';

export interface OnboardingEvidenceRef {
  path: string;
  label: string;
  type: 'file' | 'commit' | 'edge' | 'manifest' | 'coverage';
  view: 'explorer' | 'architecture' | 'timeline' | 'impact' | 'evidence';
}

export interface OnboardingSnapshotBanner {
  analysisId: string | null;
  commitSha: string | null;
  commitShort: string | null;
  branch: string;
  analyzedAt: string | null;
  freshness: 'CURRENT' | 'STALE' | 'ANALYZING' | 'PARTIAL' | 'FAILED';
  overallCoveragePercent: number;
  sourceFilesTotal: number;
  sourceFilesParsed: number;
  sourceCoveragePercent: number;
  failedFilesCount: number;
  unresolvedImportsCount: number;
  isPartial: boolean;
  isStale: boolean;
  noticeTitle: string;
  noticeMessage: string;
  confidenceMode: EpistemicClass;
}

export interface OnboardingProjectGlance {
  projectId: string;
  name: string;
  fullName: string;
  repositoryUrl: string;
  visibility: string;
  defaultBranch: string;
  primaryLanguage: string;
  framework: string;
  description: string | null;
  readmePreview: string | null;
  readmePath: string | null;
  hasReadme: boolean;
  repoScaleLabel: 'Small' | 'Medium' | 'Large';
  counts: {
    totalFiles: number;
    sourceFiles: number;
    parsedSourceFiles: number;
    testFiles: number;
    configFiles: number;
    documentationFiles: number;
    commitsTracked: number;
    relationshipsMapped: number;
    dependenciesDetected: number;
  };
  stars: number;
}

export interface OnboardingStructureArea {
  id: string;
  name: string;
  path: string;
  nodeType: string;
  roleDescription: string;
  confidence: 'Verified' | 'Inferred';
  fileCount: number;
  loc: number;
  fanIn: number;
  fanOut: number;
  sampleFiles: string[];
  connectedTo: string[];
  connectedFrom: string[];
}

export interface OnboardingStartStep {
  stepNumber: number;
  title: string;
  filePath: string;
  reason: string;
  category: string;
  confidence: EpistemicClass;
  targetView: 'explorer' | 'architecture' | 'evidence';
}

export interface OnboardingImportantFile {
  path: string;
  category:
    | 'Entrypoint'
    | 'Core Hub'
    | 'Data & Schema'
    | 'Auth & Security'
    | 'Configuration'
    | 'API Surface'
    | 'Documentation';
  fanIn: number;
  fanOut: number;
  directAffectedCount: number;
  transitiveAffectedCount: number;
  impactLevel: 'ISOLATED' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  reasons: string[];
  score: number;
  confidence: EpistemicClass;
}

export interface OnboardingTechItem {
  name: string;
  category: 'Language' | 'Framework & UI' | 'Data & Storage' | 'Auth & Security' | 'Tooling & Infra' | 'Library';
  confidence: 'Verified' | 'Inferred';
  evidenceSource: string;
}

export interface OnboardingFlowAnalysis {
  status: 'DETECTED' | 'NONE_DETECTED';
  summary: string;
  confidence: EpistemicClass;
  detectedLibraries: string[];
  keyFiles: Array<{ path: string; role: string }>;
  consumerFiles: string[];
  observations: string[];
  caveats: string[];
}

export interface OnboardingExternalService {
  name: string;
  purpose: string;
  confidence: 'Verified' | 'Inferred';
  evidenceSource: string;
}

export interface OnboardingRecentCommit {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  title: string;
  type: 'feature' | 'database' | 'security' | 'refactor' | 'milestone';
}

export interface OnboardingAttentionItem {
  id: string;
  title: string;
  kind: 'High Impact Area' | 'Cycle Detected' | 'Coverage Limitation' | 'Needs Investigation';
  targetPath: string;
  description: string;
  recommendation: string;
  confidence: EpistemicClass;
  targetView: 'explorer' | 'architecture' | 'impact' | 'evidence';
}

export interface DeveloperOnboardingReport {
  projectId: string;
  generatedAt: string;
  cached: boolean;
  snapshot: OnboardingSnapshotBanner;
  glance: OnboardingProjectGlance;
  structure: {
    areas: OnboardingStructureArea[];
    verifiedRelationships: Array<{
      from: string;
      to: string;
      relationship: string;
      evidence?: string;
    }>;
    topLevelDirectories: string[];
  };
  startHere: OnboardingStartStep[];
  importantFiles: OnboardingImportantFile[];
  technologies: {
    items: OnboardingTechItem[];
    manifests: string[];
    languages: Array<{ name: string; sharePercent: number; bytes: number }>;
  };
  authFlow: OnboardingFlowAnalysis;
  dataFlow: OnboardingFlowAnalysis;
  externalServices: OnboardingExternalService[];
  recentDevelopment: {
    commitsCount: number;
    historyScope: string;
    commits: OnboardingRecentCommit[];
    dominantFocus: string | null;
  };
  attentionAreas: OnboardingAttentionItem[];
  epistemicSummary: {
    facts: Array<{ statement: string; refs: OnboardingEvidenceRef[] }>;
    inferences: Array<{ statement: string; refs: OnboardingEvidenceRef[] }>;
    unknowns: Array<{ statement: string; refs: OnboardingEvidenceRef[] }>;
  };
  evidenceIndex: OnboardingEvidenceRef[];
}

const onboardingCache = new Map<
  string,
  { report: DeveloperOnboardingReport; timestamp: number }
>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function invalidateOnboardingCache(projectId?: string): void {
  if (!projectId) {
    onboardingCache.clear();
    return;
  }
  for (const key of Array.from(onboardingCache.keys())) {
    if (key.includes(`:${projectId}:`)) {
      onboardingCache.delete(key);
    }
  }
}

export interface RawEvidenceExtract {
  tree: Array<{ path: string; size?: number; type?: string; classification: FileClassification }>;
  classificationCounts: Record<FileClassification, number>;
  dependencyEdges: DependencyEdge[];
  cycles: string[][];
  languageDistribution: Record<string, number>;
  manifests: string[];
  declaredDependencies: string[];
  readmePreview: string | null;
  readmePath: string | null;
  commits: OnboardingRecentCommit[];
}

async function extractRawEvidence(
  projectId: string,
  context: ProjectWorkstationContext
): Promise<RawEvidenceExtract> {
  const evidences = await prisma.evidence.findMany({
    where: { projectId },
    select: { type: true, path: true, metadata: true },
  });

  const filesEv = evidences.find((e) => e.type === 'files');
  const archEv = evidences.find((e) => e.type === 'architecture');
  const depsEv = evidences.find((e) => e.type === 'dependencies');
  const docsEv = evidences.find((e) => e.type === 'documentation');
  const commitsEv = evidences.find((e) => e.type === 'commits');

  const filesMeta = (filesEv?.metadata as any) || {};
  const archMeta = (archEv?.metadata as any) || {};
  const depsMeta = (depsEv?.metadata as any) || {};
  const docsMeta = (docsEv?.metadata as any) || {};
  const commitsMeta = (commitsEv?.metadata as any) || {};

  // Reconstruct flat blob tree preferring full Evidence tree when available
  const rawTree: Array<{ path: string; size?: number; type?: string; classification: FileClassification }> =
    Array.isArray(filesMeta.tree) ? filesMeta.tree : [];

  const classificationCounts: Record<FileClassification, number> = {
    SOURCE: context.coverage?.files?.source || 0,
    CONFIG: 0,
    DOCUMENTATION: context.coverage?.documentation?.filesDetected || 0,
    TEST: 0,
    GENERATED: context.coverage?.files?.ignored || 0,
    BINARY: 0,
    ASSET: 0,
    ...(filesMeta.classificationCounts || {}),
  };

  const dependencyEdges: DependencyEdge[] = Array.isArray(archMeta.dependencyEdges)
    ? archMeta.dependencyEdges
    : [];

  const cycles: string[][] = Array.isArray(archMeta.cycles) ? archMeta.cycles : [];
  const languageDistribution: Record<string, number> =
    (archMeta.languageDistribution as Record<string, number>) || {};

  const manifests: string[] = Array.isArray(depsMeta.manifests) ? depsMeta.manifests : [];
  const declaredDependencies: string[] = Array.isArray(depsMeta.allDependencies)
    ? depsMeta.allDependencies
    : Array.isArray(depsMeta.sampleDependencies)
    ? depsMeta.sampleDependencies
    : context.dependencies;

  const commits: OnboardingRecentCommit[] = Array.isArray(commitsMeta.events)
    ? commitsMeta.events.map((ev: any) => ({
        sha: ev.commitHash || ev.sha || '',
        shortSha: ev.commitShort || (ev.commitHash ? String(ev.commitHash).slice(0, 7) : 'commit'),
        date: ev.date || '',
        author: ev.author?.name || 'Developer',
        title: ev.title || 'Repository update',
        type: ev.type || 'feature',
      }))
    : context.timeline.map((t) => ({
        sha: t.commitHash || '',
        shortSha: t.commitShort || (t.commitHash ? t.commitHash.slice(0, 7) : 'commit'),
        date: t.date || '',
        author: t.author?.name || 'Developer',
        title: t.title,
        type: t.type,
      }));

  return {
    tree: rawTree,
    classificationCounts,
    dependencyEdges,
    cycles,
    languageDistribution,
    manifests,
    declaredDependencies,
    readmePreview: typeof docsMeta.preview === 'string' ? docsMeta.preview : null,
    readmePath: docsEv?.path || null,
    commits,
  };
}

function classifyTechItem(name: string): OnboardingTechItem['category'] {
  const lower = name.toLowerCase();
  if (
    /^(prisma|@prisma\/client|drizzle|pg|postgres|mysql|sqlite|mongoose|mongodb|redis|ioredis|kysely|typeorm|sequelize|sqlalchemy|alembic)/.test(
      lower
    ) ||
    lower.includes('supabase-js')
  ) {
    return 'Data & Storage';
  }
  if (
    /(auth|oauth|clerk|lucia|jose|jsonwebtoken|passport|bcrypt|argon2|next-auth)/.test(lower) ||
    lower === '@supabase/ssr'
  ) {
    return 'Auth & Security';
  }
  if (
    /^(next|react|react-dom|vue|svelte|@angular|express|fastify|@nestjs|django|flask|fastapi|gin|actix|tailwind)/.test(
      lower
    )
  ) {
    return 'Framework & UI';
  }
  if (
    /(vitest|jest|playwright|cypress|eslint|prettier|typescript|vite|webpack|docker|turbo|postcss|autoprefixer)/.test(
      lower
    )
  ) {
    return 'Tooling & Infra';
  }
  return 'Library';
}

const KNOWN_EXTERNAL_SERVICES: Array<{
  pattern: RegExp;
  name: string;
  purpose: string;
}> = [
  { pattern: /@supabase\//i, name: 'Supabase', purpose: 'Authentication & backend platform client' },
  { pattern: /prisma|@prisma\//i, name: 'Prisma / PostgreSQL', purpose: 'Typed database schema and ORM client' },
  { pattern: /@octokit|github/i, name: 'GitHub REST / API', purpose: 'Repository, Git tree, and PR integration' },
  { pattern: /openai/i, name: 'OpenAI API', purpose: 'LLM inference / embeddings SDK' },
  { pattern: /@google\/generative-ai|@anthropic-ai/i, name: 'AI Model Provider API', purpose: 'Generative AI model client' },
  { pattern: /stripe/i, name: 'Stripe', purpose: 'Payments and billing webhooks' },
  { pattern: /@sentry/i, name: 'Sentry', purpose: 'Error tracking and telemetry' },
  { pattern: /resend|sendgrid|nodemailer|postmark/i, name: 'Email Delivery Service', purpose: 'Transactional email transport' },
  { pattern: /aws-sdk|@aws-sdk|s3/i, name: 'AWS / Object Storage', purpose: 'Cloud storage or AWS SDK client' },
  { pattern: /redis|upstash/i, name: 'Redis / Upstash', purpose: 'In-memory cache or queue store' },
  { pattern: /vercel/i, name: 'Vercel Platform', purpose: 'Deployment, analytics, or edge tooling' },
];

/**
 * Compute Developer Onboarding Intelligence strictly from persisted repository evidence.
 */
export async function getDeveloperOnboarding(
  projectId: string,
  options?: { forceFresh?: boolean }
): Promise<DeveloperOnboardingReport> {
  const profile = await getOrCreateCurrentProfile();

  return telemetry.measure(
    'service.get_developer_onboarding',
    async () => {
      const context = await getProjectWorkstationContext(projectId, {
        forceFresh: options?.forceFresh,
      });

      const analysisId = context.latestAnalysis?.id || 'pending';
      const cacheKey = `${profile.id}:${projectId}:${analysisId}`;

      if (!options?.forceFresh) {
        const cached = onboardingCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          return { ...cached.report, cached: true };
        }
      }

      const raw = await extractRawEvidence(projectId, context);
      const report = assembleDeveloperOnboardingReport({ projectId, context, raw });

      onboardingCache.set(cacheKey, { report, timestamp: Date.now() });
      return report;
    },
    { projectId }
  );
}

/**
 * Pure deterministic assembly of the 12-section Developer Onboarding report from context & extracted evidence.
 */
export function assembleDeveloperOnboardingReport(params: {
  projectId: string;
  context: ProjectWorkstationContext;
  raw: RawEvidenceExtract;
}): DeveloperOnboardingReport {
  const { projectId, context, raw } = params;
      const tree = raw.tree;
      const allPaths = tree.map((f) => f.path);
      const sourceFiles = tree.filter((f) => f.classification === 'SOURCE');
      const graphEngine = new DependencyGraphEngine(raw.dependencyEdges);

      // 1. Freshness & Snapshot Banner
      const totalSourceFiles = context.coverage?.files?.source || sourceFiles.length;
      const parsedSourceFiles = context.coverage?.files?.parsed || 0;
      const failedFilesCount = context.coverage?.files?.failed || 0;
      const unresolvedImportsCount = context.coverage?.imports?.unresolved || 0;
      const sourceCoveragePercent = context.coverage?.files?.coveragePercent ?? 0;
      const overallCoveragePercent = context.coverage?.overallCoveragePercent ?? 0;
      const freshness = context.latestAnalysis?.freshness || 'PARTIAL';
      const isPartial =
        (totalSourceFiles > 0 && parsedSourceFiles < totalSourceFiles) ||
        failedFilesCount > 0 ||
        overallCoveragePercent < 80;
      const isStale = freshness === 'STALE' || freshness === 'FAILED' || freshness === 'ANALYZING';

      let noticeTitle = 'Verified Repository Snapshot';
      let noticeMessage = `Grounded in ${parsedSourceFiles}/${totalSourceFiles} parsed source files and ${raw.dependencyEdges.length} verified internal dependency links.`;
      if (!context.latestAnalysis) {
        noticeTitle = 'Repository Not Yet Indexed';
        noticeMessage =
          'No completed analysis snapshot was found yet. Run repository indexing to populate verified file, architecture, and dependency context.';
      } else if (freshness === 'FAILED') {
        noticeTitle = 'Latest Analysis Failed';
        noticeMessage =
          'The latest analysis run did not complete cleanly. Shown context may be incomplete until re-analysis succeeds.';
      } else if (isStale) {
        noticeTitle = 'Analysis Snapshot Outdated';
        noticeMessage = `Newer commits exist on ${context.project.defaultBranch} since analyzed commit ${
          context.latestAnalysis.commitSha?.slice(0, 7) || 'HEAD'
        }. Sync & re-analyze for up-to-date onboarding intelligence.`;
      } else if (isPartial && totalSourceFiles > 0) {
        noticeTitle = 'Partial Source Coverage Disclosed';
        noticeMessage = `Parsed ${parsedSourceFiles} of ${totalSourceFiles} source files (${sourceCoveragePercent}%). Unparsed files remain explicitly marked as UNKNOWN rather than guessed.`;
      }

      const commitSha = context.latestAnalysis?.commitSha || null;
      const rawCompletedAt = context.latestAnalysis?.completedAt || context.project.lastAnalyzedAt || null;
      const lastAnalyzedIso = rawCompletedAt
        ? rawCompletedAt instanceof Date
          ? rawCompletedAt.toISOString()
          : String(rawCompletedAt)
        : null;
      const snapshot: OnboardingSnapshotBanner = {
        analysisId: context.latestAnalysis?.id || null,
        commitSha,
        commitShort: commitSha ? commitSha.slice(0, 7) : null,
        branch: context.latestAnalysis?.branch || context.project.defaultBranch || 'main',
        analyzedAt: lastAnalyzedIso,
        freshness,
        overallCoveragePercent,
        sourceFilesTotal: totalSourceFiles,
        sourceFilesParsed: parsedSourceFiles,
        sourceCoveragePercent,
        failedFilesCount,
        unresolvedImportsCount,
        isPartial,
        isStale,
        noticeTitle,
        noticeMessage,
        confidenceMode: isPartial || isStale ? 'INFERENCE' : 'FACT',
      };

      // 2. Project at a Glance
      const totalFilesCount = context.coverage?.files?.discovered || tree.length;
      const repoScaleLabel: 'Small' | 'Medium' | 'Large' =
        totalFilesCount > 250 ? 'Large' : totalFilesCount > 60 ? 'Medium' : 'Small';

      const glance: OnboardingProjectGlance = {
        projectId: context.project.id,
        name: context.project.name,
        fullName:
          context.repository?.fullName ||
          (context.project.githubOwner && context.project.githubRepositoryName
            ? `${context.project.githubOwner}/${context.project.githubRepositoryName}`
            : context.project.name),
        repositoryUrl:
          context.repository?.fullName
            ? `https://github.com/${context.repository.fullName}`
            : context.project.githubOwner && context.project.githubRepositoryName
            ? `https://github.com/${context.project.githubOwner}/${context.project.githubRepositoryName}`
            : '',
        visibility: context.project.visibility,
        defaultBranch: context.project.defaultBranch,
        primaryLanguage: context.project.primaryLanguage || 'Unknown',
        framework: context.project.framework || 'Generic',
        description: context.project.description || null,
        readmePreview: raw.readmePreview,
        readmePath: raw.readmePath,
        hasReadme: Boolean(raw.readmePreview || raw.readmePath),
        repoScaleLabel,
        counts: {
          totalFiles: totalFilesCount,
          sourceFiles: totalSourceFiles,
          parsedSourceFiles,
          testFiles: raw.classificationCounts.TEST || 0,
          configFiles: raw.classificationCounts.CONFIG || 0,
          documentationFiles:
            raw.classificationCounts.DOCUMENTATION || context.coverage?.documentation?.filesDetected || 0,
          commitsTracked: context.coverage?.git?.commitsIndexed || raw.commits.length,
          relationshipsMapped: raw.dependencyEdges.length,
          dependenciesDetected: context.dependencies.length,
        },
        stars: context.repository?.stars || 0,
      };

      // 3. How This Project Is Structured
      const moduleFilesMap = new Map<string, string[]>();
      for (const item of tree) {
        const parts = item.path.split('/');
        const mod = parts.length > 1 ? parts[0] : 'root';
        const arr = moduleFilesMap.get(mod) || [];
        if (arr.length < 6) arr.push(item.path);
        moduleFilesMap.set(mod, arr);
      }

      const structureAreas: OnboardingStructureArea[] = context.nodes
        .filter((n) => n.id !== 'node-app')
        .map((n) => {
          const folderKey = n.id.replace(/^node-/, '');
          const outgoing = context.edges
            .filter((e) => e.source === n.id && e.target !== n.id)
            .map((e) => e.target.replace(/^node-/, ''));
          const incoming = context.edges
            .filter((e) => e.target === n.id && e.source !== 'node-app' && e.source !== n.id)
            .map((e) => e.source.replace(/^node-/, ''));

          const lower = folderKey.toLowerCase();
          let roleDescription = `Contains ${n.filesCount} repository files under /${folderKey}`;
          let confidence: 'Verified' | 'Inferred' = 'Verified';

          if (lower === 'app' || lower === 'pages' || lower === 'routes') {
            roleDescription = 'Application routes, pages, and HTTP/API handlers';
            confidence = 'Inferred';
          } else if (lower === 'components' || lower === 'ui') {
            roleDescription = 'Reusable UI components and presentation modules';
            confidence = 'Inferred';
          } else if (lower === 'lib' || lower === 'services' || lower === 'src' || lower === 'core') {
            roleDescription = 'Shared business logic, helpers, and domain services';
            confidence = 'Inferred';
          } else if (lower === 'prisma' || lower === 'db' || lower === 'migrations') {
            roleDescription = 'Database schema, client setup, or SQL migrations';
            confidence = 'Inferred';
          } else if (lower === 'tests' || lower === 'test' || lower === '__tests__') {
            roleDescription = 'Automated test suites and verification scripts';
            confidence = 'Verified';
          } else if (lower === 'docs') {
            roleDescription = 'Technical documentation and repository guides';
            confidence = 'Verified';
          }

          return {
            id: n.id,
            name: n.name,
            path: folderKey === 'root' ? '/' : `${folderKey}/`,
            nodeType: n.type,
            roleDescription,
            confidence,
            fileCount: n.filesCount,
            loc: n.metrics?.loc || 0,
            fanIn: n.metrics?.fanIn || 0,
            fanOut: n.metrics?.fanOut || 0,
            sampleFiles: moduleFilesMap.get(folderKey) || n.relatedFiles.slice(0, 4),
            connectedTo: Array.from(new Set(outgoing)),
            connectedFrom: Array.from(new Set(incoming)),
          };
        })
        .sort((a, b) => b.fileCount - a.fileCount);

      const verifiedRelationships = context.edges
        .filter((e) => e.source !== 'node-app' && e.target !== e.source)
        .slice(0, 12)
        .map((e) => ({
          from: e.source.replace(/^node-/, ''),
          to: e.target.replace(/^node-/, ''),
          relationship: e.relationship,
        }));

      // 4. Compute In-Degree / Out-Degree per file from real dependency edges
      const fanInMap = new Map<string, number>();
      const fanOutMap = new Map<string, number>();
      for (const edge of raw.dependencyEdges) {
        fanOutMap.set(edge.source, (fanOutMap.get(edge.source) || 0) + 1);
        fanInMap.set(edge.target, (fanInMap.get(edge.target) || 0) + 1);
      }

      // 5. Important Files (ranked deterministically by architectural + entry + schema + auth signals)
      const scoredFiles: OnboardingImportantFile[] = [];
      for (const file of tree) {
        if (file.classification === 'GENERATED' || file.classification === 'BINARY' || file.classification === 'ASSET') {
          continue;
        }
        const p = file.path;
        const lower = p.toLowerCase();
        const fanIn = fanInMap.get(p) || 0;
        const fanOut = fanOutMap.get(p) || 0;

        let score = fanIn * 14 + fanOut * 5;
        const reasons: string[] = [];
        let category: OnboardingImportantFile['category'] = 'Core Hub';

        if (fanIn >= 2) {
          reasons.push(`Imported directly by ${fanIn} analyzed files`);
        } else if (fanIn === 1) {
          reasons.push('Imported directly by 1 analyzed file');
        }
        if (fanOut >= 3) {
          reasons.push(`Orchestrates ${fanOut} internal module imports`);
        }

        if (/^readme(\.[a-z0-9]+)?$/i.test(lower)) {
          score += 36;
          category = 'Documentation';
          reasons.push('Primary repository README documentation');
        } else if (
          /^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|tsconfig\.json)$/.test(lower)
        ) {
          score += 42;
          category = 'Configuration';
          reasons.push('Root dependency or compiler manifest');
        } else if (
          /(prisma\/schema\.prisma|schema\.sql|drizzle\.config)/.test(lower)
        ) {
          score += 45;
          category = 'Data & Schema';
          reasons.push('Core data model / database schema definition');
        } else if (
          /^(src\/)?(index|main|app|server)\.(ts|tsx|js|jsx|py|go|rs)$/.test(lower) ||
          /^(src\/)?app\/(layout|page)\.(ts|tsx|js|jsx)$/.test(lower)
        ) {
          score += 44;
          category = 'Entrypoint';
          reasons.push('Application entrypoint or root layout');
        } else if (
          /(^|\/)(middleware|auth|oauth|session)\.(ts|tsx|js|py|go)$/.test(lower) ||
          lower.includes('lib/auth')
        ) {
          score += 38;
          category = 'Auth & Security';
          reasons.push('Authentication, session, or request boundary file');
        } else if (lower.startsWith('app/api/') || lower.startsWith('pages/api/')) {
          score += 20;
          category = 'API Surface';
          reasons.push('Backend API endpoint handler');
        }

        if (score >= 18) {
          const blast = graphEngine.calculateBlastRadius(p);
          const directAffected = blast.directConsumers.length;
          const transitiveAffected = blast.transitiveConsumers.length;
          if (transitiveAffected >= 3 && !reasons.some((r) => r.includes('downstream'))) {
            reasons.push(`Affects ${directAffected + transitiveAffected} downstream files if changed`);
          }

          scoredFiles.push({
            path: p,
            category,
            fanIn,
            fanOut,
            directAffectedCount: directAffected,
            transitiveAffectedCount: transitiveAffected,
            impactLevel: blast.blastRating,
            reasons: reasons.length > 0 ? reasons : ['High structural relevance in analyzed repository'],
            score: score + transitiveAffected * 3,
            confidence: fanIn > 0 || fanOut > 0 ? 'FACT' : 'INFERENCE',
          });
        }
      }

      const importantFiles = scoredFiles
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, 12);

      // 6. Start Here (Ordered Reading Path built ONLY from real existing files)
      const startHere: OnboardingStartStep[] = [];
      const addStartStep = (
        predicate: (p: string) => boolean,
        title: string,
        reason: string,
        category: string,
        targetView: OnboardingStartStep['targetView'],
        confidence: EpistemicClass = 'FACT'
      ) => {
        const match = allPaths.find((p) => predicate(p));
        if (match && !startHere.some((s) => s.filePath === match)) {
          startHere.push({
            stepNumber: startHere.length + 1,
            title,
            filePath: match,
            reason,
            category,
            confidence,
            targetView,
          });
        }
      };

      addStartStep(
        (p) => /^readme(\.[a-z0-9]+)?$/i.test(p.split('/').pop() || ''),
        'Read Project Overview',
        'Repository README introduces purpose, setup scripts, and top-level conventions.',
        'Documentation',
        'evidence'
      );
      addStartStep(
        (p) => ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].includes(p),
        'Inspect Dependencies & Scripts',
        'Defines core libraries, runtime scripts, and build/test commands.',
        'Manifest',
        'explorer'
      );
      addStartStep(
        (p) =>
          /^(src\/)?app\/(layout|page)\.(ts|tsx|js|jsx)$/.test(p) ||
          /^(src\/)?(index|main|app|server)\.(ts|tsx|js|jsx|py|go|rs)$/.test(p),
        'Trace Application Entrypoint',
        'Shows how the application boots, wires providers, and mounts routes.',
        'Entrypoint',
        'explorer'
      );
      addStartStep(
        (p) => p.endsWith('schema.prisma') || /(^|\/)(schema\.sql|models\.py|drizzle\.config)/.test(p),
        'Review Data Models & Schema',
        'Shows persisted entities, relations, and database structure.',
        'Data Layer',
        'explorer'
      );
      addStartStep(
        (p) => /(^|\/)(middleware|auth)\.(ts|tsx|js|py|go)$/.test(p) || p.includes('lib/auth'),
        'Understand Auth & Request Boundary',
        'Explains how user identity, cookies, and protected routes are verified.',
        'Security',
        'explorer'
      );
      const topHub = importantFiles.find(
        (f) => f.category === 'Core Hub' && !startHere.some((s) => s.filePath === f.path)
      );
      if (topHub) {
        startHere.push({
          stepNumber: startHere.length + 1,
          title: 'Explore Core Hub Module',
          filePath: topHub.path,
          reason: topHub.reasons[0] || 'Central module imported across the repository.',
          category: 'Core Service',
          confidence: 'FACT',
          targetView: 'architecture',
        });
      }

      // 7. Key Technologies
      const totalLangBytes = Object.values(raw.languageDistribution).reduce((acc, v) => acc + v, 0);
      const languages = Object.entries(raw.languageDistribution)
        .sort((a, b) => b[1] - a[1])
        .map(([name, bytes]) => ({
          name,
          bytes,
          sharePercent: totalLangBytes > 0 ? Math.round((bytes / totalLangBytes) * 100) : 0,
        }));

      const techItems: OnboardingTechItem[] = [];
      for (const lang of languages.slice(0, 5)) {
        techItems.push({
          name: lang.name,
          category: 'Language',
          confidence: 'Verified',
          evidenceSource: `GitHub language bytes (${lang.sharePercent}%)`,
        });
      }
      if (techItems.length === 0 && glance.primaryLanguage !== 'Unknown') {
        techItems.push({
          name: glance.primaryLanguage,
          category: 'Language',
          confidence: 'Verified',
          evidenceSource: 'Repository primary language metadata',
        });
      }

      const manifestLabel = raw.manifests[0] || 'Manifest metadata';
      for (const dep of raw.declaredDependencies.slice(0, 24)) {
        if (techItems.some((t) => t.name.toLowerCase() === dep.toLowerCase())) continue;
        techItems.push({
          name: dep,
          category: classifyTechItem(dep),
          confidence: 'Verified',
          evidenceSource: manifestLabel,
        });
      }

      if (allPaths.some((p) => p.startsWith('.github/workflows/'))) {
        techItems.push({
          name: 'GitHub Actions',
          category: 'Tooling & Infra',
          confidence: 'Verified',
          evidenceSource: '.github/workflows/*',
        });
      }
      if (allPaths.some((p) => p === 'Dockerfile' || p.endsWith('/Dockerfile') || p.includes('docker-compose'))) {
        techItems.push({
          name: 'Docker',
          category: 'Tooling & Infra',
          confidence: 'Verified',
          evidenceSource: 'Dockerfile / Compose file',
        });
      }

      // 8. Authentication Flow (Strict Fact/Inference/Unknown — NEVER fabricate!)
      const authDeps = raw.declaredDependencies.filter((d) =>
        /(auth|supabase|clerk|lucia|jose|jsonwebtoken|passport|oauth|bcrypt|argon2|firebase)/i.test(d)
      );
      const authFiles = allPaths.filter(
        (p) =>
          !p.startsWith('node_modules') &&
          !p.includes('.test.') &&
          !p.includes('.spec.') &&
          /(auth|login|signin|signout|callback|session|middleware|oauth|jwt|rbac|permission)/i.test(p)
      );

      const authFlow: OnboardingFlowAnalysis =
        authDeps.length > 0 || authFiles.length > 0
          ? {
              status: 'DETECTED',
              summary: `Authentication-related signals verified across ${authFiles.length} file(s)${
                authDeps.length > 0 ? ` and ${authDeps.length} auth library dependency(ies)` : ''
              }.`,
              confidence: authFiles.length > 0 && authDeps.length > 0 ? 'INFERENCE' : 'FACT',
              detectedLibraries: authDeps,
              keyFiles: authFiles.slice(0, 8).map((p) => {
                const lower = p.toLowerCase();
                let role = 'Auth helper or handler';
                if (lower.includes('middleware')) role = 'Request / route boundary guard';
                else if (lower.includes('callback')) role = 'OAuth callback / session exchange';
                else if (lower.includes('signin') || lower.includes('login')) role = 'Sign-in entrypoint';
                else if (lower.includes('signout') || lower.includes('logout')) role = 'Session termination';
                return { path: p, role };
              }),
              consumerFiles: Array.from(
                new Set(
                  raw.dependencyEdges
                    .filter((e) => authFiles.includes(e.target))
                    .map((e) => e.source)
                )
              ).slice(0, 8),
              observations: [
                ...(authFiles.length > 0
                  ? [`Auth/session file paths present: ${authFiles.slice(0, 4).join(', ')}`]
                  : []),
                ...(authDeps.length > 0
                  ? [`Auth libraries declared: ${authDeps.join(', ')}`]
                  : []),
              ],
              caveats: [
                'Runtime token validation, provider secret configuration, and OAuth redirect URLs reside outside static repository source.',
                ...(isPartial
                  ? [`${Math.max(0, totalSourceFiles - parsedSourceFiles)} unparsed source file(s) may contain additional auth checks.`]
                  : []),
              ],
            }
          : {
              status: 'NONE_DETECTED',
              summary:
                'No authentication implementation, middleware guard, or auth library dependencies were detected in the analyzed repository files.',
              confidence: isPartial ? 'UNKNOWN' : 'FACT',
              detectedLibraries: [],
              keyFiles: [],
              consumerFiles: [],
              observations: [
                'Checked repository file paths, dependency manifests, and analyzed imports for auth, session, OAuth, and JWT signals.',
              ],
              caveats: [
                isPartial
                  ? `Only ${parsedSourceFiles}/${totalSourceFiles} source files were parsed; unparsed files remain UNKNOWN.`
                  : 'Upstream reverse proxy, gateway, or infrastructure-level authentication cannot be inferred from repository code alone.',
              ],
            };

      // 9. Data & Database Flow (Only if real evidence exists!)
      const dbDeps = raw.declaredDependencies.filter((d) =>
        /^(prisma|@prisma\/|drizzle|pg|postgres|mysql|sqlite|mongoose|mongodb|redis|ioredis|kysely|typeorm|sequelize|sqlalchemy|alembic|@supabase\/supabase-js)/i.test(
          d
        )
      );
      const dbFiles = allPaths.filter(
        (p) =>
          /(prisma\/|schema\.prisma|\.sql$|migrations\/|(^|\/)(db|database|prisma|drizzle|models)\b)/i.test(p)
      );

      const dataFlow: OnboardingFlowAnalysis =
        dbDeps.length > 0 || dbFiles.length > 0
          ? {
              status: 'DETECTED',
              summary: `Persistence layer signals found via ${dbFiles.length} database/schema file(s) and ${dbDeps.length} storage package(s).`,
              confidence: 'FACT',
              detectedLibraries: dbDeps,
              keyFiles: dbFiles.slice(0, 8).map((p) => {
                const lower = p.toLowerCase();
                let role = 'Database module';
                if (lower.endsWith('schema.prisma')) role = 'Prisma schema & entity definitions';
                else if (lower.includes('migration') || lower.endsWith('.sql')) role = 'Database migration / SQL DDL';
                else if (lower.includes('init')) role = 'Schema bootstrap / runtime verification';
                else if (lower.includes('prisma')) role = 'Database client wrapper';
                return { path: p, role };
              }),
              consumerFiles: Array.from(
                new Set(
                  raw.dependencyEdges
                    .filter((e) => dbFiles.includes(e.target) || e.target.includes('prisma') || e.target.includes('/db'))
                    .map((e) => e.source)
                )
              ).slice(0, 8),
              observations: [
                ...(dbFiles.length > 0 ? [`Schema/DB files verified: ${dbFiles.slice(0, 4).join(', ')}`] : []),
                ...(dbDeps.length > 0 ? [`Database packages verified: ${dbDeps.join(', ')}`] : []),
              ],
              caveats: [
                'Live database row counts, production migrations state, and connection pool parameters are runtime values (UNKNOWN from static code).',
              ],
            }
          : {
              status: 'NONE_DETECTED',
              summary:
                'No database schema, SQL migrations, or ORM/database client libraries were detected in the analyzed repository.',
              confidence: isPartial ? 'UNKNOWN' : 'FACT',
              detectedLibraries: [],
              keyFiles: [],
              consumerFiles: [],
              observations: [
                'No Prisma, Drizzle, SQL migration files, or recognized database drivers were found in analyzed tree/manifests.',
              ],
              caveats: [
                'External HTTP APIs or browser-local storage may handle persistence instead, or remain in unparsed files.',
              ],
            };

      // 10. Important External Services (Verified vs Inferred)
      const externalServices: OnboardingExternalService[] = [];
      for (const svc of KNOWN_EXTERNAL_SERVICES) {
        const matchedDep = raw.declaredDependencies.find((d) => svc.pattern.test(d));
        if (matchedDep) {
          externalServices.push({
            name: svc.name,
            purpose: svc.purpose,
            confidence: 'Verified',
            evidenceSource: `Declared dependency "${matchedDep}"`,
          });
          continue;
        }
        const matchedFile = allPaths.find((p) => svc.pattern.test(p));
        if (matchedFile) {
          externalServices.push({
            name: svc.name,
            purpose: svc.purpose,
            confidence: 'Inferred',
            evidenceSource: `File path ${matchedFile}`,
          });
        }
      }

      // 11. Recent Development
      const typeCounts = new Map<string, number>();
      for (const c of raw.commits) {
        typeCounts.set(c.type, (typeCounts.get(c.type) || 0) + 1);
      }
      const dominantFocusEntry = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

      // 12. Areas to Understand Next (Risky / Hub / Coverage Gaps — "Needs investigation", NEVER fake "Bug")
      const attentionAreas: OnboardingAttentionItem[] = [];

      for (const highFile of importantFiles.filter(
        (f) => f.impactLevel === 'CRITICAL' || f.impactLevel === 'HIGH' || f.impactLevel === 'MODERATE'
      ).slice(0, 3)) {
        attentionAreas.push({
          id: `attn-impact-${highFile.path}`,
          title: `High downstream impact: ${highFile.path}`,
          kind: 'High Impact Area',
          targetPath: highFile.path,
          description: `Changing ${highFile.path} directly affects ${highFile.directAffectedCount} file(s) and transitively affects ${highFile.transitiveAffectedCount} file(s) (${highFile.impactLevel} impact).`,
          recommendation: 'Inspect consumers in Impact Analysis before modifying its exported contracts.',
          confidence: 'FACT',
          targetView: 'impact',
        });
      }

      if (raw.cycles.length > 0) {
        raw.cycles.slice(0, 2).forEach((cycle, idx) => {
          attentionAreas.push({
            id: `attn-cycle-${idx}`,
            title: `Circular import chain (${cycle.length} modules)`,
            kind: 'Cycle Detected',
            targetPath: cycle[0] || '/',
            description: `Mutual import cycle observed: ${cycle.join(' -> ')}.`,
            recommendation: 'Needs investigation if bundle splitting or initialization ordering matters.',
            confidence: 'FACT',
            targetView: 'architecture',
          });
        });
      }

      if (isPartial) {
        attentionAreas.push({
          id: 'attn-coverage',
          title: `Partial source coverage (${parsedSourceFiles}/${totalSourceFiles} source files parsed)`,
          kind: 'Coverage Limitation',
          targetPath: '/',
          description: `${Math.max(0, totalSourceFiles - parsedSourceFiles)} source file(s) and ${unresolvedImportsCount} import(s) were outside the parsed AST set.`,
          recommendation: 'Inspect unparsed files directly in Explorer before assuming zero callers.',
          confidence: 'FACT',
          targetView: 'explorer',
        });
      }

      if ((raw.classificationCounts.TEST || 0) === 0 && totalSourceFiles > 0) {
        attentionAreas.push({
          id: 'attn-tests',
          title: 'No automated test files detected',
          kind: 'Needs Investigation',
          targetPath: '/',
          description: 'No standard test directories or *.test.* / *.spec.* files were classified in the repository tree.',
          recommendation: 'Needs investigation: verify how regressions are tested manually or externally.',
          confidence: 'FACT',
          targetView: 'explorer',
        });
      }

      // 13. Epistemic Summary (FACT / INFERENCE / UNKNOWN) & Evidence Index
      const evidenceIndex: OnboardingEvidenceRef[] = [];
      const addRef = (ref: OnboardingEvidenceRef) => {
        if (!evidenceIndex.some((r) => r.path === ref.path && r.type === ref.type)) {
          evidenceIndex.push(ref);
        }
        return ref;
      };

      const facts: Array<{ statement: string; refs: OnboardingEvidenceRef[] }> = [
        {
          statement: `Repository "${glance.fullName}" targets branch "${glance.defaultBranch}" with ${totalFilesCount} discovered files (${totalSourceFiles} source, ${glance.counts.configFiles} config, ${glance.counts.documentationFiles} docs, ${glance.counts.testFiles} test).`,
          refs: [addRef({ path: '/', label: 'Repository file tree', type: 'file', view: 'explorer' })],
        },
        {
          statement: `Static analysis parsed ${parsedSourceFiles}/${totalSourceFiles} source files (${sourceCoveragePercent}%), extracted ${raw.dependencyEdges.length} verified internal import edges, and indexed ${raw.commits.length} recent commit(s).`,
          refs: [addRef({ path: '/', label: 'Analysis coverage metrics', type: 'coverage', view: 'evidence' })],
        },
      ];

      if (authFlow.status === 'DETECTED' && authFlow.keyFiles[0]) {
        facts.push({
          statement: `Authentication-related files exist at ${authFlow.keyFiles
            .slice(0, 3)
            .map((f) => f.path)
            .join(', ')}.`,
          refs: authFlow.keyFiles.slice(0, 2).map((f) =>
            addRef({ path: f.path, label: f.path, type: 'file', view: 'explorer' })
          ),
        });
      }

      if (dataFlow.status === 'DETECTED' && dataFlow.keyFiles[0]) {
        facts.push({
          statement: `Database/schema artifacts verified at ${dataFlow.keyFiles
            .slice(0, 3)
            .map((f) => f.path)
            .join(', ')}.`,
          refs: dataFlow.keyFiles.slice(0, 2).map((f) =>
            addRef({ path: f.path, label: f.path, type: 'file', view: 'explorer' })
          ),
        });
      }

      const inferences: Array<{ statement: string; refs: OnboardingEvidenceRef[] }> = [
        {
          statement: `Primary stack appears to be ${glance.framework} (${glance.primaryLanguage}) organized across ${structureAreas.length} top-level workspace areas.`,
          refs: raw.manifests.slice(0, 1).map((m) =>
            addRef({ path: m, label: m, type: 'manifest', view: 'explorer' })
          ),
        },
      ];

      if (importantFiles[0]) {
        inferences.push({
          statement: `${importantFiles[0].path} is likely a foundational starting point based on its role (${importantFiles[0].category}) and ${importantFiles[0].fanIn} inbound dependency link(s).`,
          refs: [
            addRef({
              path: importantFiles[0].path,
              label: importantFiles[0].path,
              type: 'file',
              view: 'impact',
            }),
          ],
        });
      }

      const unknowns: Array<{ statement: string; refs: OnboardingEvidenceRef[] }> = [
        {
          statement:
            'Runtime environment variables, deployed secrets, production traffic volume, and third-party dashboard configurations cannot be verified from static source alone.',
          refs: [],
        },
      ];

      if (isPartial || unresolvedImportsCount > 0) {
        unknowns.push({
          statement: `${Math.max(0, totalSourceFiles - parsedSourceFiles)} source file(s) were not AST-parsed and ${unresolvedImportsCount} import(s) were unresolved; callers inside those files remain UNKNOWN.`,
          refs: [addRef({ path: '/', label: 'Unparsed coverage scope', type: 'coverage', view: 'evidence' })],
        });
      }

      if (isStale) {
        unknowns.push({
          statement: `Changes committed after ${commitSha?.slice(0, 7) || 'the analyzed snapshot'} have not been indexed yet.`,
          refs: [addRef({ path: '/', label: 'Sync status', type: 'commit', view: 'timeline' })],
        });
      }

      const report: DeveloperOnboardingReport = {
        projectId,
        generatedAt: new Date().toISOString(),
        cached: false,
        snapshot,
        glance,
        structure: {
          areas: structureAreas,
          verifiedRelationships,
          topLevelDirectories: context.modules,
        },
        startHere,
        importantFiles,
        technologies: {
          items: techItems,
          manifests: raw.manifests,
          languages,
        },
        authFlow,
        dataFlow,
        externalServices,
        recentDevelopment: {
          commitsCount: raw.commits.length,
          historyScope: context.coverage?.git?.historyScope || `Latest ${raw.commits.length} commits`,
          commits: raw.commits.slice(0, 12),
          dominantFocus: dominantFocusEntry ? dominantFocusEntry[0] : null,
        },
        attentionAreas,
        epistemicSummary: {
          facts,
          inferences,
          unknowns,
        },
        evidenceIndex,
      };

      return report;
}
