import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { getDeveloperOnboarding } from '@/lib/services/onboarding';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/onboarding/evidence
 * Returns structured FACT / INFERENCE / UNKNOWN epistemic statements and exact evidence refs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const onboarding = await getDeveloperOnboarding(params.id);

    return NextResponse.json({
      projectId: onboarding.projectId,
      snapshot: onboarding.snapshot,
      epistemicSummary: onboarding.epistemicSummary,
      evidenceIndex: onboarding.evidenceIndex,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to load onboarding evidence breakdown.' },
      { status: 500 }
    );
  }
}

