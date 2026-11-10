import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { askProjectQuestion } from '@/lib/services/ai-query';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/ask
 *
 * Evidence-grounded question answering for the active project codebase.
 * Strictly verifies ownership against authenticated user.
 * Body: { query: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const projectId = params.id;
    const body = await request.json();
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
    console.error('[MarrowNode Ask Project Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to answer project question' },
      { status: error?.statusCode || 500 }
    );
  }
}

