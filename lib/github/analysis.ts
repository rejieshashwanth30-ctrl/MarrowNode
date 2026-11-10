import { prisma } from '@/lib/prisma';
import {
  fetchRepositoryDetails,
  fetchRepoLanguages,
  fetchRepoCommits,
  fetchRepoTree,
  fetchRepoFileContent,
} from '@/lib/github/client';
import { updateAnalysisRun } from '@/lib/services/analysis';
import { updateProject } from '@/lib/services/projects';

// Directories and binary extensions that must be excluded from codebase parsing
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
  '.jar', '.war', '.bin'
]);

/**
 * Execute the MarrowNode Deterministic Codebase Analysis Pipeline (V1)
 *
 * Reliably maps:
 * 1. Repository metadata & default branch
 * 2. AST / File Tree topology (file counts, directory boundaries, extensions)
 * 3. Language distribution
 * 4. Technical dependency manifests (package.json, requirements.txt, go.mod, Cargo.toml)
 * 5. Architectural framework detection
 * 6. Development commit history
 * 7. Documentation & README context
 *
 * Persists results into Neon PostgreSQL (Analysis and Evidence models).
 */
export async function executeDeterministicAnalysis(params: {
  token: string;
  projectId: string;
  analysisId: string;
  owner: string;
  repo: string;
}) {
  const { token, projectId, analysisId, owner, repo } = params;

  // Mark analysis as RUNNING
  await updateAnalysisRun(projectId, analysisId, {
    status: 'RUNNING',
    startedAt: new Date(),
  });

  try {
    // 1. Fetch Repository Details
    const repoDetails = await fetchRepositoryDetails(token, owner, repo);
    const defaultBranch = repoDetails.default_branch || 'main';

    // 2. Fetch Languages
    const languages = await fetchRepoLanguages(token, owner, repo).catch(() => ({}));
    const totalBytes = Object.values(languages).reduce((acc, bytes) => acc + bytes, 0);
    const topLanguage = Object.keys(languages)[0] || repoDetails.language || 'Unknown';

    // 3. Fetch Recent Commits (Timeline)
    const commits = await fetchRepoCommits(token, owner, repo, 10).catch(() => []);

    // 4. Fetch Git Tree recursively using the default branch
    const treeData = await fetchRepoTree(token, owner, repo, defaultBranch).catch(() => null);

    let totalFiles = 0;
    const extensionCounts: Record<string, number> = {};
    const topLevelDirs = new Set<string>();
    const foundManifests: string[] = [];

    if (treeData && treeData.tree) {
      for (const item of treeData.tree) {
        // Skip ignored directories
        const isIgnored = IGNORED_PATH_SEGMENTS.some((seg) => item.path.includes(seg));
        if (isIgnored) continue;

        if (item.type === 'blob') {
          totalFiles++;

          // Track extension
          const lastDot = item.path.lastIndexOf('.');
          if (lastDot !== -1) {
            const ext = item.path.substring(lastDot).toLowerCase();
            if (!BINARY_EXTENSIONS.has(ext)) {
              extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
            }
          }

          // Check for manifest files
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
          if (parts.length === 1) {
            topLevelDirs.add(parts[0]);
          }
        }
      }
    }

    // 5. Inspect Dependencies & Detect Framework
    let detectedFramework = 'Generic';
    const detectedDependencies: string[] = [];

    // Prioritize root package.json if present
    const packageJsonPath = foundManifests.find((p) => p === 'package.json') || foundManifests.find((p) => p.endsWith('package.json'));
    if (packageJsonPath) {
      const pkgContent = await fetchRepoFileContent(token, owner, repo, packageJsonPath);
      if (pkgContent) {
        try {
          const pkg = JSON.parse(pkgContent);
          const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
          };

          for (const dep of Object.keys(allDeps)) {
            detectedDependencies.push(dep);
          }

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
    }

    // Check Python / Go / Rust if no JS framework detected
    if (detectedFramework === 'Generic') {
      if (foundManifests.some((p) => p.includes('requirements') || p.includes('pyproject'))) {
        detectedFramework = 'Python Application';
      } else if (foundManifests.some((p) => p.includes('go.mod'))) {
        detectedFramework = 'Go Service';
      } else if (foundManifests.some((p) => p.includes('Cargo.toml'))) {
        detectedFramework = 'Rust Project';
      }
    }

    // 6. Check for Documentation (README)
    const readmeContent = await fetchRepoFileContent(token, owner, repo, 'README.md');
    const hasReadme = Boolean(readmeContent);
    const readmePreview = readmeContent
      ? readmeContent.substring(0, 500).replace(/[\r\n]+/g, ' ')
      : null;

    // 7. Store Structured Evidences in Neon PostgreSQL
    let evidenceCreatedCount = 0;

    // Clean existing evidences for this project to keep data pristine
    await prisma.evidence.deleteMany({ where: { projectId } }).catch(() => {});

    // Evidence 1: File Structure & Volume
    await prisma.evidence.create({
      data: {
        projectId,
        type: 'files',
        title: 'Repository Structure & Codebase Volume',
        path: '/',
        metadata: {
          totalFiles,
          defaultBranch,
          extensionBreakdown: Object.entries(extensionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
          topLevelDirectories: Array.from(topLevelDirs),
        },
      },
    });
    evidenceCreatedCount++;

    // Evidence 2: Architecture & Language Topology
    await prisma.evidence.create({
      data: {
        projectId,
        type: 'architecture',
        title: 'Architectural Framework & Language Topology',
        metadata: {
          primaryLanguage: topLanguage,
          framework: detectedFramework,
          languageDistribution: languages,
          modulesCount: topLevelDirs.size,
          modules: Array.from(topLevelDirs),
        },
      },
    });
    evidenceCreatedCount++;

    // Evidence 3: Dependencies & Ecosystem
    if (detectedDependencies.length > 0) {
      await prisma.evidence.create({
        data: {
          projectId,
          type: 'dependencies',
          title: `Detected Dependencies (${detectedDependencies.length} libraries)`,
          path: packageJsonPath || 'manifest',
          metadata: {
            framework: detectedFramework,
            manifests: foundManifests,
            sampleDependencies: detectedDependencies.slice(0, 25),
            totalCount: detectedDependencies.length,
          },
        },
      });
      evidenceCreatedCount++;
    }

    // Evidence 4: Development Timeline (Recent Commits)
    if (commits.length > 0) {
      await prisma.evidence.create({
        data: {
          projectId,
          type: 'commits',
          title: 'Recent Development Commits',
          metadata: {
            commitCount: commits.length,
            recentCommits: commits.map((c) => ({
              sha: c.sha.substring(0, 7),
              message: c.commit.message.split('\n')[0],
              author: c.commit.author?.name || 'Developer',
              date: c.commit.author?.date || null,
            })),
          },
        },
      });
      evidenceCreatedCount++;
    }

    // Evidence 5: Documentation Context
    if (hasReadme) {
      await prisma.evidence.create({
        data: {
          projectId,
          type: 'documentation',
          title: 'Project Documentation (README.md)',
          path: 'README.md',
          metadata: {
            preview: readmePreview,
            hasReadme: true,
          },
        },
      });
      evidenceCreatedCount++;
    }

    // 8. Update Project Status in Neon
    await updateProject(projectId, {
      primaryLanguage: topLanguage,
      framework: detectedFramework,
      analysisStatus: 'COMPLETED',
      lastAnalyzedAt: new Date(),
    });

    // 9. Update Analysis Record in Neon
    await updateAnalysisRun(projectId, analysisId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      filesAnalyzed: totalFiles,
      commitsAnalyzed: commits.length,
      dependenciesDetected: detectedDependencies.length,
      architectureNodes: topLevelDirs.size,
      evidenceCount: evidenceCreatedCount,
    });

    console.log(`[MarrowNode Analysis] Successfully completed analysis ${analysisId} for project ${projectId}`);
    return { success: true, analysisId };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown analysis error';
    console.error(`[MarrowNode Analysis Error] Analysis ${analysisId} failed:`, errorMsg);

    await updateAnalysisRun(projectId, analysisId, {
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: errorMsg,
    }).catch(() => {});

    await updateProject(projectId, {
      analysisStatus: 'FAILED',
    }).catch(() => {});

    throw err;
  }
}

