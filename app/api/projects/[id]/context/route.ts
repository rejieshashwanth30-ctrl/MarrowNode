import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProjectWorkstationContext } from '@/lib/services/project-context';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/context
 * Returns the unified workstation context strictly scoped by authenticated owner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const forceFresh = request.nextUrl.searchParams.get('fresh') === 'true';
    const context = await getProjectWorkstationContext(params.id, { forceFresh });

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Failed to load project workspace data.',
      `context.GET projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}
