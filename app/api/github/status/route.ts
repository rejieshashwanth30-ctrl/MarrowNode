import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getGitHubTokenForCurrentUser } from '@/lib/github/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/github/status
 *
 * Checks GitHub connection status for the authenticated user without exposing tokens.
 */
export async function GET() {
  try {
    await requireAuth();
    const { token, githubUsername, connectionStatus } = await getGitHubTokenForCurrentUser();

    return NextResponse.json({
      connected: connectionStatus === 'connected' && Boolean(token),
      githubUsername,
      hasToken: Boolean(token),
      connectionStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
