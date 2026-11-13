import { NextResponse } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { validateGitHubConnection } from '@/lib/github/connection-validator';
import { ensureMarrowNodeSchema } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

/**
 * GET /api/github/status
 *
 * Checks GitHub connection status for the authenticated user without exposing tokens.
 * Uses the canonical validateGitHubConnection validator.
 */
export async function GET(request: Request) {
  try {
    await ensureMarrowNodeSchema();
    const supabaseUser = await requireAuth();
    const profile = await getOrCreateCurrentProfile(supabaseUser);

    const url = new URL(request.url);
    const validate = url.searchParams.get('validate') === 'true';

    const validation = await validateGitHubConnection({
      userId: profile.id,
      forceFresh: validate,
    });

    const isConnected = validation.valid;
    const tokenExpired = validation.state === 'TOKEN_EXPIRED';
    const effectiveUsername = validation.verifiedLogin || validation.githubUsername;

    return NextResponse.json({
      connected: isConnected,
      state: validation.state,
      githubUsername: effectiveUsername,
      hasToken: Boolean(validation.token),
      tokenExpired,
      requiresReconnect: validation.requiresReconnect,
      connectionStatus: tokenExpired ? 'token_expired' : validation.state.toLowerCase(),
      scopes: validation.scopes,
      rateLimitRemaining: validation.rateLimitRemaining,
      statusMessage: validation.statusMessage,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}

