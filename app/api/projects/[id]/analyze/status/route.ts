import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { formatAnalysisProgress } from '@/lib/github/analysis';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/analyze/status
 * Returns persisted live progress metrics and stale-job recoverability status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const project = await getUserProject(params.id);
    const analysisId = request.nextUrl.searchParams.get('analysisId');

    const analysis = await prisma.analysis.findFirst({
      where: {
        projectId: project.id,
        ...(analysisId ? { id: analysisId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!analysis) {
      return NextResponse.json({
        success: true,
        hasAnalysis: false,
        snapshot: null,
        staleRecoverable: false,
      });
    }

    const ageSinceUpdateMs = Date.now() - new Date(analysis.updatedAt).getTime();
    const staleRecoverable =
      (analysis.status === 'RUNNING' || analysis.status === 'QUEUED') &&
      ageSinceUpdateMs > 90 * 1000;

    return NextResponse.json({
      success: true,
      hasAnalysis: true,
      snapshot: formatAnalysisProgress(analysis),
      staleRecoverable,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Failed to load analysis status.',
      `analyze.status.GET projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}

