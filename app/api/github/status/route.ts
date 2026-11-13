import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getGitHubTokenForCurrentUser } from '@/lib/github/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/github/status
 *
 * Checks GitHub connection status for the authenticated user without exposing tokens.
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const { token, githubUsername, connectionStatus } = await getGitHubTokenForCurrentUser();

    const url = new URL(request.url);
    const validate = url.searchParams.get('validate') === 'true';

    let isConnected = connectionStatus === 'connected' && Boolean(token);
    let tokenExpired = connectionStatus === 'token_expired';

    if (validate && token && isConnected) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'MarrowNode-Developer-Intelligence',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 401) {
          isConnected = false;
          tokenExpired = true;
        }
      } catch {
        // network issue or timeout; preserve current state
      }
    }

    return NextResponse.json({
      connected: isConnected,
      githubUsername,
      hasToken: Boolean(token),
      tokenExpired,
      connectionStatus: tokenExpired ? 'token_expired' : connectionStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}

