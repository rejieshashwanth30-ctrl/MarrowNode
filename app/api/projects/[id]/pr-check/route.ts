import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { GitHubApiError } from '@/lib/github/client';
import { runPullRequestCheckForUser } from '@/lib/services/pr-check';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/pr-check
 * Triggers an evidence-backed PR Check for a real GitHub Pull Request on an owned project.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));
    const prNumber = Number(body.prNumber);
    const forceRerun = Boolean(body.forceRerun);

    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      return NextResponse.json(
        { error: 'A valid positive GitHub Pull Request number (prNumber) is required.' },
        { status: 400 }
      );
    }

    const result = await runPullRequestCheckForUser({
      projectId: params.id,
      prNumber,
      forceRerun,
    });

    return NextResponse.json({
      success: true,
      deduplicated: result.deduplicated,
      check: result.record,
      report: result.report,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: `GitHub API error: ${error.message}` },
        { status: error.statusCode === 404 ? 404 : error.statusCode === 401 ? 401 : 502 }
      );
    }
    console.error('[MarrowNode PR Check Route Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to execute PR check.' },
      { status: 500 }
    );
  }
}

