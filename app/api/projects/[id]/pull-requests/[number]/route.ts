import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { getProjectPullRequestCheckDetail } from '@/lib/services/pr-check';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/pull-requests/[number]
 * Returns the full evidence-backed PR Check breakdown for an owned project + PR number.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; number: string } }
) {
  try {
    await requireAuth();
    const prNumber = Number(params.number);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      return NextResponse.json({ error: 'Invalid pull request number.' }, { status: 400 });
    }

    const headSha = request.nextUrl.searchParams.get('headSha');
    const detail = await getProjectPullRequestCheckDetail(params.id, prNumber, headSha);

    if (!detail.check) {
      return NextResponse.json(
        { error: `No PR check report found for PR #${prNumber}.`, ...detail },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to load PR check details.' },
      { status: 500 }
    );
  }
}

