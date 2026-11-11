import { prisma } from '@/lib/prisma';
import { getOrCreateCurrentProfile } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { telemetry } from '@/lib/observability/timing';
import { parseSourceFileAST } from '@/lib/analysis/ast-parser';
import { parseTsConfig, resolveImportSpecifier, type TsConfigOptions } from '@/lib/analysis/path-resolver';
import {
  BLAST_THRESHOLDS,
  DependencyGraphEngine,
  type DependencyEdge,
} from '@/lib/analysis/graph-engine';
import {
  fetchPullRequestDetails,
  fetchPullRequestFileContent,
  fetchPullRequestFiles,
  getServerGitHubTokenForUser,
  publishPullRequestCommitStatus,
  type GitHubPullRequestFile,
  type GitHubPullRequestSummary,
} from '@/lib/github/pr-client';
import { getGitHubTokenForCurrentUser } from '@/lib/github/client';

export type PrCheckOutcomeStatus = 'PASS' | 'REVIEW' | 'INCOMPLETE';
export type PrImpactLevel = 'ISOLATED' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type PrFileCategory =
  | 'SOURCE'
  | 'DATABASE'
  | 'SECURITY'
  | 'MANIFEST'
  | 'CONFIG'
  | 'TEST'
  | 'DOCUMENTATION'
  | 'ASSET';

export interface PackageDiffItem {
  manifestPath: string;
  name: string;
  fromVersion?: string | null;
  toVersion?: string | null;
  section?: string;
}

export interface AnalyzedPrChangedFile {
  path: string;
  previousPath?: string | null;
  changeType: 'added' | 'removed' | 'modified' | 'renamed' | string;
  category: PrFileCategory;
  isCodeFile: boolean;
  additions: number;
  deletions: number;
  directDependents: string[];
  transitiveDependents: string[];
  impactLevel: PrImpactLevel;
  notes: string[];
  confidence: 'FACT' | 'INFERENCE' | 'UNKNOWN';
}

export interface PullRequestCheckReport {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  prState: string;
  authorLogin: string | null;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  status: PrCheckOutcomeStatus;
  impactLevel: PrImpactLevel;
  summaryText: string;
  analysisSnapshot: {
    analysisId: string | null;
    analyzedCommitSha: string | null;
    sourceFilesTotal: number;
    sourceFilesParsed: number;
    sourceCoveragePercent: number;
    overallCoveragePercent: number;
    isPartialAnalysis: boolean;
    partialDisclosure: string | null;
    isStaleBase: boolean;
    staleBaseDisclosure: string | null;
  };
  totals: {
    changedFiles: number;
    codeFilesChanged: number;
    nonCodeFilesChanged: number;
    directAffectedFiles: number;
    transitiveAffectedFiles: number;
    untouchedAffectedFiles: number;
    affectedModules: number;
  };
  changedFiles: AnalyzedPrChangedFile[];
  directAffectedFiles: string[];
  transitiveAffectedFiles: string[];
  untouchedExternalDependents: string[];
  affectedModules: string[];
  dependencyChanges: {
    manifestFiles: string[];
    added: PackageDiffItem[];
    removed: PackageDiffItem[];
    updated: PackageDiffItem[];
    importingFilesByPackage: Record<string, string[]>;
    warnings: string[];
  };
  databaseChanges: {
    detected: boolean;
    files: string[];
    notes: string[];
  };
  securitySignals: {
    detected: boolean;
    files: string[];
    summary: string | null;
  };
  brokenReferenceAlerts: Array<{
    targetPath: string;
    changeType: 'removed' | 'renamed';
    affectedCallers: string[];
    message: string;
  }>;
  newFileConnections: Array<{
    filePath: string;
    internalImports: string[];
    externalPackages: string[];
  }>;
  reviewChecklist: string[];
  epistemic: {
    facts: string[];
    inferences: string[];
    unknowns: string[];
  };
}

export interface EvaluatePrPureInput {
  pr: {
    number: number;
    title: string;
    url: string;
    state: string;
    authorLogin: string | null;
    baseBranch: string;
    headBranch: string;
    baseSha: string;
    headSha: string;
  };
  files: GitHubPullRequestFile[];
  analysis: {
    analysisId: string | null;
    status: string | null;
    commitSha: string | null;
    sourceFilesTotal: number;
    sourceFilesParsed: number;
    sourceCoveragePercent: number;
    overallCoveragePercent: number;
  };
  dependencyEdges: DependencyEdge[];
  knownRepoFiles: string[];
  newFileConnections?: Array<{
    filePath: string;
    internalImports: string[];
    externalPackages: string[];
  }>;
  manifestPackageDiffs?: {
    added: PackageDiffItem[];
    removed: PackageDiffItem[];
    updated: PackageDiffItem[];
    warnings?: string[];
  };
  externalPackageUsageMap?: Record<string, string[]>;
}

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php', '.cs', '.cpp', '.c',
]);

const DOC_ASSET_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.rst', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.webp', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.css', '.scss',
]);

function getExtension(filePath: string): string {
  const base = filePath.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx).toLowerCase() : '';
}

export function classifyPrFile(filePath: string): { category: PrFileCategory; isCodeFile: boolean } {
  const lower = filePath.toLowerCase();
  const base = lower.split('/').pop() || '';
  const ext = getExtension(lower);

  if (
    /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements.*\.txt|pyproject\.toml|poetry\.lock|go\.mod|go\.sum|cargo\.toml|cargo\.lock|gemfile|gemfile\.lock|composer\.json)$/.test(
      lower
    )
  ) {
    return { category: 'MANIFEST', isCodeFile: false };
  }

  if (
    lower.endsWith('schema.prisma') ||
    lower.includes('prisma/migrations/') ||
    lower.includes('/migrations/') ||
    lower.startsWith('migrations/') ||
    lower.endsWith('.sql') ||
    /(^|\/)(db|database|drizzle)\//.test(lower)
  ) {
    return { category: 'DATABASE', isCodeFile: CODE_EXTENSIONS.has(ext) };
  }

  if (
    /\.(test|spec)\.[a-z0-9]+$/i.test(base) ||
    lower.includes('/__tests__/') ||
    lower.startsWith('tests/') ||
    lower.startsWith('test/')
  ) {
    return { category: 'TEST', isCodeFile: CODE_EXTENSIONS.has(ext) };
  }

  if (
    /(auth|oauth|session|middleware|rbac|permission|token|webhook|crypto|secret|login|signin|signout|callback|supabase\/|jwt|csp)/.test(
      lower
    )
  ) {
    return { category: 'SECURITY', isCodeFile: CODE_EXTENSIONS.has(ext) };
  }

  if (
    DOC_ASSET_EXTENSIONS.has(ext) ||
    lower.startsWith('docs/') ||
    /^readme(\.|$)/i.test(base)
  ) {
    const isDoc = ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.rst' || lower.startsWith('docs/');
    return { category: isDoc ? 'DOCUMENTATION' : 'ASSET', isCodeFile: false };
  }

  if (
    ['.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.example'].some((s) => base.endsWith(s)) ||
    base.startsWith('.env') ||
    base.includes('.config.')
  ) {
    return { category: 'CONFIG', isCodeFile: false };
  }

  if (CODE_EXTENSIONS.has(ext)) {
    return { category: 'SOURCE', isCodeFile: true };
  }

  return { category: 'ASSET', isCodeFile: false };
}

function scoreCountToImpactLevel(totalAffected: number): PrImpactLevel {
  if (totalAffected === BLAST_THRESHOLDS.isolated) return 'ISOLATED';
  if (totalAffected <= BLAST_THRESHOLDS.lowMax) return 'LOW';
  if (totalAffected <= BLAST_THRESHOLDS.moderateMax) return 'MODERATE';
  if (totalAffected <= BLAST_THRESHOLDS.highMax) return 'HIGH';
  return 'CRITICAL';
}

const IMPACT_ORDER: Record<PrImpactLevel, number> = {
  ISOLATED: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function maxImpactLevel(a: PrImpactLevel, b: PrImpactLevel): PrImpactLevel {
  return IMPACT_ORDER[a] >= IMPACT_ORDER[b] ? a : b;
}

/**
 * Extract package additions/removals/updates deterministically from package.json patches or requirements/Cargo/go.mod.
 */
export function parseManifestPatchDiffs(files: GitHubPullRequestFile[]): {
  added: PackageDiffItem[];
  removed: PackageDiffItem[];
  updated: PackageDiffItem[];
  warnings: string[];
} {
  const added: PackageDiffItem[] = [];
  const removed: PackageDiffItem[] = [];
  const updated: PackageDiffItem[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const lower = file.filename.toLowerCase();
    const patch = file.patch || '';
    if (!patch) continue;

    if (lower === 'package.json' || lower.endsWith('/package.json')) {
      const removedMap = new Map<string, string>();
      const addedMap = new Map<string, string>();

      for (const line of patch.split('\n')) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
        const pkgMatch = line.match(/^([+-])\s*"([^"]+)":\s*"([^"]+)"/);
        if (!pkgMatch) continue;

        const [, sign, pkgName, ver] = pkgMatch;
        if (['name', 'version', 'description', 'main', 'module', 'license', 'private'].includes(pkgName)) {
          continue;
        }
        if (sign === '-') removedMap.set(pkgName, ver);
        if (sign === '+') addedMap.set(pkgName, ver);
      }

      for (const [name, fromVersion] of Array.from(removedMap.entries())) {
        if (addedMap.has(name)) {
          const toVersion = addedMap.get(name)!;
          if (fromVersion !== toVersion) {
            updated.push({ manifestPath: file.filename, name, fromVersion, toVersion });
          }
          addedMap.delete(name);
        } else {
          removed.push({ manifestPath: file.filename, name, fromVersion });
        }
      }

      for (const [name, toVersion] of Array.from(addedMap.entries())) {
        added.push({ manifestPath: file.filename, name, toVersion });
      }
    } else if (/requirements.*\.txt$/.test(lower)) {
      const rem = new Map<string, string>();
      const add = new Map<string, string>();
      for (const line of patch.split('\n')) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
        const m = line.match(/^([+-])\s*([a-zA-Z0-9_.-]+)(.*)$/);
        if (!m || m[2].startsWith('#')) continue;
        const [, sign, name, rest] = m;
        if (sign === '-') rem.set(name.toLowerCase(), rest.trim() || 'removed');
        if (sign === '+') add.set(name.toLowerCase(), rest.trim() || 'added');
      }
      for (const [name, fromVersion] of Array.from(rem.entries())) {
        if (add.has(name)) {
          updated.push({ manifestPath: file.filename, name, fromVersion, toVersion: add.get(name)! });
          add.delete(name);
        } else {
          removed.push({ manifestPath: file.filename, name, fromVersion });
        }
      }
      for (const [name, toVersion] of Array.from(add.entries())) {
        added.push({ manifestPath: file.filename, name, toVersion });
      }
    } else if (lower.endsWith('cargo.toml') || lower.endsWith('go.mod')) {
      for (const line of patch.split('\n')) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
        const cargoMatch = line.match(/^([+-])\s*([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
        const goMatch = !cargoMatch ? line.match(/^([+-])\s*([^\s]+)\s+(v[^\s]+)/) : null;
        const m = cargoMatch || goMatch;
        if (!m) continue;
        const [, sign, name, ver] = m;
        if (sign === '+') added.push({ manifestPath: file.filename, name, toVersion: ver });
        if (sign === '-') removed.push({ manifestPath: file.filename, name, fromVersion: ver });
      }
    }
  }

  const changedPkgJson = files.some((f) => f.filename === 'package.json' || f.filename.endsWith('/package.json'));
  const changedLockfile = files.some((f) =>
    /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(f.filename)
  );
  if (changedPkgJson && !changedLockfile && (added.length > 0 || removed.length > 0 || updated.length > 0)) {
    warnings.push('package.json dependencies changed without an accompanying lockfile update.');
  }

  return { added, removed, updated, warnings };
}

/**
 * Pure deterministic evaluator for all GitHub PR Check scenarios.
 */
export function evaluatePullRequestImpactPure(input: EvaluatePrPureInput): PullRequestCheckReport {
  const { pr, files, analysis, dependencyEdges, knownRepoFiles } = input;
  const graphEngine = new DependencyGraphEngine(dependencyEdges);
  const knownFileSet = new Set(knownRepoFiles);
  const prChangedPathSet = new Set(files.map((f) => f.filename));

  const directSet = new Set<string>();
  const transitiveSet = new Set<string>();
  const touchedModulesSet = new Set<string>();
  const dbFiles: string[] = [];
  const securityFiles: string[] = [];
  const manifestFiles: string[] = [];
  const brokenReferenceAlerts: PullRequestCheckReport['brokenReferenceAlerts'] = [];

  let highestFileImpact: PrImpactLevel = 'ISOLATED';
  let codeFilesChanged = 0;
  let nonCodeFilesChanged = 0;
  let analyzedChangedCodeFiles = 0;

  // Build map of files referenced in dependencyEdges so we know whether a file was part of the graph
  const filesWithGraphContext = new Set<string>();
  for (const edge of dependencyEdges) {
    filesWithGraphContext.add(edge.source);
    filesWithGraphContext.add(edge.target);
  }

  const changedFiles: AnalyzedPrChangedFile[] = files.map((file) => {
    const { category, isCodeFile } = classifyPrFile(file.filename);
    const mod = file.filename.includes('/') ? file.filename.split('/')[0] : 'root';
    touchedModulesSet.add(mod);

    if (isCodeFile) codeFilesChanged++;
    else nonCodeFilesChanged++;

    if (category === 'DATABASE') dbFiles.push(file.filename);
    if (category === 'SECURITY') securityFiles.push(file.filename);
    if (category === 'MANIFEST') manifestFiles.push(file.filename);

    const notes: string[] = [];
    let directDeps: string[] = [];
    let transitiveDeps: string[] = [];
    let fileImpact: PrImpactLevel = 'ISOLATED';
    let confidence: 'FACT' | 'INFERENCE' | 'UNKNOWN' = 'FACT';

    const changeType = file.status;
    if (changeType === 'removed') {
      const blast = graphEngine.calculateBlastRadius(file.filename, 'delete');
      directDeps = blast.directConsumers.map((c) => c.path);
      transitiveDeps = blast.transitiveConsumers.map((c) => c.path);
      fileImpact = blast.blastRating;
      analyzedChangedCodeFiles++;
      if (directDeps.length > 0) {
        notes.push(`Deleted file is still imported by ${directDeps.length} analyzed file(s).`);
        brokenReferenceAlerts.push({
          targetPath: file.filename,
          changeType: 'removed',
          affectedCallers: directDeps.filter((d) => !prChangedPathSet.has(d)),
          message: `Deleted file ${file.filename} has ${directDeps.length} direct consumer(s) in the analyzed graph.`,
        });
      } else {
        notes.push('No direct downstream consumers observed in the analyzed dependency graph.');
      }
    } else if (changeType === 'renamed' && file.previous_filename) {
      const blastOld = graphEngine.calculateBlastRadius(file.previous_filename, 'interface');
      directDeps = blastOld.directConsumers.map((c) => c.path);
      transitiveDeps = blastOld.transitiveConsumers.map((c) => c.path);
      fileImpact = blastOld.blastRating;
      analyzedChangedCodeFiles++;
      notes.push(`Renamed from ${file.previous_filename} to ${file.filename}.`);
      const unupdatedCallers = directDeps.filter((d) => !prChangedPathSet.has(d));
      if (unupdatedCallers.length > 0) {
        notes.push(`${unupdatedCallers.length} caller(s) referencing old path were not modified in this PR.`);
        brokenReferenceAlerts.push({
          targetPath: file.previous_filename,
          changeType: 'renamed',
          affectedCallers: unupdatedCallers,
          message: `Renamed file ${file.previous_filename} -> ${file.filename} still has ${unupdatedCallers.length} untouched caller(s) in the base graph.`,
        });
      }
    } else if (changeType === 'added') {
      const newConn = input.newFileConnections?.find((c) => c.filePath === file.filename);
      if (newConn) {
        notes.push(
          `New file imports ${newConn.internalImports.length} internal file(s) and ${newConn.externalPackages.length} external package(s).`
        );
      } else if (isCodeFile) {
        notes.push('Newly added source file (no existing callers in the base repository snapshot).');
      } else {
        notes.push(`Newly added ${category.toLowerCase()} file.`);
      }
      analyzedChangedCodeFiles++;
    } else if (isCodeFile) {
      const blast = graphEngine.calculateBlastRadius(file.filename, 'interface');
      directDeps = blast.directConsumers.map((c) => c.path);
      transitiveDeps = blast.transitiveConsumers.map((c) => c.path);
      fileImpact = blast.blastRating;

      const inGraph = knownFileSet.has(file.filename) || filesWithGraphContext.has(file.filename);
      if (!inGraph && analysis.sourceCoveragePercent < 100) {
        confidence = 'UNKNOWN';
        notes.push('File was outside the analyzed snapshot coverage; callers remain unknown.');
      } else {
        analyzedChangedCodeFiles++;
        if (directDeps.length === 0 && transitiveDeps.length === 0) {
          notes.push('Leaf or isolated module with zero downstream dependents in analyzed graph.');
        } else {
          notes.push(
            `Affects ${directDeps.length} direct and ${transitiveDeps.length} transitive dependent file(s).`
          );
        }
      }
    } else {
      notes.push(`Non-code (${category.toLowerCase()}) change does not alter runtime TypeScript/module edges.`);
    }

    for (const d of directDeps) directSet.add(d);
    for (const t of transitiveDeps) transitiveSet.add(t);
    highestFileImpact = maxImpactLevel(highestFileImpact, fileImpact);

    if (category === 'SECURITY') notes.push('Security-sensitive area changed.');
    if (category === 'DATABASE') notes.push('Database / schema / migration area changed.');
    if (category === 'MANIFEST') notes.push('Dependency manifest changed.');

    return {
      path: file.filename,
      previousPath: file.previous_filename || null,
      changeType,
      category,
      isCodeFile,
      additions: file.additions,
      deletions: file.deletions,
      directDependents: directDeps,
      transitiveDependents: transitiveDeps,
      impactLevel: fileImpact,
      notes,
      confidence,
    };
  });

  // Combined downstream unique impact
  const directAffectedFiles = Array.from(directSet).sort();
  const transitiveAffectedFiles = Array.from(transitiveSet).sort();
  const allAffectedSet = new Set([...directAffectedFiles, ...transitiveAffectedFiles]);
  const untouchedExternalDependents = Array.from(allAffectedSet)
    .filter((f) => !prChangedPathSet.has(f))
    .sort();

  for (const affectedPath of Array.from(allAffectedSet)) {
    touchedModulesSet.add(affectedPath.includes('/') ? affectedPath.split('/')[0] : 'root');
  }

  const combinedImpact = maxImpactLevel(highestFileImpact, scoreCountToImpactLevel(allAffectedSet.size));

  // Manifest diff & package consumers
  const parsedManifestDiff = input.manifestPackageDiffs || parseManifestPatchDiffs(files);
  const importingFilesByPackage: Record<string, string[]> = {};
  const touchedPkgs = [
    ...parsedManifestDiff.added,
    ...parsedManifestDiff.removed,
    ...parsedManifestDiff.updated,
  ].map((p) => p.name);

  if (input.externalPackageUsageMap) {
    for (const pkg of touchedPkgs) {
      if (input.externalPackageUsageMap[pkg]) {
        importingFilesByPackage[pkg] = input.externalPackageUsageMap[pkg];
      }
    }
  }

  const manifestWarnings = [...(parsedManifestDiff.warnings || [])];
  for (const remPkg of parsedManifestDiff.removed) {
    const importers = importingFilesByPackage[remPkg.name] || [];
    if (importers.length > 0) {
      manifestWarnings.push(
        `Removed package "${remPkg.name}" appears imported in ${importers.length} analyzed file(s).`
      );
    }
  }

  // Completeness & Stale Base Disclosures
  const totalSrc = analysis.sourceFilesTotal;
  const parsedSrc = analysis.sourceFilesParsed;
  const srcPct = totalSrc > 0 ? Math.round((parsedSrc / totalSrc) * 100) : analysis.sourceCoveragePercent;
  const missingPct = totalSrc > 0 ? Math.max(0, 100 - srcPct) : 0;
  const hasCompletedAnalysis = Boolean(analysis.analysisId) && analysis.status === 'COMPLETED';
  const isPartialAnalysis = !hasCompletedAnalysis || (totalSrc > 0 && parsedSrc < totalSrc);
  const partialDisclosure = !hasCompletedAnalysis
    ? 'Repository has not completed deterministic indexing yet, so dependency blast radius is incomplete.'
    : isPartialAnalysis
    ? `PR analysis is limited because ${missingPct}% of source files (${totalSrc - parsedSrc}/${totalSrc}) could not be analyzed.`
    : null;

  const isStaleBase = Boolean(
    analysis.commitSha && pr.baseSha && analysis.commitSha !== pr.baseSha
  );
  const staleBaseDisclosure = isStaleBase
    ? `PR base commit (${pr.baseSha.slice(0, 7)}) differs from MarrowNode's analyzed commit (${analysis.commitSha!.slice(0, 7)}). Re-sync repository analysis to guarantee exact graph alignment.`
    : null;

  // Deterministic Outcome Status
  let status: PrCheckOutcomeStatus = 'PASS';
  const hasHighBlast =
    combinedImpact === 'MODERATE' || combinedImpact === 'HIGH' || combinedImpact === 'CRITICAL';
  const hasBrokenCallers = brokenReferenceAlerts.some((b) => b.affectedCallers.length > 0);
  const hasSecuritySignal = securityFiles.length > 0;
  const hasDbSignal = dbFiles.length > 0;
  const hasManifestChanges =
    manifestFiles.length > 0 &&
    (parsedManifestDiff.added.length > 0 ||
      parsedManifestDiff.removed.length > 0 ||
      parsedManifestDiff.updated.length > 0);

  if (
    !hasCompletedAnalysis ||
    (codeFilesChanged > 0 && srcPct < 35 && analyzedChangedCodeFiles === 0)
  ) {
    status = 'INCOMPLETE';
  } else if (
    hasHighBlast ||
    hasBrokenCallers ||
    hasSecuritySignal ||
    hasDbSignal ||
    hasManifestChanges ||
    (codeFilesChanged > 0 && (isStaleBase || isPartialAnalysis))
  ) {
    status = 'REVIEW';
  } else if (codeFilesChanged > 0 && isPartialAnalysis) {
    status = 'REVIEW';
  }

  // Honest Plain-Language Summary
  const reasons: string[] = [];
  if (!hasCompletedAnalysis) {
    reasons.push('Repository indexing has not finished');
  } else {
    if (allAffectedSet.size > 0) {
      reasons.push(
        `${allAffectedSet.size} downstream file(s) affected across ${touchedModulesSet.size} area(s) (${combinedImpact})`
      );
    } else if (codeFilesChanged === 0 && nonCodeFilesChanged > 0) {
      reasons.push(`Only non-code files changed (${nonCodeFilesChanged})`);
    } else {
      reasons.push('Modified code is isolated with 0 downstream dependents in the analyzed graph');
    }
    if (hasBrokenCallers) reasons.push(`${brokenReferenceAlerts.length} potential broken reference alert(s)`);
    if (hasSecuritySignal) reasons.push('Security-sensitive area changed');
    if (hasDbSignal) reasons.push('Database/schema area changed');
    if (hasManifestChanges) reasons.push('Dependency manifest changed');
    if (isStaleBase) reasons.push('Base commit differs from analyzed snapshot');
    if (isPartialAnalysis && missingPct > 0) reasons.push(`${missingPct}% source coverage gap`);
  }

  const summaryText = reasons.join(' • ');

  // Actionable Review Checklist
  const reviewChecklist: string[] = [];
  if (hasBrokenCallers) {
    for (const alert of brokenReferenceAlerts) {
      reviewChecklist.push(
        `Update ${alert.affectedCallers.length} untouched caller(s) still referencing ${alert.targetPath}.`
      );
    }
  }
  if (untouchedExternalDependents.length > 0) {
    reviewChecklist.push(
      `Inspect ${untouchedExternalDependents.length} untouched consumer file(s) depending on modified modules.`
    );
  }
  if (hasSecuritySignal) {
    reviewChecklist.push(
      `Security-sensitive area changed (${securityFiles.slice(0, 3).join(', ')}): review auth, session, and permission boundaries.`
    );
  }
  if (hasDbSignal) {
    reviewChecklist.push(
      `Database/schema files changed (${dbFiles.slice(0, 3).join(', ')}): verify schema rollout and backward compatibility.`
    );
  }
  if (hasManifestChanges) {
    reviewChecklist.push(
      `Verify dependency updates (${parsedManifestDiff.added.length} added, ${parsedManifestDiff.updated.length} updated, ${parsedManifestDiff.removed.length} removed).`
    );
  }
  if (isStaleBase) {
    reviewChecklist.push('Trigger Sync & Re-analyze on the project so MarrowNode indexes the current PR base commit.');
  }
  if (isPartialAnalysis && partialDisclosure) {
    reviewChecklist.push(partialDisclosure);
  }
  if (reviewChecklist.length === 0) {
    reviewChecklist.push('Changes appear isolated in the current verified graph; proceed with standard code review.');
  }

  // Epistemic Summary
  const facts: string[] = [
    `PR #${pr.number} alters ${files.length} file(s) (${codeFilesChanged} code/schema/security, ${nonCodeFilesChanged} docs/config/assets).`,
    hasCompletedAnalysis
      ? `Checked against Analysis ${analysis.analysisId?.slice(0, 8)} covering ${parsedSrc}/${totalSrc} source files (${srcPct}%) and ${dependencyEdges.length} internal edges.`
      : 'No completed repository analysis snapshot is stored yet.',
    ...(allAffectedSet.size > 0
      ? [
          `Dependency graph shows ${directAffectedFiles.length} direct and ${transitiveAffectedFiles.length} transitive consumer file(s) for changed targets.`,
        ]
      : []),
    ...(hasSecuritySignal ? [`Security-sensitive file paths touched: ${securityFiles.join(', ')}.`] : []),
    ...(hasDbSignal ? [`Database/schema paths touched: ${dbFiles.join(', ')}.`] : []),
  ];

  const inferences: string[] = [
    hasHighBlast || hasBrokenCallers
      ? `Blast radius and caller checks suggest ${combinedImpact} regression surface outside the PR's edited files.`
      : codeFilesChanged === 0
      ? 'Changes appear limited to documentation, configuration, or assets without runtime import graph ripple.'
      : 'Changes appear structurally localized based on parsed module imports.',
  ];

  const unknowns: string[] = [
    'Runtime behavior, dynamic imports, unindexed external callers, and CI execution outcomes are outside static graph proof.',
    ...(isPartialAnalysis && partialDisclosure ? [partialDisclosure] : []),
    ...(isStaleBase && staleBaseDisclosure ? [staleBaseDisclosure] : []),
  ];

  return {
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    prState: pr.state,
    authorLogin: pr.authorLogin,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    status,
    impactLevel: combinedImpact,
    summaryText,
    analysisSnapshot: {
      analysisId: analysis.analysisId,
      analyzedCommitSha: analysis.commitSha,
      sourceFilesTotal: totalSrc,
      sourceFilesParsed: parsedSrc,
      sourceCoveragePercent: srcPct,
      overallCoveragePercent: analysis.overallCoveragePercent,
      isPartialAnalysis,
      partialDisclosure,
      isStaleBase,
      staleBaseDisclosure,
    },
    totals: {
      changedFiles: files.length,
      codeFilesChanged,
      nonCodeFilesChanged,
      directAffectedFiles: directAffectedFiles.length,
      transitiveAffectedFiles: transitiveAffectedFiles.length,
      untouchedAffectedFiles: untouchedExternalDependents.length,
      affectedModules: touchedModulesSet.size,
    },
    changedFiles,
    directAffectedFiles,
    transitiveAffectedFiles,
    untouchedExternalDependents,
    affectedModules: Array.from(touchedModulesSet).sort(),
    dependencyChanges: {
      manifestFiles,
      added: parsedManifestDiff.added,
      removed: parsedManifestDiff.removed,
      updated: parsedManifestDiff.updated,
      importingFilesByPackage,
      warnings: manifestWarnings,
    },
    databaseChanges: {
      detected: dbFiles.length > 0,
      files: dbFiles,
      notes:
        dbFiles.length > 0
          ? ['Database schema, migrations, or DB modules were modified in this PR.']
          : [],
    },
    securitySignals: {
      detected: securityFiles.length > 0,
      files: securityFiles,
      summary: securityFiles.length > 0 ? 'Security-sensitive area changed' : null,
    },
    brokenReferenceAlerts,
    newFileConnections: input.newFileConnections || [],
    reviewChecklist,
    epistemic: {
      facts,
      inferences,
      unknowns,
    },
  };
}

/**
 * Shared DB context loader for a specific verified Project ID.
 */
async function loadProjectAnalysisGraphContext(projectId: string) {
  const latestAnalysis = await prisma.analysis.findFirst({
    where: { projectId, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });

  const evidences = await prisma.evidence.findMany({
    where: { projectId },
    select: { type: true, metadata: true },
  });

  const archEv = evidences.find((e) => e.type === 'architecture');
  const filesEv = evidences.find((e) => e.type === 'files');
  const depsEv = evidences.find((e) => e.type === 'dependencies');

  const archMeta = (archEv?.metadata as any) || {};
  const filesMeta = (filesEv?.metadata as any) || {};
  const depsMeta = (depsEv?.metadata as any) || {};
  const summaryJson = (latestAnalysis?.summaryJson as any) || {};
  const cov = summaryJson?.coverage || {};

  const dependencyEdges: DependencyEdge[] = Array.isArray(archMeta.dependencyEdges)
    ? archMeta.dependencyEdges
    : Array.isArray(summaryJson.dependencyEdges)
    ? summaryJson.dependencyEdges
    : [];

  const treeItems: Array<{ path: string; classification?: string }> = Array.isArray(filesMeta.tree)
    ? filesMeta.tree
    : [];

  const knownRepoFiles = treeItems.map((i) => i.path);
  const sourceFilesTotal =
    typeof cov?.files?.source === 'number'
      ? cov.files.source
      : treeItems.filter((i) => i.classification === 'SOURCE').length;
  const sourceFilesParsed =
    typeof cov?.files?.parsed === 'number'
      ? cov.files.parsed
      : Number(archMeta.parsedFilesCount || 0);
  const sourceCoveragePercent =
    typeof cov?.files?.coveragePercent === 'number'
      ? cov.files.coveragePercent
      : sourceFilesTotal > 0
      ? Math.round((sourceFilesParsed / sourceFilesTotal) * 100)
      : 0;

  return {
    latestAnalysis,
    dependencyEdges,
    knownRepoFiles,
    declaredDependencies: Array.isArray(depsMeta.allDependencies)
      ? depsMeta.allDependencies
      : Array.isArray(depsMeta.sampleDependencies)
      ? depsMeta.sampleDependencies
      : [],
    externalPackageUsageMap:
      depsMeta.packageUsageMap && typeof depsMeta.packageUsageMap === 'object'
        ? (depsMeta.packageUsageMap as Record<string, string[]>)
        : {},
    sourceFilesTotal,
    sourceFilesParsed,
    sourceCoveragePercent,
    overallCoveragePercent: Math.round(latestAnalysis?.coverage ?? cov?.overallCoveragePercent ?? 0),
  };
}

/**
 * Execute a PR Check end-to-end (fetch PR + files, parse added code files if possible, evaluate, save idempotently).
 */
async function executeAndPersistPrCheck(params: {
  projectId: string;
  repositoryId: string;
  owner: string;
  repo: string;
  token: string | null;
  prNumber: number;
  triggerSource: 'manual' | 'webhook';
  forceRerun?: boolean;
  userScope: string;
  prCheckAutoPublish: boolean;
  prefetchedPr?: Partial<GitHubPullRequestSummary> & {
    base?: { ref?: string; sha: string };
    head?: { ref?: string; sha: string };
  };
}) {
  const {
    projectId,
    repositoryId,
    owner,
    repo,
    token,
    prNumber,
    triggerSource,
    forceRerun,
    userScope,
    prCheckAutoPublish,
  } = params;

  const graphCtx = await loadProjectAnalysisGraphContext(projectId);
  const currentAnalysisId = graphCtx.latestAnalysis?.id || null;

  // Fetch PR metadata (or use full webhook PR object if it already has title/html_url/shas, else call GitHub)
  const prDetails =
    params.prefetchedPr?.head?.sha &&
    params.prefetchedPr?.base?.sha &&
    params.prefetchedPr?.title
      ? ({
          number: prNumber,
          title: params.prefetchedPr.title,
          html_url:
            params.prefetchedPr.html_url ||
            `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          state: params.prefetchedPr.state || 'open',
          user: params.prefetchedPr.user || null,
          base: {
            ref: params.prefetchedPr.base.ref || 'main',
            sha: params.prefetchedPr.base.sha,
          },
          head: {
            ref: params.prefetchedPr.head.ref || 'head',
            sha: params.prefetchedPr.head.sha,
          },
        } as GitHubPullRequestSummary)
      : await fetchPullRequestDetails(token, owner, repo, prNumber, userScope);

  const headSha = prDetails.head.sha;
  const baseSha = prDetails.base.sha;

  // Idempotency / Replay protection: if identical (repositoryId, prNumber, headSha, analysisId) already stored and !forceRerun
  if (!forceRerun) {
    const existing = await prisma.pullRequestCheck.findUnique({
      where: {
        repositoryId_prNumber_headSha: {
          repositoryId,
          prNumber,
          headSha,
        },
      },
    });

    if (existing && existing.analysisId === currentAnalysisId) {
      return {
        record: existing,
        report: existing.reportJson as unknown as PullRequestCheckReport,
        deduplicated: true,
      };
    }
  }

  // Fetch changed PR files
  const prFiles = await fetchPullRequestFiles(token, owner, repo, prNumber, headSha, userScope);

  // Inspect tsconfig.json if any added TS/JS files exist
  const addedCodeFiles = prFiles
    .filter((f) => f.status === 'added' && classifyPrFile(f.filename).isCodeFile)
    .slice(0, 12);

  let tsconfig: TsConfigOptions = {};
  if (addedCodeFiles.length > 0 && graphCtx.knownRepoFiles.includes('tsconfig.json')) {
    const tsconfigRaw = await fetchPullRequestFileContent(
      token,
      owner,
      repo,
      'tsconfig.json',
      headSha
    ).catch(() => null);
    tsconfig = parseTsConfig(tsconfigRaw);
  }

  const allFilePathsAtHead = new Set([...graphCtx.knownRepoFiles, ...prFiles.map((f) => f.filename)]);
  const newFileConnections: EvaluatePrPureInput['newFileConnections'] = [];

  if (addedCodeFiles.length > 0) {
    await Promise.all(
      addedCodeFiles.map(async (f) => {
        const content = await fetchPullRequestFileContent(token, owner, repo, f.filename, headSha);
        if (!content) return;

        try {
          const parsed = parseSourceFileAST(f.filename, content);
          const internalImports: string[] = [];
          const externalPackages: string[] = [];

          for (const imp of parsed.imports) {
            const res = resolveImportSpecifier({
              specifier: imp.specifier,
              importingFilePath: f.filename,
              allRepoFiles: allFilePathsAtHead,
              tsconfig,
            });
            if (!res.isExternal && res.resolvedPath) {
              internalImports.push(res.resolvedPath);
            } else if (res.isExternal && res.externalPackage) {
              externalPackages.push(res.externalPackage);
            }
          }

          newFileConnections.push({
            filePath: f.filename,
            internalImports,
            externalPackages: Array.from(new Set(externalPackages)),
          });
        } catch {
          // skip unparseable new file gracefully
        }
      })
    );
  }

  // Also fetch base & head package.json if package.json was changed WITHOUT a patch hunk (large diffs)
  const manifestDiff = parseManifestPatchDiffs(prFiles);
  const pkgDiffFile = prFiles.find(
    (f) => (f.filename === 'package.json' || f.filename.endsWith('/package.json')) && !f.patch
  );
  if (pkgDiffFile) {
    const [basePkgRaw, headPkgRaw] = await Promise.all([
      fetchPullRequestFileContent(token, owner, repo, pkgDiffFile.filename, baseSha),
      fetchPullRequestFileContent(token, owner, repo, pkgDiffFile.filename, headSha),
    ]);
    if (basePkgRaw && headPkgRaw) {
      try {
        const basePkg = JSON.parse(basePkgRaw);
        const headPkg = JSON.parse(headPkgRaw);
        const baseAll: Record<string, string> = {
          ...(basePkg.dependencies || {}),
          ...(basePkg.devDependencies || {}),
        };
        const headAll: Record<string, string> = {
          ...(headPkg.dependencies || {}),
          ...(headPkg.devDependencies || {}),
        };
        for (const [k, v] of Object.entries(headAll)) {
          if (!baseAll[k]) {
            manifestDiff.added.push({ manifestPath: pkgDiffFile.filename, name: k, toVersion: String(v) });
          } else if (baseAll[k] !== v) {
            manifestDiff.updated.push({
              manifestPath: pkgDiffFile.filename,
              name: k,
              fromVersion: String(baseAll[k]),
              toVersion: String(v),
            });
          }
        }
        for (const [k, v] of Object.entries(baseAll)) {
          if (!headAll[k]) {
            manifestDiff.removed.push({ manifestPath: pkgDiffFile.filename, name: k, fromVersion: String(v) });
          }
        }
      } catch {
        // ignore JSON syntax issues
      }
    }
  }

  const report = evaluatePullRequestImpactPure({
    pr: {
      number: prDetails.number,
      title: prDetails.title,
      url: prDetails.html_url,
      state: prDetails.merged_at ? 'merged' : prDetails.state,
      authorLogin: prDetails.user?.login || null,
      baseBranch: prDetails.base.ref,
      headBranch: prDetails.head.ref,
      baseSha,
      headSha,
    },
    files: prFiles,
    analysis: {
      analysisId: graphCtx.latestAnalysis?.id || null,
      status: graphCtx.latestAnalysis?.status || null,
      commitSha: graphCtx.latestAnalysis?.commitSha || null,
      sourceFilesTotal: graphCtx.sourceFilesTotal,
      sourceFilesParsed: graphCtx.sourceFilesParsed,
      sourceCoveragePercent: graphCtx.sourceCoveragePercent,
      overallCoveragePercent: graphCtx.overallCoveragePercent,
    },
    dependencyEdges: graphCtx.dependencyEdges,
    knownRepoFiles: graphCtx.knownRepoFiles,
    newFileConnections,
    manifestPackageDiffs: manifestDiff,
    externalPackageUsageMap: graphCtx.externalPackageUsageMap,
  });

  // Optionally publish commit status back to GitHub
  let githubPublishStatus = 'skipped';
  let githubPublishNote = 'Check stored in MarrowNode; GitHub auto-publish disabled.';
  if (prCheckAutoPublish) {
    const pubRes = await publishPullRequestCommitStatus({
      token,
      owner,
      repo,
      headSha,
      projectId,
      prNumber: prDetails.number,
      checkStatus: report.status,
      impactLevel: report.impactLevel,
      summaryText: report.summaryText,
    });
    githubPublishStatus = pubRes.status;
    githubPublishNote = pubRes.note;
  }

  const saved = await prisma.pullRequestCheck.upsert({
    where: {
      repositoryId_prNumber_headSha: {
        repositoryId,
        prNumber: prDetails.number,
        headSha,
      },
    },
    update: {
      analysisId: currentAnalysisId,
      prTitle: report.prTitle,
      prUrl: report.prUrl,
      prState: report.prState,
      authorLogin: report.authorLogin,
      baseBranch: report.baseBranch,
      headBranch: report.headBranch,
      baseSha: report.baseSha,
      analyzedCommitSha: report.analysisSnapshot.analyzedCommitSha,
      status: report.status,
      impactLevel: report.impactLevel,
      changedFilesCount: report.totals.changedFiles,
      directAffectedCount: report.totals.directAffectedFiles,
      transitiveAffectedCount: report.totals.transitiveAffectedFiles,
      isPartialAnalysis: report.analysisSnapshot.isPartialAnalysis,
      isStaleBase: report.analysisSnapshot.isStaleBase,
      summaryText: report.summaryText,
      triggerSource,
      githubPublishStatus,
      githubPublishNote,
      reportJson: report as any,
      checkedAt: new Date(),
    },
    create: {
      projectId,
      repositoryId,
      analysisId: currentAnalysisId,
      prNumber: report.prNumber,
      prTitle: report.prTitle,
      prUrl: report.prUrl,
      prState: report.prState,
      authorLogin: report.authorLogin,
      baseBranch: report.baseBranch,
      headBranch: report.headBranch,
      baseSha: report.baseSha,
      headSha: report.headSha,
      analyzedCommitSha: report.analysisSnapshot.analyzedCommitSha,
      status: report.status,
      impactLevel: report.impactLevel,
      changedFilesCount: report.totals.changedFiles,
      directAffectedCount: report.totals.directAffectedFiles,
      transitiveAffectedCount: report.totals.transitiveAffectedFiles,
      isPartialAnalysis: report.analysisSnapshot.isPartialAnalysis,
      isStaleBase: report.analysisSnapshot.isStaleBase,
      summaryText: report.summaryText,
      triggerSource,
      githubPublishStatus,
      githubPublishNote,
      reportJson: report as any,
      checkedAt: new Date(),
    },
  });

  return {
    record: saved,
    report,
    deduplicated: false,
  };
}

/**
 * Trigger a manual PR Check strictly scoped to the authenticated project owner.
 */
export async function runPullRequestCheckForUser(params: {
  projectId: string;
  prNumber: number;
  forceRerun?: boolean;
}) {
  const profile = await getOrCreateCurrentProfile();
  const project = await getUserProject(params.projectId);

  if (!project.repository || !project.githubOwner || !project.githubRepositoryName) {
    throw new Error('Project must be connected to a GitHub repository before running PR checks.');
  }

  const { token } = await getGitHubTokenForCurrentUser();
  if (!token) {
    throw new Error('GitHub access token missing. Please reconnect GitHub to inspect Pull Requests.');
  }

  return telemetry.measure(
    'service.run_pr_check',
    () =>
      executeAndPersistPrCheck({
        projectId: project.id,
        repositoryId: project.repository!.id,
        owner: project.githubOwner!,
        repo: project.githubRepositoryName!,
        token,
        prNumber: params.prNumber,
        triggerSource: 'manual',
        forceRerun: params.forceRerun,
        userScope: profile.id,
        prCheckAutoPublish: Boolean((project as any).prCheckAutoPublish),
      }),
    { projectId: project.id, metadata: { prNumber: params.prNumber } }
  );
}

/**
 * Trigger a PR Check from a signature-verified GitHub webhook delivery.
 */
export async function runPullRequestCheckFromWebhook(params: {
  projectId: string;
  prNumber: number;
  prPayload?: any;
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: { repository: true },
  });

  if (!project || !project.repository || !project.githubOwner || !project.githubRepositoryName) {
    throw new Error('Target project or repository not found.');
  }

  if (!project.prChecksEnabled) {
    return { skipped: true, reason: 'PR Checks disabled on this project.' };
  }

  const ownerToken = await getServerGitHubTokenForUser(project.ownerId);

  return telemetry.measure(
    'service.webhook_pr_check',
    () =>
      executeAndPersistPrCheck({
        projectId: project.id,
        repositoryId: project.repository!.id,
        owner: project.githubOwner!,
        repo: project.githubRepositoryName!,
        token: ownerToken,
        prNumber: params.prNumber,
        triggerSource: 'webhook',
        forceRerun: false,
        userScope: project.ownerId,
        prCheckAutoPublish: project.prCheckAutoPublish,
        prefetchedPr: params.prPayload,
      }),
    { projectId: project.id, metadata: { prNumber: params.prNumber, source: 'webhook' } }
  );
}

/**
 * List stored PR Check records for an owned project.
 */
export async function listProjectPullRequestChecks(projectId: string) {
  const project = await getUserProject(projectId);

  const checks = await prisma.pullRequestCheck.findMany({
    where: { projectId: project.id },
    orderBy: [{ checkedAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return {
    project: {
      id: project.id,
      name: project.name,
      githubOwner: project.githubOwner,
      githubRepositoryName: project.githubRepositoryName,
      prChecksEnabled: Boolean((project as any).prChecksEnabled),
      prCheckAutoPublish: Boolean((project as any).prCheckAutoPublish),
    },
    checks,
  };
}

/**
 * Fetch detailed stored PR check for an owned project & PR number (optionally matching specific headSha).
 */
export async function getProjectPullRequestCheckDetail(
  projectId: string,
  prNumber: number,
  headSha?: string | null
) {
  const project = await getUserProject(projectId);

  const check = await prisma.pullRequestCheck.findFirst({
    where: {
      projectId: project.id,
      prNumber,
      ...(headSha ? { headSha } : {}),
    },
    orderBy: { checkedAt: 'desc' },
  });

  const history = await prisma.pullRequestCheck.findMany({
    where: { projectId: project.id, prNumber },
    orderBy: { checkedAt: 'desc' },
    select: {
      id: true,
      headSha: true,
      baseSha: true,
      status: true,
      impactLevel: true,
      checkedAt: true,
      triggerSource: true,
    },
    take: 10,
  });

  return {
    project: {
      id: project.id,
      name: project.name,
      githubOwner: project.githubOwner,
      githubRepositoryName: project.githubRepositoryName,
    },
    check,
    history,
  };
}
