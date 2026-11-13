import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { verifyProjectFreshness } from '@/lib/services/project-context';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/freshness
 * Performs a lightweight, non-blocking GitHub HEAD freshness check for a project.
 * Updates in-memory workstation context cache upon completion.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const forceFresh = request.nextUrl.searchParams.get('fresh') === 'true';

    const result = await verifyProjectFreshness({
      projectId: params.id,
      profileId: profile.id,
      forceFresh,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Failed to verify repository freshness.',
      `freshness.GET projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}
