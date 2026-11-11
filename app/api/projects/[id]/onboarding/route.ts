import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { getDeveloperOnboarding } from '@/lib/services/onboarding';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/onboarding
 * Generates or returns cached Developer Onboarding intelligence strictly for the owned project.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const forceFresh = request.nextUrl.searchParams.get('fresh') === 'true';
    const onboarding = await getDeveloperOnboarding(params.id, { forceFresh });

    return NextResponse.json({ onboarding });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[MarrowNode Onboarding Route Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load Developer Onboarding intelligence.' },
      { status: 500 }
    );
  }
}

