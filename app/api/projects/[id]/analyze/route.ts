import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import { getGitHubTokenForCurrentUser, githubCache } from '@/lib/github/client';
import {
  ANALYZER_VERSION,
  formatAnalysisProgress,
  initializeResumableAnalysis,
  processAnalysisStep,
  STEP_TIME_BUDGET_MS,
} from '@/lib/github/analysis';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/analyze
 *
 * Initializes scalable batch-based analysis + paginated Git history ingestion,
 * executes the initial step within a safe serverless time budget, and returns
 * either the COMPLETED snapshot or live RUNNING progress for resumable stepping.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const projectId = params.id;

    const project = await getUserProject(projectId);

    if (!project.repository || !project.githubOwner || !project.githubRepositoryName) {
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

    // Resume existing active run if triggered recently cleanly instead of spawning duplicates
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
        status: activeRun.status,
        snapshot: formatAnalysisProgress(activeRun),
      });
    }

    githubCache.invalidateRepo(project.githubOwner, project.githubRepositoryName);

    const analysis = await createAnalysisRun(projectId, {
      status: 'QUEUED',
      analyzerVersion: ANALYZER_VERSION,
      startedAt: new Date(),
    });

    console.info(
      `[MarrowNode Analyze] queued projectId=${projectId} analysisId=${analysis.id}`
    );

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
      analysisId: analysis.id,
      completed: stepResult.completed,
      status: stepResult.snapshot.status,
      snapshot: stepResult.snapshot,
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
