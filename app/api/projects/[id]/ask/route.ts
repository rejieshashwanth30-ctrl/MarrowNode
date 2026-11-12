import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { askProjectQuestion } from '@/lib/services/ai-query';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/ask
 * Evidence-grounded question answering strictly scoped to the owned active project snapshot.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const projectId = params.id;
    const body = await request.json().catch(() => ({}));
    const query = body.query;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json(
        { error: 'Valid question query is required' },
        { status: 400 }
      );
    }

    const result = await askProjectQuestion({
      projectId,
      query: query.trim(),
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Unable to answer project question right now.',
      `ask.POST projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}
