import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { askProjectQuestion } from '@/lib/services/ai-query';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s execution allowance for deep AST/history queries

const ALLOWED_ORIGINS = new Set([
  'https://www.marrownode.online',
  'https://marrownode.online',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://www.marrownode.online',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * POST /api/projects/[id]/ask
 * Evidence-grounded question answering strictly scoped to the owned active project snapshot.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const corsHeaders = getCorsHeaders(request);
  const projectId = params?.id;

  if (!projectId) {
    return NextResponse.json(
      { error: 'Project ID is required' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));
    const query = body?.query;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json(
        { error: 'Valid question query is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.info(
      `[Ask API] Processing query for projectId=${projectId}: "${query.trim().slice(0, 80)}"`
    );

    const result = await askProjectQuestion({
      projectId,
      query: query.trim(),
    });

    return NextResponse.json(
      {
        success: true,
        result,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Unable to answer project question right now. Please try again.',
      `ask.POST projectId=${projectId}`
    );
    return NextResponse.json(
      { error: safe.message },
      { status: safe.statusCode, headers: corsHeaders }
    );
  }
}
