import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import { getGitHubTokenForCurrentUser, fetchRepoCommits } from '@/lib/github/client';
import { executeDeterministicAnalysis } from '@/lib/github/analysis';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/sync
 *
 * Checks GitHub for the latest commit on the default branch.
 * If unchanged: returns upToDate: true.
 * If changed: triggers deterministic re-analysis and updates repository snapshot.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
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

    // Check latest commit on GitHub
    const recentCommits = await fetchRepoCommits(
      token,
      project.githubOwner,
      project.githubRepositoryName,
      1
    ).catch(() => []);

    const remoteSha = recentCommits[0]?.sha || null;
    const localSha = project.repository?.currentCommitSha || project.analyses[0]?.commitSha || null;

    // If commit hasn't changed and previous analysis succeeded
    if (
      remoteSha &&
      localSha &&
      remoteSha === localSha &&
      project.analysisStatus === 'COMPLETED'
    ) {
      // Update lastSyncedAt
      await prisma.repository.updateMany({
        where: { projectId },
        data: { lastSyncedAt: new Date() },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        upToDate: true,
        message: `Repository is already up to date with commit ${remoteSha.substring(0, 7)}.`,
        commitSha: remoteSha,
      });
    }

    // New commit detected or initial sync: run analysis
    const analysis = await createAnalysisRun(projectId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

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
      message: `Synchronized and indexed new commit ${remoteSha ? remoteSha.substring(0, 7) : 'HEAD'}.`,
      analysisId: analysis.id,
      commitSha: remoteSha,
      result,
    });
  } catch (error: any) {
    console.error('[MarrowNode Sync Route Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Repository sync failed' },
      { status: error?.statusCode || 500 }
    );
  }
}

