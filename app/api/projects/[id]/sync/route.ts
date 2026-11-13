import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import {
  getGitHubTokenForCurrentUser,
  getCurrentRepositoryHead,
  githubCache,
} from '@/lib/github/client';
import {
  ANALYZER_VERSION,
  formatAnalysisProgress,
  initializeResumableAnalysis,
  processAnalysisStep,
  STEP_TIME_BUDGET_MS,
} from '@/lib/github/analysis';
import { invalidateProjectContextCache, verifyProjectFreshness } from '@/lib/services/project-context';
import { invalidateOnboardingCache } from '@/lib/services/onboarding';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/sync
 * Lightweight non-blocking freshness check handler.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const forceFresh = request.nextUrl.searchParams.get('fresh') === 'true';

    const result = await verifyProjectFreshness({
      projectId: params.id,
      profileId: profile.id,
      forceFresh,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Failed to check repository freshness.',
      `sync.GET projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}

/**
 * POST /api/projects/[id]/sync
 * Checks live GitHub branch HEAD truthfully.
 * - If unchanged and completed under v3.0: returns upToDate: true without running unnecessary re-analysis.
 * - If newer commit detected on GitHub: initiates safe resumable batch analysis without destroying prior completed analysis.
 * - If HEAD cannot be verified: returns explicit classified error (401/404/429/504) without claiming false freshness.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const projectId = params.id;
    const project = await getUserProject(projectId);

    if (!project.repository || !project.githubOwner || !project.githubRepositoryName) {
      return NextResponse.json(
        { error: 'Project does not have a linked GitHub repository.', category: 'REPOSITORY_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Check for an active running/queued job to prevent duplicate concurrent runs
    const activeRun = project.analyses.find(
      (a) =>
        (a.status === 'RUNNING' || a.status === 'QUEUED') &&
        Date.now() - new Date(a.updatedAt).getTime() < 90 * 1000
    );
    if (activeRun) {
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        completed: false,
        analysisId: activeRun.id,
        snapshot: formatAnalysisProgress(activeRun),
        message: 'Repository synchronization and analysis is already in progress.',
      });
    }

    const { token } = await getGitHubTokenForCurrentUser();
    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);

    const latestCompleted = project.analyses.find(
      (a) => a.status === 'COMPLETED' || a.status === 'PARTIALLY_COMPLETED'
    ) || null;
    const targetBranch = latestCompleted?.branch || project.defaultBranch || 'main';

    // Invalidate local GitHub cache before checking live HEAD on user-initiated sync
    githubCache.invalidateRepo(project.githubOwner, project.githubRepositoryName);

    // Verify current branch HEAD via canonical service
    const headResult = await getCurrentRepositoryHead({
      token,
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
      branch: targetBranch,
      userScope: profile.id,
      repositoryId: project.repository.id,
      projectId: project.id,
      analyzedCommitSha: latestCompleted?.commitSha,
      bypassCache: true,
    });

    if (!headResult.verified || !headResult.currentHeadSha) {
      if (headResult.providerStatus === 'TOKEN_EXPIRED' || headResult.providerStatus === 'NO_TOKEN') {
        return NextResponse.json(
          {
            error: 'GitHub authentication expired or token revoked. Please reconnect GitHub and try again.',
            category: 'AUTHENTICATION_ERROR',
          },
          { status: 401 }
        );
      }
      if (headResult.providerStatus === 'RATE_LIMITED') {
        return NextResponse.json(
          {
            error: 'GitHub API rate limit reached. Please wait a moment and try again.',
            category: 'GITHUB_RATE_LIMIT',
          },
          { status: 429 }
        );
      }
      if (headResult.providerStatus === 'REPOSITORY_NOT_FOUND') {
        return NextResponse.json(
          {
            error: `Repository "${project.githubOwner}/${project.githubRepositoryName}" was not found on GitHub.`,
            category: 'REPOSITORY_NOT_FOUND',
          },
          { status: 404 }
        );
      }
      if (headResult.providerStatus === 'BRANCH_NOT_FOUND') {
        return NextResponse.json(
          {
            error: `Branch "${targetBranch}" was not found on GitHub.`,
            category: 'BRANCH_NOT_FOUND',
          },
          { status: 404 }
        );
      }
      if (headResult.providerStatus === 'TIMEOUT') {
        return NextResponse.json(
          {
            error: 'GitHub request timed out while verifying repository changes. Please try again.',
            category: 'GITHUB_TIMEOUT',
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          error: headResult.statusMessage || 'Repository freshness could not be verified against GitHub.',
          category: 'GITHUB_UNAVAILABLE',
        },
        { status: 502 }
      );
    }

    const remoteSha = headResult.currentHeadSha;
    const localSha = latestCompleted?.commitSha || project.repository?.currentCommitSha || null;

    // Up-to-date check: Same SHA + clean completed state
    if (
      !force &&
      remoteSha &&
      localSha &&
      remoteSha === localSha &&
      (latestCompleted?.status === 'COMPLETED' || latestCompleted?.status === 'PARTIALLY_COMPLETED')
    ) {
      await prisma.repository
        .updateMany({
          where: { projectId },
          data: { lastSyncedAt: new Date(), currentCommitSha: remoteSha },
        })
        .catch(() => {});

      invalidateProjectContextCache(projectId);
      invalidateOnboardingCache(projectId);

      return NextResponse.json({
        success: true,
        upToDate: true,
        completed: true,
        message: `Analysis up to date — commit ${remoteSha.substring(0, 7)} matches GitHub ${targetBranch}.`,
        commitSha: remoteSha,
      });
    }

    // If changes detected on private repo but token is expired, reject gracefully
    if (headResult.tokenValid === false && project.visibility === 'private') {
      return NextResponse.json(
        {
          error: 'GitHub authentication expired. Please reconnect GitHub to analyze private repository changes.',
          category: 'AUTHENTICATION_ERROR',
        },
        { status: 401 }
      );
    }

    // Changes detected or older analyzer version -> Start new analysis run without deleting previous completed analysis
    const analysis = await createAnalysisRun(projectId, {
      status: 'QUEUED',
      analyzerVersion: ANALYZER_VERSION,
      startedAt: new Date(),
    });

    await initializeResumableAnalysis({
      token: token || '',
      userId: profile.id,
      projectId,
      repositoryId: project.repository.id,
      analysisId: analysis.id,
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
    });

    const stepResult = await processAnalysisStep({
      token: token || '',
      userId: profile.id,
      projectId,
      analysisId: analysis.id,
      timeBudgetMs: STEP_TIME_BUDGET_MS,
    });

    return NextResponse.json({
      success: true,
      upToDate: false,
      reanalyzed: true,
      completed: stepResult.completed,
      status: stepResult.snapshot.status,
      analysisId: analysis.id,
      commitSha: remoteSha,
      snapshot: stepResult.snapshot,
      message: stepResult.completed
        ? `Synchronized and indexed commit ${remoteSha ? remoteSha.substring(0, 7) : 'HEAD'}.`
        : `Sync started for commit ${remoteSha ? remoteSha.substring(0, 7) : 'HEAD'}; processing batches...`,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Repository synchronization could not be completed. Please try again.',
      `sync.POST projectId=${params.id}`
    );
    return NextResponse.json(
      { error: safe.message, category: safe.category },
      { status: safe.statusCode }
    );
  }
}
