import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import { getGitHubTokenForCurrentUser, githubCache } from '@/lib/github/client';
import { executeDeterministicAnalysis } from '@/lib/github/analysis';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/analyze
 *
 * Initiates the deterministic codebase analysis pipeline for an owned project.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const projectId = params.id;

    // Validate project ownership strictly
    const project = await getUserProject(projectId);

    if (!project.githubOwner || !project.githubRepositoryName) {
      return NextResponse.json(
        { error: 'Project does not have a linked GitHub repository to analyze.' },
        { status: 400 }
      );
    }

    const { token } = await getGitHubTokenForCurrentUser();
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub access token missing. Please reconnect GitHub to run analysis.' },
        { status: 401 }
      );
    }

    // Prevent concurrent duplicate analysis runs
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
        status: 'RUNNING',
      });
    }

    githubCache.invalidateRepo(project.githubOwner, project.githubRepositoryName);

    const analysis = await createAnalysisRun(projectId, {
      status: 'RUNNING',
      analyzerVersion: 'v2.0',
      startedAt: new Date(),
    });

    console.info(
      `[MarrowNode Analyze] started projectId=${projectId} analysisId=${analysis.id}`
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
      analysisId: analysis.id,
      status: 'COMPLETED',
      result,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Repository analysis could not be completed. Please try again.',
      `analyze.POST projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}
