import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import { getGitHubTokenForCurrentUser, fetchRepoCommits, githubCache } from '@/lib/github/client';
import { executeDeterministicAnalysis } from '@/lib/github/analysis';
import { invalidateProjectContextCache } from '@/lib/services/project-context';
import { invalidateOnboardingCache } from '@/lib/services/onboarding';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/sync
 *
 * Checks live GitHub HEAD (bypassing commit cache) on the default branch.
 * If unchanged & already completed cleanly: returns upToDate: true.
 * If changed (or force=true): triggers idempotent deterministic re-analysis.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const projectId = params.id;

    // Validate project ownership strictly
    const project = await getUserProject(projectId);

    if (!project.githubOwner || !project.githubRepositoryName) {
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

    // Prevent concurrent duplicate runs triggered by double-clicks
    const activeRun = project.analyses.find(
      (a) =>
        a.status === 'RUNNING' &&
        Date.now() - new Date(a.createdAt).getTime() < 2 * 60 * 1000
    );
    if (activeRun) {
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        analysisId: activeRun.id,
        message: 'Repository synchronization and analysis is already in progress.',
      });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);

    // Clear stale GitHub cache before probing live HEAD
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
    const latestCompleted = project.analyses.find((a) => a.status === 'COMPLETED') || null;
    const localSha = latestCompleted?.commitSha || project.repository?.currentCommitSha || null;

    if (
      !force &&
      remoteSha &&
      localSha &&
      remoteSha === localSha &&
      latestCompleted?.status === 'COMPLETED'
    ) {
      await prisma.repository
        .updateMany({
          where: { projectId },
          data: { lastSyncedAt: new Date(), currentCommitSha: remoteSha },
        })
        .catch(() => {});

      invalidateProjectContextCache(projectId);
      invalidateOnboardingCache(projectId);

      console.info(
        `[MarrowNode Sync] upToDate projectId=${projectId} commit=${remoteSha.substring(0, 7)}`
      );

      return NextResponse.json({
        success: true,
        upToDate: true,
        message: `Repository is already up to date with commit ${remoteSha.substring(0, 7)}.`,
        commitSha: remoteSha,
      });
    }

    const analysis = await createAnalysisRun(projectId, {
      status: 'RUNNING',
      analyzerVersion: 'v2.0',
      startedAt: new Date(),
    });

    console.info(
      `[MarrowNode Sync] started projectId=${projectId} analysisId=${analysis.id} targetSha=${remoteSha || 'HEAD'}`
    );

    const result = await executeDeterministicAnalysis({
      token,
      projectId,
      analysisId: analysis.id,
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
    });

    return NextResponse.json({
      success: true,
      upToDate: false,
      reanalyzed: true,
      message: `Synchronized and indexed commit ${remoteSha ? remoteSha.substring(0, 7) : 'HEAD'}.`,
      analysisId: analysis.id,
      commitSha: remoteSha,
      result,
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
