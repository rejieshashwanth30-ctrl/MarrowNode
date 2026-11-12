import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import { getGitHubTokenForCurrentUser, fetchRepoCommits, githubCache } from '@/lib/github/client';
import {
  ANALYZER_VERSION,
  formatAnalysisProgress,
  initializeResumableAnalysis,
  processAnalysisStep,
  STEP_TIME_BUDGET_MS,
} from '@/lib/github/analysis';
import { invalidateProjectContextCache } from '@/lib/services/project-context';
import { invalidateOnboardingCache } from '@/lib/services/onboarding';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/sync
 * Checks live GitHub HEAD cleanly. If unchanged and completed cleanly under v3.0: upToDate: true.
 * Otherwise starts resumable batch analysis + paginated history ingestion.
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
        { error: 'Project does not have a linked GitHub repository.' },
        { status: 400 }
      );
    }

    const { token } = await getGitHubTokenForCurrentUser();
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub access token missing. Please reconnect GitHub.' },
        { status: 401 }
      );
    }

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

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);

    githubCache.invalidateRepo(project.githubOwner, project.githubRepositoryName);

    const recentCommits = await fetchRepoCommits(
      token,
      project.githubOwner,
      project.githubRepositoryName,
      1,
      {
        branch: project.defaultBranch || 'main',
        bypassCache: true,
        userScope: profile.id,
      }
    );

    const remoteSha = recentCommits[0]?.sha || null;
    const latestCompleted = project.analyses.find(
      (a) => a.status === 'COMPLETED' || a.status === 'PARTIALLY_COMPLETED'
    ) || null;
    const localSha = latestCompleted?.commitSha || project.repository?.currentCommitSha || null;

    if (
      !force &&
      remoteSha &&
      localSha &&
      remoteSha === localSha &&
      latestCompleted?.analyzerVersion === ANALYZER_VERSION &&
      latestCompleted.status === 'COMPLETED'
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
        message: `Repository is already up to date with commit ${remoteSha.substring(0, 7)}.`,
        commitSha: remoteSha,
      });
    }

    const analysis = await createAnalysisRun(projectId, {
      status: 'QUEUED',
      analyzerVersion: ANALYZER_VERSION,
      startedAt: new Date(),
    });

    await initializeResumableAnalysis({
      token,
      userId: profile.id,
      projectId,
      repositoryId: project.repository.id,
      analysisId: analysis.id,
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
    });

    const stepResult = await processAnalysisStep({
      token,
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
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}
