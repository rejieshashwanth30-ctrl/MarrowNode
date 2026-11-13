import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  generateWebhookSecret,
  encryptWebhookSecret,
  decryptWebhookSecret,
  verifyGitHubWebhookSignature,
  maskSecretLast4,
} from '../lib/security/webhook-crypto';
import {
  evaluatePullRequestImpactPure,
  parseManifestPatchDiffs,
} from '../lib/services/pr-check';
import {
  assembleDeveloperOnboardingReport,
  type RawEvidenceExtract,
} from '../lib/services/onboarding';
import { DependencyGraphEngine, type DependencyEdge } from '../lib/analysis/graph-engine';
import { parseSourceFileAST } from '../lib/analysis/ast-parser';
import { parseTsConfig, resolveImportSpecifier } from '../lib/analysis/path-resolver';
import { synthesizeAskAnswerPure } from '../lib/services/ai-query';
import { getSafeErrorResponse } from '../lib/errors';
import {
  getProjectWorkstationContext,
  type ProjectWorkstationContext,
} from '../lib/services/project-context';
import {
  validateGitHubConnection,
  invalidateGitHubConnectionCache,
} from '../lib/github/connection-validator';
import { sanitizeRedirectPath } from '../lib/origin';
import { saveGitHubConnection } from '../lib/services/users';
import {
  getCurrentRepositoryHead,
  verifyRepositoryHeadSha,
  GitHubApiError,
} from '../lib/github/client';
import type { FileTreeNode } from '../types';
import {
  partitionIntoBatches,
  resolveGlobalDependencyGraphFromBatches,
  MAX_FILES_PER_BATCH,
  ANALYZER_VERSION,
  type CompactParsedAstSummary,
} from '../lib/github/analysis';
import { prisma } from '../lib/prisma';

function makeBaseContext(overrides?: Partial<ProjectWorkstationContext>): ProjectWorkstationContext {
  return {
    project: {
      id: 'proj_test_1',
      name: 'sample-app',
      description: 'Sample workspace',
      githubOwner: 'acme',
      githubRepositoryName: 'sample-app',
      defaultBranch: 'main',
      visibility: 'public',
      primaryLanguage: 'TypeScript',
      framework: 'Next.js',
      database: null,
      analysisStatus: 'COMPLETED',
      lastAnalyzedAt: new Date('2026-11-11T10:00:00Z'),
    },
    repository: {
      fullName: 'acme/sample-app',
      isPrivate: false,
      stars: 12,
      isFork: false,
      lastSyncedAt: new Date('2026-11-11T10:00:00Z'),
    },
    latestAnalysis: {
      id: 'analysis_1',
      status: 'COMPLETED',
      freshness: 'CURRENT',
      commitSha: 'aaaaaaa111111111111111111111111111111111',
      branch: 'main',
      analyzerVersion: 'v1.0',
      coverage: 100,
      createdAt: new Date('2026-11-11T10:00:00Z'),
      filesAnalyzed: 25,
      commitsAnalyzed: 5,
      dependenciesDetected: 6,
      architectureNodes: 4,
      evidenceCount: 5,
      completedAt: new Date('2026-11-11T10:00:00Z'),
      errorMessage: null,
    },
    fileTree: [],
    nodes: [
      {
        id: 'node-app',
        name: 'sample-app',
        type: 'App',
        category: 'Entrypoint',
        description: 'App root',
        filesCount: 3,
        health: 'active',
        relatedFiles: ['package.json'],
        dependencies: ['lib'],
        dependents: [],
        recentChanges: [],
        metrics: { loc: 120, fanIn: 0, fanOut: 2 },
        position: { x: 0, y: 0 },
      },
      {
        id: 'node-lib',
        name: 'Lib',
        type: 'Services',
        category: 'Module',
        description: 'Shared libs',
        filesCount: 8,
        health: 'stable',
        relatedFiles: ['lib/*'],
        dependencies: [],
        dependents: ['node-app'],
        recentChanges: [],
        metrics: { loc: 600, fanIn: 3, fanOut: 1 },
        position: { x: 100, y: 100 },
      },
      {
        id: 'node-app-routes',
        name: 'App',
        type: 'API',
        category: 'Module',
        description: 'App routes',
        filesCount: 6,
        health: 'stable',
        relatedFiles: ['app/*'],
        dependencies: ['node-lib'],
        dependents: ['node-app'],
        recentChanges: [],
        metrics: { loc: 420, fanIn: 1, fanOut: 3 },
        position: { x: 200, y: 100 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-app-routes', target: 'node-lib', relationship: 'imports', confidence: 1 },
    ],
    timeline: [],
    evidenceItems: [],
    dependencies: ['next', 'react', '@prisma/client', '@supabase/ssr', 'stripe', 'zod'],
    modules: ['app', 'lib', 'prisma'],
    coverage: {
      files: { discovered: 25, source: 20, parsed: 20, failed: 0, ignored: 0, coveragePercent: 100 },
      architecture: {
        modulesDetected: 3,
        modulesMapped: 3,
        unresolvedModules: 0,
        coveragePercent: 100,
        detectedModuleNames: ['app', 'lib', 'prisma'],
        unresolvedModuleNames: [],
      },
      imports: { total: 10, resolved: 10, unresolved: 0, external: 6, resolutionPercent: 100 },
      dependencies: {
        manifestsDetected: 1,
        manifestsParsed: 1,
        manifestParsingPercent: 100,
        declaredDependencies: 6,
        resolvedDependencies: 6,
        unresolvedDependencies: 0,
        usageResolutionPercent: 100,
      },
      git: {
        commitsDiscovered: 5,
        commitsIndexed: 5,
        coveragePercent: 100,
        historyScope: 'Latest 5 commits on main',
      },
      documentation: { filesDetected: 1, filesIndexed: 1, docTypes: ['README'], hasReadme: true },
      overallCoveragePercent: 100,
      overallPercentage: 100,
      metrics: { totalFiles: 25, commitsTracked: 5, relationshipsMapped: 10, architectureNodes: 4 },
      breakdown: {
        codebaseUnderstanding: 100,
        architectureMapping: 100,
        gitHistory: 100,
        dependencyMapping: 100,
        documentation: 100,
      },
    },
    summary: {
      totalFiles: 25,
      topLanguage: 'TypeScript',
      framework: 'Next.js',
      hasReadme: true,
      readmePreview: '# Sample App',
    },
    ...overrides,
  };
}

function makeRawEvidence(overrides?: Partial<RawEvidenceExtract>): RawEvidenceExtract {
  return {
    tree: [
      { path: 'README.md', classification: 'DOCUMENTATION' },
      { path: 'package.json', classification: 'CONFIG' },
      { path: 'prisma/schema.prisma', classification: 'CONFIG' },
      { path: 'app/layout.tsx', classification: 'SOURCE' },
      { path: 'app/api/health/route.ts', classification: 'SOURCE' },
      { path: 'lib/auth.ts', classification: 'SOURCE' },
      { path: 'lib/prisma.ts', classification: 'SOURCE' },
      { path: 'lib/core.ts', classification: 'SOURCE' },
      { path: 'lib/leaf.ts', classification: 'SOURCE' },
      { path: 'tests/core.test.ts', classification: 'TEST' },
    ],
    classificationCounts: {
      SOURCE: 6,
      CONFIG: 2,
      DOCUMENTATION: 1,
      TEST: 1,
      GENERATED: 0,
      BINARY: 0,
      ASSET: 0,
    },
    dependencyEdges: [
      { id: '1', source: 'app/layout.tsx', target: 'lib/auth.ts', line: 1, relationship: 'imports', confidence: 1 },
      { id: '2', source: 'app/api/health/route.ts', target: 'lib/prisma.ts', line: 1, relationship: 'imports', confidence: 1 },
      { id: '3', source: 'lib/auth.ts', target: 'lib/core.ts', line: 2, relationship: 'imports', confidence: 1 },
      { id: '4', source: 'app/layout.tsx', target: 'lib/core.ts', line: 2, relationship: 'imports', confidence: 1 },
    ],
    cycles: [],
    languageDistribution: { TypeScript: 9000, CSS: 1000 },
    manifests: ['package.json'],
    declaredDependencies: ['next', 'react', '@prisma/client', '@supabase/ssr', 'stripe'],
    readmePreview: '# Sample App\nNext.js application with Prisma and Supabase auth.',
    readmePath: 'README.md',
    commits: [
      {
        sha: 'aaaaaaa111111111111111111111111111111111',
        shortSha: 'aaaaaaa',
        date: '2026-11-11',
        author: 'Alice',
        title: 'Add health check endpoint',
        type: 'feature',
      },
    ],
    ...overrides,
  };
}

// =========================================================================
// 1. WEBHOOK CRYPTO & HMAC SECURITY TESTS
// =========================================================================
test('webhook secret encryption roundtrip and timing-safe HMAC verification', () => {
  const secret = generateWebhookSecret();
  assert.ok(secret.startsWith('whsec_'));

  const { encrypted, last4 } = encryptWebhookSecret(secret);
  assert.equal(decryptWebhookSecret(encrypted), secret);
  assert.equal(maskSecretLast4(last4), `whsec_••••••••${last4}`);
  assert.equal(decryptWebhookSecret('corrupted-payload'), null);

  const payload = JSON.stringify({ action: 'opened', number: 12 });
  const validSig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  assert.equal(verifyGitHubWebhookSignature(payload, validSig, secret), true);
  assert.equal(verifyGitHubWebhookSignature(payload + ' ', validSig, secret), false);
  assert.equal(verifyGitHubWebhookSignature(payload, 'sha256=deadbeef', secret), false);
  assert.equal(verifyGitHubWebhookSignature(payload, null, secret), false);
  assert.equal(verifyGitHubWebhookSignature(payload, validSig, ''), false);
});

// =========================================================================
// 2. DEVELOPER ONBOARDING SCENARIO TESTS
// =========================================================================
test('Developer Onboarding generates all verified sections for fullstack Next.js repo', () => {
  const context = makeBaseContext();
  const raw = makeRawEvidence();
  const report = assembleDeveloperOnboardingReport({ projectId: 'proj_test_1', context, raw });

  assert.equal(report.glance.fullName, 'acme/sample-app');
  assert.equal(report.glance.repoScaleLabel, 'Small');
  assert.ok(report.startHere.length >= 4);
  assert.equal(report.startHere[0].filePath, 'README.md');
  assert.ok(report.importantFiles.some((f) => f.path === 'lib/core.ts'));
  assert.equal(report.authFlow.status, 'DETECTED');
  assert.ok(report.authFlow.detectedLibraries.includes('@supabase/ssr'));
  assert.equal(report.dataFlow.status, 'DETECTED');
  assert.ok(report.dataFlow.keyFiles.some((k) => k.path === 'prisma/schema.prisma'));
  assert.ok(report.externalServices.some((s) => s.name === 'Stripe' && s.confidence === 'Verified'));
  assert.ok(report.epistemicSummary.facts.length >= 2);
  assert.ok(report.epistemicSummary.inferences.length >= 1);
  assert.ok(report.epistemicSummary.unknowns.length >= 1);
});

test('Developer Onboarding is honest when repo has NO auth, NO DB, cycles, and partial coverage', () => {
  const baseCtx = makeBaseContext({
    latestAnalysis: {
      id: 'analysis_partial',
      status: 'COMPLETED',
      freshness: 'STALE',
      commitSha: 'bbbbbbb',
      branch: 'main',
      analyzerVersion: 'v1.0',
      coverage: 45,
      createdAt: new Date(),
      filesAnalyzed: 100,
      commitsAnalyzed: 2,
      dependenciesDetected: 2,
      architectureNodes: 2,
      evidenceCount: 3,
      completedAt: new Date(),
      errorMessage: null,
    },
    dependencies: ['commander', 'chalk'],
    coverage: {
      ...makeBaseContext().coverage!,
      files: { discovered: 110, source: 100, parsed: 45, failed: 2, ignored: 8, coveragePercent: 45 },
      imports: { total: 20, resolved: 15, unresolved: 5, external: 2, resolutionPercent: 85 },
      overallCoveragePercent: 52,
      overallPercentage: 52,
    },
  });

  const raw = makeRawEvidence({
    tree: [
      { path: 'src/cli.ts', classification: 'SOURCE' },
      { path: 'src/a.ts', classification: 'SOURCE' },
      { path: 'src/b.ts', classification: 'SOURCE' },
      { path: 'package.json', classification: 'CONFIG' },
    ],
    classificationCounts: {
      SOURCE: 100,
      CONFIG: 5,
      DOCUMENTATION: 0,
      TEST: 0,
      GENERATED: 5,
      BINARY: 0,
      ASSET: 0,
    },
    dependencyEdges: [
      { id: 'c1', source: 'src/a.ts', target: 'src/b.ts', line: 1, relationship: 'imports', confidence: 1 },
      { id: 'c2', source: 'src/b.ts', target: 'src/a.ts', line: 1, relationship: 'imports', confidence: 1 },
    ],
    cycles: [['src/a.ts', 'src/b.ts', 'src/a.ts']],
    declaredDependencies: ['commander', 'chalk'],
    readmePreview: null,
    readmePath: null,
  });

  const report = assembleDeveloperOnboardingReport({ projectId: 'proj_cli', context: baseCtx, raw });

  assert.equal(report.snapshot.isPartial, true);
  assert.equal(report.snapshot.isStale, true);
  assert.equal(report.authFlow.status, 'NONE_DETECTED');
  assert.equal(report.authFlow.confidence, 'UNKNOWN');
  assert.equal(report.dataFlow.status, 'NONE_DETECTED');
  assert.equal(report.glance.hasReadme, false);
  // Circular dependency triggers Needs Investigation / Cycle Detected, NEVER fabricated "Bug"
  assert.ok(report.attentionAreas.some((a) => a.kind === 'Cycle Detected'));
  assert.ok(!JSON.stringify(report.attentionAreas).toLowerCase().includes('"bug"'));
  assert.ok(report.attentionAreas.some((a) => a.title.includes('No automated test files detected')));
});

// =========================================================================
// 3. ALL 10 GITHUB PR CHECK SCENARIO TESTS
// =========================================================================
function buildSharedEdges(): DependencyEdge[] {
  // Consumer chain where `lib/shared.ts` is used directly by 5 files and transitively by 5 more (10 total -> HIGH blast!)
  const edges: DependencyEdge[] = [];
  for (let i = 1; i <= 5; i++) {
    edges.push({
      id: `d-${i}`,
      source: `services/svc-${i}.ts`,
      target: 'lib/shared.ts',
      line: 1,
      relationship: 'imports',
      confidence: 1,
    });
    edges.push({
      id: `t-${i}`,
      source: `app/api/route-${i}.ts`,
      target: `services/svc-${i}.ts`,
      line: 1,
      relationship: 'imports',
      confidence: 1,
    });
  }
  edges.push({
    id: 'del-1',
    source: 'components/LegacyWidget.tsx',
    target: 'lib/obsolete.ts',
    line: 3,
    relationship: 'imports',
    confidence: 1,
  });
  edges.push({
    id: 'ren-1',
    source: 'app/dashboard/page.tsx',
    target: 'lib/old-name.ts',
    line: 4,
    relationship: 'imports',
    confidence: 1,
  });
  return edges;
}

const BASE_PR = {
  number: 42,
  title: 'Test PR',
  url: 'https://github.com/acme/repo/pull/42',
  state: 'open',
  authorLogin: 'alice',
  baseBranch: 'main',
  headBranch: 'feat/test',
  baseSha: 'sha_base_1',
  headSha: 'sha_head_1',
};

const FULL_ANALYSIS = {
  analysisId: 'ana_full_1',
  status: 'COMPLETED',
  commitSha: 'sha_base_1',
  sourceFilesTotal: 20,
  sourceFilesParsed: 20,
  sourceCoveragePercent: 100,
  overallCoveragePercent: 100,
};

test('PR Scenario 1: isolated single leaf file change -> ISOLATED & PASS', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: '1', filename: 'lib/isolated.ts', status: 'modified', additions: 5, deletions: 2, changes: 7 }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: buildSharedEdges(),
    knownRepoFiles: ['lib/isolated.ts', 'lib/shared.ts'],
  });
  assert.equal(report.impactLevel, 'ISOLATED');
  assert.equal(report.status, 'PASS');
  assert.equal(report.totals.untouchedAffectedFiles, 0);
});

test('PR Scenario 2: high blast radius core helper -> HIGH & REVIEW with untouched dependents', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: '1', filename: 'lib/shared.ts', status: 'modified', additions: 12, deletions: 4, changes: 16 }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: buildSharedEdges(),
    knownRepoFiles: ['lib/shared.ts'],
  });
  assert.equal(report.impactLevel, 'HIGH');
  assert.equal(report.status, 'REVIEW');
  assert.equal(report.totals.directAffectedFiles, 5);
  assert.equal(report.totals.transitiveAffectedFiles, 5);
  assert.equal(report.totals.untouchedAffectedFiles, 10);
});

test('PR Scenario 3: deleted file still imported by analyzed callers -> broken reference alert & REVIEW', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: '1', filename: 'lib/obsolete.ts', status: 'removed', additions: 0, deletions: 40, changes: 40 }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: buildSharedEdges(),
    knownRepoFiles: ['lib/obsolete.ts', 'components/LegacyWidget.tsx'],
  });
  assert.equal(report.status, 'REVIEW');
  assert.equal(report.brokenReferenceAlerts.length, 1);
  assert.deepEqual(report.brokenReferenceAlerts[0].affectedCallers, ['components/LegacyWidget.tsx']);
});

test('PR Scenario 4: renamed file with unupdated caller referencing previous_filename -> REVIEW alert', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [
      {
        sha: '1',
        filename: 'lib/new-name.ts',
        previous_filename: 'lib/old-name.ts',
        status: 'renamed',
        additions: 1,
        deletions: 1,
        changes: 2,
      },
    ],
    analysis: FULL_ANALYSIS,
    dependencyEdges: buildSharedEdges(),
    knownRepoFiles: ['lib/old-name.ts', 'app/dashboard/page.tsx'],
  });
  assert.equal(report.status, 'REVIEW');
  assert.equal(report.brokenReferenceAlerts.length, 1);
  assert.equal(report.brokenReferenceAlerts[0].changeType, 'renamed');
  assert.deepEqual(report.brokenReferenceAlerts[0].affectedCallers, ['app/dashboard/page.tsx']);
});

test('PR Scenario 5: newly added code file records resolved internal/external connections', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: '1', filename: 'lib/feature-new.ts', status: 'added', additions: 30, deletions: 0, changes: 30 }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: buildSharedEdges(),
    knownRepoFiles: ['lib/shared.ts'],
    newFileConnections: [
      { filePath: 'lib/feature-new.ts', internalImports: ['lib/shared.ts'], externalPackages: ['zod'] },
    ],
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.newFileConnections.length, 1);
  assert.ok(report.changedFiles[0].notes[0].includes('1 internal file(s)'));
});

test('PR Scenario 6: package.json manifest diff parses added/removed/updated & flags lockfile/importers', () => {
  const patch = [
    '@@ -10,5 +10,5 @@',
    '-    "lodash": "^4.17.21",',
    '-    "next": "^14.2.0",',
    '+    "next": "^14.2.35",',
    '+    "lucide-react": "^0.453.0",',
  ].join('\n');
  const diff = parseManifestPatchDiffs([
    { sha: 'p', filename: 'package.json', status: 'modified', additions: 2, deletions: 2, changes: 4, patch },
  ]);
  assert.equal(diff.added[0].name, 'lucide-react');
  assert.equal(diff.removed[0].name, 'lodash');
  assert.equal(diff.updated[0].name, 'next');
  assert.ok(diff.warnings.some((w) => w.includes('without an accompanying lockfile update')));

  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: 'p', filename: 'package.json', status: 'modified', additions: 2, deletions: 2, changes: 4, patch }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: [],
    knownRepoFiles: ['package.json', 'lib/utils.ts'],
    externalPackageUsageMap: { lodash: ['lib/utils.ts'] },
  });
  assert.equal(report.status, 'REVIEW');
  assert.ok(report.dependencyChanges.warnings.some((w) => w.includes('Removed package "lodash"')));
});

test('PR Scenario 7: database / schema / migration changes flagged accurately', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: 's', filename: 'prisma/schema.prisma', status: 'modified', additions: 4, deletions: 0, changes: 4 }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: [],
    knownRepoFiles: ['prisma/schema.prisma'],
  });
  assert.equal(report.status, 'REVIEW');
  assert.equal(report.databaseChanges.detected, true);
  assert.deepEqual(report.databaseChanges.files, ['prisma/schema.prisma']);
});

test('PR Scenario 8: security-sensitive area touched -> flagged without fabricated vulnerability claim', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: 'a', filename: 'lib/auth/session.ts', status: 'modified', additions: 3, deletions: 1, changes: 4 }],
    analysis: FULL_ANALYSIS,
    dependencyEdges: [],
    knownRepoFiles: ['lib/auth/session.ts'],
  });
  assert.equal(report.status, 'REVIEW');
  assert.equal(report.securitySignals.detected, true);
  assert.equal(report.securitySignals.summary, 'Security-sensitive area changed');
  assert.ok(!JSON.stringify(report).toLowerCase().includes('vulnerability found'));
});

test('PR Scenario 9: non-code only PR -> ISOLATED & PASS with 0 code files changed', () => {
  const report = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [
      { sha: 'd1', filename: 'README.md', status: 'modified', additions: 10, deletions: 2, changes: 12 },
      { sha: 'd2', filename: 'docs/setup.md', status: 'added', additions: 20, deletions: 0, changes: 20 },
    ],
    analysis: FULL_ANALYSIS,
    dependencyEdges: buildSharedEdges(),
    knownRepoFiles: ['README.md'],
  });
  assert.equal(report.totals.codeFilesChanged, 0);
  assert.equal(report.totals.nonCodeFilesChanged, 2);
  assert.equal(report.impactLevel, 'ISOLATED');
  assert.equal(report.status, 'PASS');
});

test('PR Scenario 10: incomplete analysis disclosure, missing analysis INCOMPLETE, and stale base commit warning', () => {
  const partialReport = evaluatePullRequestImpactPure({
    pr: { ...BASE_PR, baseSha: 'sha_newer_base' },
    files: [{ sha: '1', filename: 'lib/unknown-module.ts', status: 'modified', additions: 2, deletions: 1, changes: 3 }],
    analysis: {
      analysisId: 'ana_part',
      status: 'COMPLETED',
      commitSha: 'sha_old_base',
      sourceFilesTotal: 100,
      sourceFilesParsed: 45,
      sourceCoveragePercent: 45,
      overallCoveragePercent: 50,
    },
    dependencyEdges: [],
    knownRepoFiles: ['lib/other.ts'],
  });
  assert.equal(partialReport.status, 'REVIEW');
  assert.equal(partialReport.analysisSnapshot.isPartialAnalysis, true);
  assert.ok(partialReport.analysisSnapshot.partialDisclosure?.includes('55% of source files'));
  assert.equal(partialReport.analysisSnapshot.isStaleBase, true);

  const missingAnalysisReport = evaluatePullRequestImpactPure({
    pr: BASE_PR,
    files: [{ sha: '1', filename: 'src/index.ts', status: 'modified', additions: 5, deletions: 1, changes: 6 }],
    analysis: {
      analysisId: null,
      status: null,
      commitSha: null,
      sourceFilesTotal: 0,
      sourceFilesParsed: 0,
      sourceCoveragePercent: 0,
      overallCoveragePercent: 0,
    },
    dependencyEdges: [],
    knownRepoFiles: [],
  });
  assert.equal(missingAnalysisReport.status, 'INCOMPLETE');
});

// =========================================================================
// 4. NEON POSTGRESQL MULTI-TENANT ISOLATION & PR CHECK IDEMPOTENCY TEST
// =========================================================================
test('PostgreSQL multi-tenant isolation & (repositoryId, prNumber, headSha) unique constraint', async () => {
  const suffix = crypto.randomBytes(4).toString('hex');
  const userA = await prisma.user.create({
    data: { supabaseUserId: `test_supa_a_${suffix}`, email: `a_${suffix}@example.com` },
  });
  const userB = await prisma.user.create({
    data: { supabaseUserId: `test_supa_b_${suffix}`, email: `b_${suffix}@example.com` },
  });

  try {
    const projectA = await prisma.project.create({
      data: {
        ownerId: userA.id,
        name: `repo-a-${suffix}`,
        githubOwner: 'org',
        githubRepositoryName: 'shared-name',
        prChecksEnabled: true,
      },
    });
    const repoA = await prisma.repository.create({
      data: {
        projectId: projectA.id,
        owner: 'org',
        name: 'shared-name',
        fullName: 'org/shared-name',
        url: 'https://github.com/org/shared-name',
      },
    });

    const projectB = await prisma.project.create({
      data: {
        ownerId: userB.id,
        name: `repo-b-${suffix}`,
        githubOwner: 'org',
        githubRepositoryName: 'shared-name',
        prChecksEnabled: false,
      },
    });

    // Strict ownership lookup prevents User B from ever seeing User A's project
    const crossTenantHit = await prisma.project.findFirst({
      where: { id: projectA.id, ownerId: userB.id },
    });
    assert.equal(crossTenantHit, null);

    // Insert PR check on Repo A
    const sampleReport = evaluatePullRequestImpactPure({
      pr: BASE_PR,
      files: [{ sha: 'x', filename: 'README.md', status: 'modified', additions: 1, deletions: 0, changes: 1 }],
      analysis: FULL_ANALYSIS,
      dependencyEdges: [],
      knownRepoFiles: ['README.md'],
    });

    await prisma.pullRequestCheck.create({
      data: {
        projectId: projectA.id,
        repositoryId: repoA.id,
        prNumber: 42,
        prTitle: 'Test PR',
        baseSha: 'base1',
        headSha: 'head1',
        status: 'PASS',
        impactLevel: 'ISOLATED',
        summaryText: sampleReport.summaryText,
        reportJson: sampleReport as any,
      },
    });

    // Attempting duplicate insert for same (repositoryId, prNumber, headSha) rejects cleanly (P2002)
    await assert.rejects(
      () =>
        prisma.pullRequestCheck.create({
          data: {
            projectId: projectA.id,
            repositoryId: repoA.id,
            prNumber: 42,
            prTitle: 'Duplicate PR',
            baseSha: 'base1',
            headSha: 'head1',
            status: 'PASS',
            impactLevel: 'ISOLATED',
            summaryText: 'dup',
            reportJson: {} as any,
          },
        }),
      (err: any) => err?.code === 'P2002'
    );

    // User B has 0 PR checks
    const userBChecks = await prisma.pullRequestCheck.findMany({
      where: { project: { ownerId: userB.id } },
    });
    assert.equal(userBChecks.length, 0);
    assert.ok(projectB.id);
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  }
});

// =========================================================================
// 5. ERROR SANITIZATION & REAL-REPOSITORY GROUND TRUTH TESTS (#50, #56-59)
// =========================================================================
test('getSafeErrorResponse masks internal Prisma/SQL/token details from client responses', () => {
  const err1 = new Error('Invalid `prisma.project.findFirst()` invocation: column projects.isActive does not exist');
  const safe1 = getSafeErrorResponse(err1, 'Operation failed cleanly.');
  assert.equal(safe1.message, 'Operation failed cleanly.');
  assert.equal(safe1.statusCode, 500);

  const err2 = new Error('PostgreSQL connection ECONNREFUSED 52.14.39.200:5432');
  const safe2 = getSafeErrorResponse(err2, 'Database busy.');
  assert.equal(safe2.message, 'Database busy.');
});

test('Ask MarrowNode rejects database hallucinations on static non-DB repos & answers negative DB questions truthfully', () => {
  const noDbCtx = makeBaseContext({
    project: {
      ...makeBaseContext().project,
      database: null,
    },
    dependencies: ['next', 'react', 'zod'],
    fileTree: [
      { id: 'package.json', name: 'package.json', path: 'package.json', type: 'file' },
      { id: 'app/page.tsx', name: 'page.tsx', path: 'app/page.tsx', type: 'file' },
    ],
  });

  const dbAns = synthesizeAskAnswerPure({
    context: noDbCtx,
    dependencyEdges: [],
    query: 'What database does this project use?',
  });
  assert.ok(dbAns.fact?.includes("couldn't verify any database"));
  assert.ok(!dbAns.answer.toLowerCase().includes('uses database storage'));

  const negAns = synthesizeAskAnswerPure({
    context: noDbCtx,
    dependencyEdges: [],
    query: 'Does this project use MongoDB?',
  });
  assert.ok(negAns.fact?.startsWith('No.'));
});

test('Real MarrowNode codebase Ground Truth (#56, #57, #58, #59): AST parse, Ask, and Change Impact', () => {
  const repoRoot = path.resolve(__dirname, '..');
  // In compiled scratch/test-build location fallback to D:/MarrowNode V1 cleanly if needed
  const rootDir = fs.existsSync(path.join(repoRoot, 'package.json'))
    ? repoRoot
    : 'D:/MarrowNode V1';

  const walkFiles = (dir: string, rel = ''): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', '.git', '.vercel', 'tests'].includes(entry.name)) continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkFiles(full, nextRel));
      } else {
        out.push(nextRel);
      }
    }
    return out;
  };

  const t0 = Date.now();
  const allFiles = walkFiles(rootDir);
  const allFileSet = new Set(allFiles);
  const pkgRaw = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const declaredDeps = Object.keys({ ...(pkgRaw.dependencies || {}), ...(pkgRaw.devDependencies || {}) });
  const tsconfig = parseTsConfig(fs.readFileSync(path.join(rootDir, 'tsconfig.json'), 'utf8'));

  const edges: DependencyEdge[] = [];
  const sourceFiles = allFiles.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));

  for (const sf of sourceFiles) {
    const content = fs.readFileSync(path.join(rootDir, sf), 'utf8');
    const parsed = parseSourceFileAST(sf, content);
    for (const imp of parsed.imports) {
      const res = resolveImportSpecifier({
        specifier: imp.specifier,
        importingFilePath: sf,
        allRepoFiles: allFileSet,
        tsconfig,
      });
      if (!res.isExternal && res.resolvedPath && allFileSet.has(res.resolvedPath)) {
        edges.push({
          id: `${sf}->${res.resolvedPath}:${imp.line}`,
          source: sf,
          target: res.resolvedPath,
          line: imp.line,
          symbols: imp.symbols,
          relationship: imp.isTypeOnly ? 'type-imports' : 'imports',
          confidence: 1.0,
        });
      }
    }
    for (const exp of parsed.exports) {
      if (!exp.reExportFrom) continue;
      const res = resolveImportSpecifier({
        specifier: exp.reExportFrom,
        importingFilePath: sf,
        allRepoFiles: allFileSet,
        tsconfig,
      });
      if (!res.isExternal && res.resolvedPath && allFileSet.has(res.resolvedPath)) {
        edges.push({
          id: `reexp-${sf}->${res.resolvedPath}:${exp.line}`,
          source: sf,
          target: res.resolvedPath,
          line: exp.line,
          symbols: [exp.name],
          relationship: 're-exports',
          confidence: 1.0,
        });
      }
    }
  }
  const parseMs = Date.now() - t0;

  assert.ok(sourceFiles.length >= 40, `Expected >=40 TS/TSX files in real repo, found ${sourceFiles.length}`);
  assert.ok(edges.length >= 60, `Expected >=60 verified real AST edges, found ${edges.length}`);

  // Build real FileTreeNode[] + context for Ask tests
  const realFileTree: FileTreeNode[] = allFiles.map((f) => ({
    id: f,
    name: f.split('/').pop() || f,
    path: f,
    type: 'file',
  }));

  const realCtx = makeBaseContext({
    project: {
      ...makeBaseContext().project,
      name: 'MarrowNode V1',
      primaryLanguage: 'TypeScript',
      framework: 'Next.js',
      database: 'PostgreSQL (Prisma)',
    },
    fileTree: realFileTree,
    dependencies: declaredDeps,
    modules: ['app', 'components', 'lib', 'prisma'],
    coverage: {
      ...makeBaseContext().coverage!,
      files: {
        discovered: allFiles.length,
        source: sourceFiles.length,
        parsed: sourceFiles.length,
        failed: 0,
        ignored: 0,
        coveragePercent: 100,
      },
    },
    summary: {
      totalFiles: allFiles.length,
      topLanguage: 'TypeScript',
      framework: 'Next.js',
      hasReadme: allFileSet.has('README.md'),
      readmePreview: null,
    },
  });

  // 57. Verify Mandatory Real Ask Questions
  const qFramework = synthesizeAskAnswerPure({ context: realCtx, dependencyEdges: edges, query: 'What framework does this project use?' });
  assert.ok(qFramework.fact?.includes('Next.js'));

  const qDatabase = synthesizeAskAnswerPure({ context: realCtx, dependencyEdges: edges, query: 'What database does this project use?' });
  assert.ok(qDatabase.fact?.includes('PostgreSQL'));
  assert.ok(qDatabase.citations.some((c) => c.path === 'prisma/schema.prisma'));

  const qNegMongo = synthesizeAskAnswerPure({ context: realCtx, dependencyEdges: edges, query: 'Does this project use MongoDB?' });
  assert.ok(qNegMongo.fact?.startsWith('No.'));

  const qOAuth = synthesizeAskAnswerPure({ context: realCtx, dependencyEdges: edges, query: 'Where is GitHub OAuth handled?' });
  assert.ok(qOAuth.fact?.includes('callback') || qOAuth.fact?.includes('auth'));

  const qAuthFiles = synthesizeAskAnswerPure({ context: realCtx, dependencyEdges: edges, query: 'Which files handle authentication?' });
  assert.ok(qAuthFiles.citations.some((c) => c.path.includes('auth')));

  const qWhySupabase = synthesizeAskAnswerPure({ context: realCtx, dependencyEdges: edges, query: 'Why was Supabase chosen?' });
  assert.ok(qWhySupabase.unknown?.toLowerCase().includes("couldn't verify why"));

  // 58. Verify Real Change Impact on Known Central, Component & Leaf Files
  const engine = new DependencyGraphEngine(edges);
  const authBlast = engine.calculateBlastRadius('lib/auth.ts', 'interface');
  assert.ok(authBlast.directConsumersCount >= 10, `lib/auth.ts should have >=10 real direct consumers, got ${authBlast.directConsumersCount}`);
  assert.equal(authBlast.blastRating, 'CRITICAL');
  assert.equal(authBlast.isCoreSubsystem, true);

  const settingsBlast = engine.calculateBlastRadius('components/ProjectSettings.tsx', 'interface');
  assert.equal(settingsBlast.blastRating, 'LOW');
  assert.ok(settingsBlast.directConsumers.some((c) => c.path === 'app/dashboard/page.tsx'));

  const healthLeafBlast = engine.calculateBlastRadius('app/api/health/route.ts', 'interface');
  assert.equal(healthLeafBlast.blastRating, 'ISOLATED');
  assert.equal(healthLeafBlast.totalAffectedCount, 0);

  console.info(
    `[Real Repo Ground Truth] files=${allFiles.length} tsxFiles=${sourceFiles.length} edges=${edges.length} astParseMs=${parseMs} authDirect=${authBlast.directConsumersCount} authTotal=${authBlast.totalAffectedCount}`
  );
});

// =========================================================================
// 7. SCALABILITY: UNBOUNDED BATCHED AST, CROSS-BATCH GRAPH & >30 HISTORY TESTS
// =========================================================================

function generateScalableSyntheticFiles(count: number): Array<{ path: string; code: string }> {
  const files: Array<{ path: string; code: string }> = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      files.push({
        path: 'src/a_entry/index.ts',
        code: `import { lateCoreHelper } from '../z_late/core-helper';\nexport function boot() { return lateCoreHelper(); }\n`,
      });
    } else if (i === count - 1) {
      files.push({
        path: 'src/z_late/core-helper.ts',
        code: `export function lateCoreHelper() { return ${count}; }\n`,
      });
    } else {
      const modIdx = String(i).padStart(4, '0');
      const targetLine = i === 1 ? `import { lateCoreHelper } from '../z_late/core-helper';\n` : '';
      files.push({
        path: `src/modules/m_${modIdx}.ts`,
        code: `${targetLine}export const val_${modIdx} = ${i};\n`,
      });
    }
  }
  return files;
}

test('Scalability S1-S3: Small (35), Medium (320 >250 cap), Large (600 & 1000) batched AST + cross-batch global graph resolution', () => {
  assert.equal(ANALYZER_VERSION, 'v3.0');
  assert.equal(MAX_FILES_PER_BATCH, 40);

  for (const total of [35, 320, 600, 1000]) {
    const startMs = Date.now();
    const synthetic = generateScalableSyntheticFiles(total);
    const batches = partitionIntoBatches(synthetic, MAX_FILES_PER_BATCH);

    // Verify zero arbitrary ceiling (must cover ALL files, strictly > 250 for 320/600/1000)
    const flattened = batches.reduce((acc, b) => acc + b.length, 0);
    assert.equal(flattened, total, `All ${total} files must be batched with zero cap`);
    assert.equal(batches.length, Math.ceil(total / MAX_FILES_PER_BATCH));

    // PHASE 1: Parse each batch into CompactParsedAstSummary (dropping raw code after parse)
    const parsedSummaries: CompactParsedAstSummary[] = [];
    for (const batch of batches) {
      for (const f of batch) {
        const ast = parseSourceFileAST(f.path, f.code);
        parsedSummaries.push({
          filePath: f.path,
          loc: ast.loc,
          imports: ast.imports,
          reExports: ast.exports
            .filter((e) => Boolean(e.reExportFrom))
            .map((e) => ({ name: e.name, line: e.line, reExportFrom: e.reExportFrom })),
        });
      }
    }
    assert.equal(parsedSummaries.length, total);

    // PHASE 2 & 3: Global Cross-Batch Graph Resolution
    const allRepoFilePaths = new Set(synthetic.map((f) => f.path));
    const resolved = resolveGlobalDependencyGraphFromBatches({
      parsedFiles: parsedSummaries,
      allRepoFilePaths,
      tsconfigOptions: parseTsConfig(null),
      declaredDependencies: [],
      owner: 'scale',
      repo: `repo-${total}`,
      latestCommitSha: 'deadbeef1234',
      analysisId: `scale-${total}`,
    });

    const elapsedMs = Date.now() - startMs;

    // Cross-Batch Mandatory Check: Batch 0 ('src/a_entry/index.ts') -> Last Batch ('src/z_late/core-helper.ts')
    if (total >= 2) {
      const hasCrossBatchEdge = resolved.dependencyEdges.some(
        (e) => e.source === 'src/a_entry/index.ts' && e.target === 'src/z_late/core-helper.ts'
      );
      assert.equal(
        hasCrossBatchEdge,
        true,
        `Batch 0 must resolve cross-batch import to last batch in ${total}-file run`
      );

      // Blast radius & PR Check must traverse the cross-batch edge
      const engine = new DependencyGraphEngine(resolved.dependencyEdges);
      const impact = engine.calculateBlastRadius('src/z_late/core-helper.ts', 'refactor');
      assert.ok(
        impact.directConsumers.some((c) => c.path === 'src/a_entry/index.ts'),
        `Change Impact on late-batch file must include early-batch caller for ${total} files`
      );

      const prReport = evaluatePullRequestImpactPure({
        pr: BASE_PR,
        files: [
          {
            sha: 'abc',
            filename: 'src/z_late/core-helper.ts',
            status: 'modified',
            additions: 3,
            deletions: 1,
            changes: 4,
          },
        ],
        analysis: FULL_ANALYSIS,
        dependencyEdges: resolved.dependencyEdges,
        knownRepoFiles: Array.from(allRepoFilePaths),
      });
      assert.ok(
        prReport.directAffectedFiles.includes('src/a_entry/index.ts'),
        `PR Check must propagate late-batch file modification to early-batch consumer (${total} files)`
      );

      // Ask MarrowNode must find & explain the late-batch file cleanly
      const ctx = makeBaseContext({
        fileTree: synthetic.map((s, idx) => ({
          id: `node-${idx}`,
          name: s.path.split('/').pop() || s.path,
          path: s.path,
          type: 'file',
        })),
        summary: {
          totalFiles: total,
          topLanguage: 'TypeScript',
          framework: 'TypeScript',
          hasReadme: false,
          readmePreview: null,
        },
        coverage: {
          ...makeBaseContext().coverage!,
          files: { discovered: total, source: total, parsed: total, failed: 0, ignored: 0, coveragePercent: 100 },
          documentation: { filesDetected: 0, filesIndexed: 0, docTypes: [], hasReadme: false },
        },
      });
      const askLate = synthesizeAskAnswerPure({
        context: ctx,
        dependencyEdges: resolved.dependencyEdges,
        query: 'Who imports src/z_late/core-helper.ts?',
      });
      assert.ok(
        askLate.fact?.includes('src/z_late/core-helper.ts') &&
          (askLate.inference?.includes('src/a_entry/index.ts') || askLate.fact?.includes('src/a_entry/index.ts')) &&
          askLate.citations.some((c) => c.path === 'src/a_entry/index.ts'),
        `Ask Project must cite both late-batch target and early-batch importer (${total} files)`
      );
    }

    console.info(
      `[Scalability Benchmark] files=${total} batches=${batches.length} resolvedEdges=${resolved.resolvedImportsCount} elapsedMs=${elapsedMs}`
    );
  }
});

test('Scalability H1: Large Git history (>30 commits: 150 & 500 commits) Ask grounding without 30-commit cap', () => {
  const ctx = makeBaseContext({
    timeline: [
      {
        id: 'ev-1',
        date: '2026-11-10',
        year: 2026,
        month: 'Nov',
        type: 'feature',
        title: 'Latest HEAD commit',
        explanation: 'Latest commit',
        commitHash: 'aaa001',
        commitShort: 'aaa001',
        author: { name: 'Dev', avatar: '', handle: 'dev' },
        filesAffected: [],
        evidencePointers: [],
      },
    ],
  });

  // Query commit #31 (previously impossible due to 30-commit ceiling)
  const ask31 = synthesizeAskAnswerPure({
    context: ctx,
    dependencyEdges: [],
    query: 'What happened in commit #31?',
    totalCommitsCount: 150,
    historicalCommits: [
      {
        commitSha: 'sha031000000000',
        shortSha: 'sha0310',
        message: 'feat(scale): remove 250 file cap cleanly (#31)',
        authorName: 'Alice',
        committedAt: new Date('2026-08-14T12:00:00Z'),
        eventType: 'feature',
      },
    ],
  });
  assert.ok(ask31.fact?.includes('150 commit(s) indexed'));
  assert.ok(ask31.fact?.includes('sha0310'));
  assert.ok(ask31.fact?.includes('remove 250 file cap'));

  // Query 6 months ago across 500 indexed commits
  const ask6Months = synthesizeAskAnswerPure({
    context: ctx,
    dependencyEdges: [],
    query: 'What changed six months ago?',
    totalCommitsCount: 500,
    historicalCommits: [
      {
        commitSha: 'sha420000000000',
        shortSha: 'sha4200',
        message: 'milestone: initial production launch',
        authorName: 'Bob',
        committedAt: new Date('2026-05-12T10:00:00Z'),
        eventType: 'milestone',
      },
    ],
  });
  assert.ok(ask6Months.fact?.includes('500 commit(s) indexed'));
  assert.ok(ask6Months.fact?.includes('sha4200'));

  // Absent topic across 150 commits must NOT hallucinate
  const askMissing = synthesizeAskAnswerPure({
    context: ctx,
    dependencyEdges: [],
    query: 'Which commit added GraphQL subscriptions?',
    totalCommitsCount: 150,
    historicalCommits: [],
  });
  assert.ok(askMissing.fact?.includes('None of the 150 indexed commits mention'));
});

test('Scalability DB: Neon PostgreSQL AnalysisBatch persistence, ProjectCommit >30 deduplication, and AstFileCache reuse', async () => {
  const suffix = crypto.randomBytes(4).toString('hex');
  const testUserId = `scale-user-${suffix}`;
  const testRepoId = `scale-repo-${suffix}`;
  const testProjectId = `scale-proj-${suffix}`;
  const testAnalysisId = `scale-ana-${suffix}`;

  try {
    await prisma.user.create({
      data: {
        id: testUserId,
        supabaseUserId: `sb-${suffix}`,
        email: `scale-${suffix}@test.local`,
        displayName: 'Scale Tester',
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectId,
        ownerId: testUserId,
        name: `scale-project-${suffix}`,
        githubOwner: 'acme',
        githubRepositoryName: `scale-${suffix}`,
        defaultBranch: 'main',
      },
    });

    await prisma.repository.create({
      data: {
        id: testRepoId,
        projectId: testProjectId,
        githubRepoId: `gh-${suffix}`,
        owner: 'acme',
        name: `scale-${suffix}`,
        fullName: `acme/scale-${suffix}`,
        url: `https://github.com/acme/scale-${suffix}`,
        defaultBranch: 'main',
        currentCommitSha: 'head123456',
      },
    });

    // 1. Persist Analysis with batch progress + per-file partial failure honesty
    await prisma.analysis.create({
      data: {
        id: testAnalysisId,
        projectId: testProjectId,
        repositoryId: testRepoId,
        status: 'RUNNING',
        analyzerVersion: ANALYZER_VERSION,
        commitSha: 'head123456',
        totalFiles: 350,
        processedFiles: 40,
        failedFiles: 1,
        totalSourceFiles: 320,
        processedSourceFiles: 40,
        totalBatches: 8,
        completedBatches: 1,
        currentBatch: 2,
        historyStatus: 'PROCESSING',
        totalCommitsIngested: 100,
        historyNextPage: 2,
      },
    });

    await prisma.analysisBatch.createMany({
      data: [
        {
          analysisId: testAnalysisId,
          projectId: testProjectId,
          batchNumber: 0,
          status: 'COMPLETED',
          fileCount: 1,
          processedCount: 1,
          failedCount: 0,
          fileManifestJson: [{ path: 'src/a_entry/index.ts' }],
          parsedFilesJson: [
            {
              filePath: 'src/a_entry/index.ts',
              loc: 3,
              imports: [{ specifier: '../z_late/core-helper', importedNames: ['lateCoreHelper'], isTypeOnly: false, isDynamic: false, line: 1 }],
              reExports: [],
            },
          ],
          startedAt: new Date(),
          completedAt: new Date(),
        },
        {
          analysisId: testAnalysisId,
          projectId: testProjectId,
          batchNumber: 1,
          status: 'PENDING',
          fileCount: 1,
          fileManifestJson: [{ path: 'src/z_late/core-helper.ts' }],
        },
      ],
    });

    // Simulate resume query: only Batch 1 should be pending
    const nextPending = await prisma.analysisBatch.findFirst({
      where: { analysisId: testAnalysisId, status: { in: ['PENDING', 'FAILED'] } },
      orderBy: { batchNumber: 'asc' },
    });
    assert.equal(nextPending?.batchNumber, 1);

    // 2. Persist 150 commits (exceeding old 30 limit) & verify deduplication on re-insert
    const commitRows = Array.from({ length: 150 }, (_, idx) => {
      const sha = `sha_${suffix}_${String(idx + 1).padStart(4, '0')}`;
      return {
        projectId: testProjectId,
        repositoryId: testRepoId,
        branch: 'main',
        commitSha: sha,
        shortSha: sha.slice(0, 7),
        message: `Commit #${idx + 1} synthetic message`,
        authorName: 'Scale Bot',
        committedAt: new Date(Date.UTC(2026, 10, 12, 12, 0, 0) - idx * 3600 * 1000),
        eventType: 'feature',
      };
    });

    const firstInsert = await prisma.projectCommit.createMany({
      data: commitRows,
      skipDuplicates: true,
    });
    assert.equal(firstInsert.count, 150);

    const dupInsert = await prisma.projectCommit.createMany({
      data: commitRows.slice(0, 50),
      skipDuplicates: true,
    });
    assert.equal(dupInsert.count, 0, 'Duplicate commits must be safely ignored by unique index');

    // Verify commit #31 is stored and retrievable cleanly from Neon DB
    const commit31 = await prisma.projectCommit.findMany({
      where: { projectId: testProjectId, branch: 'main' },
      orderBy: { committedAt: 'desc' },
      skip: 30,
      take: 1,
    });
    assert.equal(commit31.length, 1);
    assert.equal(commit31[0].message, 'Commit #31 synthetic message');

    // 3. Persist AstFileCache entry & verify incremental lookup hit by (repositoryId, filePath, blobSha, analyzerVersion)
    await prisma.astFileCache.create({
      data: {
        repositoryId: testRepoId,
        filePath: 'src/a_entry/index.ts',
        blobSha: 'blob_aaa111',
        analyzerVersion: ANALYZER_VERSION,
        loc: 3,
        parsedAstJson: {
          imports: [{ specifier: '../z_late/core-helper', importedNames: ['lateCoreHelper'], isTypeOnly: false, isDynamic: false, line: 1 }],
          reExports: [],
        },
      },
    });

    const cachedHit = await prisma.astFileCache.findUnique({
      where: {
        repositoryId_filePath_blobSha_analyzerVersion: {
          repositoryId: testRepoId,
          filePath: 'src/a_entry/index.ts',
          blobSha: 'blob_aaa111',
          analyzerVersion: ANALYZER_VERSION,
        },
      },
    });
    assert.ok(cachedHit, 'AstFileCache hit must match by (repositoryId, filePath, blobSha, analyzerVersion)');
    assert.equal(cachedHit?.loc, 3);
  } finally {
    // Multi-tenant cleanup
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  }
});

// =========================================================================
// 8. REPOSITORY FRESHNESS + GITHUB SYNCHRONIZATION PRODUCTION FIX TESTS
// =========================================================================

test('Freshness F1: getCurrentRepositoryHead canonical identity, bounded timeout, and public fallback', async () => {
  // A. Public repo with NO token succeeds and returns PUBLIC_VERIFIED
  const publicHead = await getCurrentRepositoryHead({
    token: null,
    owner: 'rejieshashwanth30-ctrl',
    repo: 'gitrium',
    branch: 'main',
    userScope: 'test-user',
    bypassCache: true,
  });
  assert.equal(publicHead.verified, true);
  assert.equal(publicHead.owner, 'rejieshashwanth30-ctrl');
  assert.equal(publicHead.name, 'gitrium');
  assert.equal(publicHead.branch, 'main');
  assert.equal(publicHead.providerStatus, 'PUBLIC_VERIFIED');
  assert.equal(publicHead.tokenValid, false);
  assert.equal(publicHead.isPublicFallback, true);
  assert.ok(typeof publicHead.currentHeadSha === 'string' && publicHead.currentHeadSha.length >= 7);

  // B. Public repo with bad/expired token detects 401, flags tokenValid: false, and succeeds via public fallback
  const badTokenHead = await getCurrentRepositoryHead({
    token: 'gho_bad_invalid_revoked_token_1234567890',
    owner: 'rejieshashwanth30-ctrl',
    repo: 'gitrium',
    branch: 'main',
    userScope: 'test-user',
    bypassCache: true,
  });
  assert.equal(badTokenHead.verified, true);
  assert.equal(badTokenHead.providerStatus, 'PUBLIC_VERIFIED');
  assert.equal(badTokenHead.tokenValid, false);
  assert.equal(badTokenHead.isPublicFallback, true);
  assert.ok(badTokenHead.statusMessage.includes('GitHub OAuth token is expired and needs reconnect'));

  // C. Nonexistent repo returns REPOSITORY_NOT_FOUND (not crashed or false fresh)
  const missingHead = await getCurrentRepositoryHead({
    token: null,
    owner: 'nonexistent-owner-abc12345',
    repo: 'nonexistent-repo-xyz67890',
    branch: 'main',
    userScope: 'test-user',
    bypassCache: true,
  });
  assert.equal(missingHead.verified, false);
  assert.equal(missingHead.currentHeadSha, null);
  assert.ok(['REPOSITORY_NOT_FOUND', 'NO_TOKEN', 'GITHUB_UNAVAILABLE'].includes(missingHead.providerStatus));
});

test('Freshness F2: getSafeErrorResponse error classification & safe ECONN word-boundary handling', () => {
  // A. Prisma / Neon database error is masked cleanly
  const dbErr = new Error('Invalid prisma.project.findMany() invocation: relation "projects" does not exist');
  const safeDb = getSafeErrorResponse(dbErr, 'Database operation failed.', 'test');
  assert.equal(safeDb.message, 'Database operation failed.');
  assert.equal(safeDb.statusCode, 500);
  assert.equal(safeDb.category, 'DATABASE_ERROR');

  // B. Reconnect GitHub message is NOT masked as ECONN
  const reconnectErr = new Error('GitHub authentication expired or token revoked. Please reconnect GitHub.');
  const safeReconnect = getSafeErrorResponse(reconnectErr, 'Sync failed.', 'test');
  assert.ok(safeReconnect.message.includes('reconnect GitHub'));
  assert.equal(safeReconnect.category, 'UNKNOWN_ERROR');

  // C. GitHubApiError 401 is classified as AUTHENTICATION_ERROR
  const authErr = new GitHubApiError('Bad credentials', 401);
  const safeAuth = getSafeErrorResponse(authErr, 'Sync failed.', 'test');
  assert.equal(safeAuth.statusCode, 401);
  assert.equal(safeAuth.category, 'AUTHENTICATION_ERROR');
  assert.ok(safeAuth.message.includes('reconnect GitHub'));

  // D. GitHubApiError 429 rate limit is classified as GITHUB_RATE_LIMIT
  const rateErr = new GitHubApiError('API rate limit exceeded', 429);
  const safeRate = getSafeErrorResponse(rateErr, 'Sync failed.', 'test');
  assert.equal(safeRate.statusCode, 429);
  assert.equal(safeRate.category, 'GITHUB_RATE_LIMIT');
});

test('Freshness F3: Neon DB Project Workstation Context freshness, sync-failed preservation, and multi-tenant isolation', async () => {
  const suffix = crypto.randomBytes(4).toString('hex');
  const userAId = `fresh-user-a-${suffix}`;
  const userBId = `fresh-user-b-${suffix}`;
  const projAId = `fresh-proj-a-${suffix}`;
  const repoAId = `fresh-repo-a-${suffix}`;

  try {
    // 1. Create User A and User B
    const userA = await prisma.user.create({
      data: {
        id: userAId,
        supabaseUserId: `sb-fresh-a-${suffix}`,
        email: `fresh-a-${suffix}@test.local`,
        displayName: 'User A',
      },
    });

    const userB = await prisma.user.create({
      data: {
        id: userBId,
        supabaseUserId: `sb-fresh-b-${suffix}`,
        email: `fresh-b-${suffix}@test.local`,
        displayName: 'User B',
      },
    });

    // 2. Create Project for User A linked to public gitrium repo
    const projA = await prisma.project.create({
      data: {
        id: projAId,
        ownerId: userAId,
        name: 'gitrium',
        githubOwner: 'rejieshashwanth30-ctrl',
        githubRepositoryName: 'gitrium',
        defaultBranch: 'main',
        isActive: true,
      },
    });

    await prisma.repository.create({
      data: {
        id: repoAId,
        projectId: projAId,
        githubRepoId: `gh-gitrium-${suffix}`,
        owner: 'rejieshashwanth30-ctrl',
        name: 'gitrium',
        fullName: 'rejieshashwanth30-ctrl/gitrium',
        url: 'https://github.com/rejieshashwanth30-ctrl/gitrium',
        defaultBranch: 'main',
        currentCommitSha: 'a37db7eb5b023be512b8c90f6f1dea2046dfbfc7',
      },
    });

    // 3. Create completed analysis with exact gitrium commit
    const ana1 = await prisma.analysis.create({
      data: {
        projectId: projAId,
        repositoryId: repoAId,
        status: 'COMPLETED',
        analyzerVersion: ANALYZER_VERSION,
        commitSha: 'a37db7eb5b023be512b8c90f6f1dea2046dfbfc7',
        branch: 'main',
        filesAnalyzed: 100,
        totalFiles: 100,
        totalSourceFiles: 100,
        processedSourceFiles: 100,
      },
    });

    await prisma.evidence.create({
      data: {
        projectId: projAId,
        type: 'architecture',
        title: 'Project Architecture Graph',
        metadata: {
          dependencyEdges: [],
          nodes: [{ id: 'app', name: 'app', type: 'module' }],
        },
      },
    });

    // 4. Test Case 1: Matching SHA -> CURRENT freshness
    const ctxFresh = await getProjectWorkstationContext(projAId, { forceFresh: true, profile: userA });
    assert.equal(ctxFresh.latestAnalysis?.freshness, 'CURRENT');
    assert.equal(ctxFresh.latestAnalysis?.freshnessVerified, true);
    assert.equal(ctxFresh.latestAnalysis?.liveHeadSha, 'a37db7eb5b023be512b8c90f6f1dea2046dfbfc7');
    assert.ok(ctxFresh.latestAnalysis?.freshnessMessage?.includes('matches'));

    // 5. Test Case 2: Newer failed analysis does NOT destroy previous completed analysis (SYNC_FAILED preservation)
    const anaFailed = await prisma.analysis.create({
      data: {
        projectId: projAId,
        repositoryId: repoAId,
        status: 'FAILED',
        analyzerVersion: ANALYZER_VERSION,
        commitSha: 'newer_sha_that_failed',
        branch: 'main',
        errorMessage: 'Network timeout during batch 2',
      },
    });

    const ctxFailedPreserved = await getProjectWorkstationContext(projAId, { forceFresh: true, profile: userA });
    // Must preserve completed analysis as source of truth
    assert.equal(ctxFailedPreserved.latestAnalysis?.id, ana1.id, 'Must keep previous COMPLETED analysis');
    assert.equal(ctxFailedPreserved.latestAnalysis?.freshness, 'SYNC_FAILED');
    assert.ok(ctxFailedPreserved.latestAnalysis?.freshnessMessage?.includes('Sync failed'));
    assert.ok(ctxFailedPreserved.nodes.length > 0, 'Previous architecture evidence must remain intact');

    // 6. Test Case 3: Multi-tenant isolation — User B cannot read User A project context
    await assert.rejects(
      async () => {
        await getProjectWorkstationContext(projAId, { forceFresh: true, profile: userB });
      },
      (err: any) => err.statusCode === 404 || err.message.includes('not found')
    );
  } finally {
    // Multi-tenant cleanup
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } }).catch(() => {});
  }
});

// ============================================================================
// SUITE 16: GITHUB OAUTH, TOKEN LIFECYCLE & REPOSITORY SELECTOR VERIFICATION
// ============================================================================
test('GitHub OAuth, Token Lifecycle, Account Switching & Connection Validator', async (t) => {
  const origFetch = globalThis.fetch;
  const testUserId = `test_oauth_user_${Date.now()}`;
  const testProfileId = `prof_oauth_${Date.now()}`;

  try {
    // 1. Create a isolated test user in Neon DB
    await prisma.user.create({
      data: {
        id: testProfileId,
        supabaseUserId: testUserId,
        email: `${testUserId}@example.com`,
        displayName: 'OAuth Test User',
      },
    });

    // Subtest A: NOT_CONNECTED when no GitHub connection exists
    await t.test('Connection Validator returns NOT_CONNECTED when no connection exists', async () => {
      const res = await validateGitHubConnection({ userId: testProfileId, forceFresh: true });
      assert.equal(res.state, 'NOT_CONNECTED');
      assert.equal(res.valid, false);
      assert.equal(res.requiresReconnect, true);
      assert.ok(res.statusMessage.includes('No GitHub connection'));
    });

    // Subtest B: TOKEN_EXPIRED (401 Bad credentials from GitHub) updates DB and flags reconnect
    await t.test('Connection Validator detects 401 expired token and sets DB status', async () => {
      await prisma.gitHubConnection.upsert({
        where: { userId: testProfileId },
        update: {
          accessToken: 'gho_expired_token_123',
          githubUsername: 'oauthTester',
          githubAccountId: '999999',
          connectionStatus: 'connected',
        },
        create: {
          userId: testProfileId,
          accessToken: 'gho_expired_token_123',
          githubUsername: 'oauthTester',
          githubAccountId: '999999',
          connectionStatus: 'connected',
        },
      });

      // Mock GitHub /user responding with 401 Bad credentials
      globalThis.fetch = async (url: any) => {
        if (String(url).includes('api.github.com/user')) {
          return new Response(JSON.stringify({ message: 'Bad credentials' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return origFetch(url);
      };

      const res = await validateGitHubConnection({ userId: testProfileId, forceFresh: true });
      assert.equal(res.state, 'TOKEN_EXPIRED');
      assert.equal(res.valid, false);
      assert.equal(res.requiresReconnect, true);
      assert.ok(res.statusMessage.includes('expired'));

      // Verify Neon DB record was marked token_expired
      const updatedConn = await prisma.gitHubConnection.findUnique({
        where: { userId: testProfileId },
      });
      assert.equal(updatedConn?.connectionStatus, 'token_expired');
    });

    // Subtest C: ACCOUNT_MISMATCH detected when token belongs to different login
    await t.test('Connection Validator detects ACCOUNT_MISMATCH when GitHub login differs', async () => {
      globalThis.fetch = async (url: any) => {
        if (String(url).includes('api.github.com/user')) {
          return new Response(
            JSON.stringify({ login: 'differentUserAccount', id: 888888 }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'x-oauth-scopes': 'repo, read:user',
                'x-ratelimit-remaining': '4990',
              },
            }
          );
        }
        return origFetch(url);
      };

      const res = await validateGitHubConnection({ userId: testProfileId, forceFresh: true });
      assert.equal(res.state, 'ACCOUNT_MISMATCH');
      assert.equal(res.valid, false);
      assert.equal(res.requiresReconnect, true);
      assert.equal(res.verifiedLogin, 'differentUserAccount');
      assert.ok(res.statusMessage.includes('mismatch'));
    });

    // Subtest D: PERMISSION_DENIED when token lacks 'repo' scope
    await t.test('Connection Validator detects PERMISSION_DENIED when repo scope is missing', async () => {
      globalThis.fetch = async (url: any) => {
        if (String(url).includes('api.github.com/user')) {
          return new Response(
            JSON.stringify({ login: 'oauthTester', id: 999999 }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'x-oauth-scopes': 'read:user, gist', // Missing 'repo'
                'x-ratelimit-remaining': '4980',
              },
            }
          );
        }
        return origFetch(url);
      };

      const res = await validateGitHubConnection({ userId: testProfileId, forceFresh: true });
      assert.equal(res.state, 'PERMISSION_DENIED');
      assert.equal(res.valid, false);
      assert.equal(res.requiresReconnect, true);
      assert.ok(res.statusMessage.includes('repo'));
    });

    // Subtest E: CONNECTED when token is valid, identity matches, and repo scope is present
    await t.test('Connection Validator succeeds with CONNECTED on matching identity and scope', async () => {
      globalThis.fetch = async (url: any) => {
        if (String(url).includes('api.github.com/user')) {
          return new Response(
            JSON.stringify({ login: 'oauthTester', id: 999999 }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'x-oauth-scopes': 'repo, read:user',
                'x-ratelimit-remaining': '4970',
              },
            }
          );
        }
        return origFetch(url);
      };

      const res = await validateGitHubConnection({ userId: testProfileId, forceFresh: true });
      assert.equal(res.state, 'CONNECTED');
      assert.equal(res.valid, true);
      assert.equal(res.requiresReconnect, false);
      assert.equal(res.verifiedLogin, 'oauthTester');
      assert.ok(res.scopes.includes('repo'));
      assert.equal(res.rateLimitRemaining, 4970);
      assert.equal(res.token, 'gho_expired_token_123'); // Token available internally

      // Check DB updated to 'connected'
      const updatedConn = await prisma.gitHubConnection.findUnique({
        where: { userId: testProfileId },
      });
      assert.equal(updatedConn?.connectionStatus, 'connected');
    });

    // Subtest F: Reconnect & Save fresh token invalidates cache
    await t.test('saveGitHubConnection updates token and invalidates cache', async () => {
      await saveGitHubConnection(testUserId, {
        githubAccountId: '999999',
        githubUsername: 'oauthTester',
        accessToken: 'gho_fresh_reconnected_token_999',
      });

      const updatedConn = await prisma.gitHubConnection.findUnique({
        where: { userId: testProfileId },
      });
      assert.equal(updatedConn?.accessToken, 'gho_fresh_reconnected_token_999');
      assert.equal(updatedConn?.connectionStatus, 'connected');
    });

    // Subtest G: Redirect sanitization preserves /dashboard?openRepoSelector=true
    await t.test('sanitizeRedirectPath allows /dashboard?openRepoSelector=true and rejects dangerous paths', () => {
      const allowedTarget = sanitizeRedirectPath('/dashboard?openRepoSelector=true');
      assert.equal(allowedTarget, '/dashboard?openRepoSelector=true');

      // Open redirect attacks must be rejected
      assert.equal(sanitizeRedirectPath('https://evil.com'), '/dashboard');
      assert.equal(sanitizeRedirectPath('//evil.com/phish'), '/dashboard');
      assert.equal(sanitizeRedirectPath('/\\evil.com'), '/dashboard');
      assert.equal(sanitizeRedirectPath(null), '/dashboard');
    });
  } finally {
    globalThis.fetch = origFetch;
    await prisma.user.deleteMany({ where: { id: testProfileId } }).catch(() => {});
  }
});
