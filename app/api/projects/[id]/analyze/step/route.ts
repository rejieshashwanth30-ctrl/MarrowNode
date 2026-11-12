import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { getGitHubTokenForCurrentUser } from '@/lib/github/client';
import { processAnalysisStep, STEP_TIME_BUDGET_MS } from '@/lib/github/analysis';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/analyze/step
 * Resumes an in-progress analysis run cleanly from its last completed batch & commit page.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const project = await getUserProject(params.id);

    const { token } = await getGitHubTokenForCurrentUser();
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub access token missing. Please reconnect GitHub.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let analysisId: string | undefined = typeof body.analysisId === 'string' ? body.analysisId : undefined;

    if (!analysisId) {
      const latestActive = await prisma.analysis.findFirst({
        where: { projectId: project.id, status: { in: ['RUNNING', 'QUEUED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      analysisId = latestActive?.id;
    }

    if (!analysisId) {
      return NextResponse.json(
        { error: 'No active or resumable analysis job found for this project.' },
        { status: 404 }
      );
    }

    const result = await processAnalysisStep({
      token,
      userId: profile.id,
      projectId: project.id,
      analysisId,
      timeBudgetMs: STEP_TIME_BUDGET_MS,
    });

    return NextResponse.json({
      success: true,
      analysisId,
      completed: result.completed,
      status: result.snapshot.status,
      snapshot: result.snapshot,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Unable to advance analysis batch.',
      `analyze.step.POST projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}

