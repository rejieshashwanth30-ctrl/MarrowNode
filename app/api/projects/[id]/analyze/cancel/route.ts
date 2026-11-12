import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/analyze/cancel
 * Cleanly cancels an active queued/running analysis without altering prior completed snapshots.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const project = await getUserProject(params.id);
    const body = await request.json().catch(() => ({}));
    const analysisId = typeof body.analysisId === 'string' ? body.analysisId : undefined;

    await prisma.analysis.updateMany({
      where: {
        projectId: project.id,
        ...(analysisId ? { id: analysisId } : {}),
        status: { in: ['RUNNING', 'QUEUED', 'PENDING'] },
      },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        errorMessage: 'Cancelled by user.',
      },
    });

    // Restore project badge status if an earlier completed analysis exists
    const priorCompleted = await prisma.analysis.findFirst({
      where: {
        projectId: project.id,
        status: { in: ['COMPLETED', 'PARTIALLY_COMPLETED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        analysisStatus: (priorCompleted?.status as any) || 'CANCELLED',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Unable to cancel analysis.',
      `analyze.cancel.POST projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}

