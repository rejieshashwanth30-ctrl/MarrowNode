import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProjectWorkstationContext } from '@/lib/services/project-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/context
 *
 * Returns the unified workstation context (file tree, topology nodes/edges,
 * git commit timeline, evidence items, and dependencies) for a project.
 * Strictly verifies ownership against the authenticated Supabase user profile.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const context = await getProjectWorkstationContext(params.id);

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error: any) {
    console.error('[MarrowNode Project Context Route Error]:', error);
    const status = error.statusCode || 500;
    return NextResponse.json(
      { error: error?.message || 'Failed to resolve project workstation context' },
      { status }
    );
  }
}
