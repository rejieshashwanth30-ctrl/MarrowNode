import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getOrCreateCurrentProfile } from '@/lib/auth';
import { saveGitHubConnection } from '@/lib/services/users';

export const dynamic = 'force-dynamic';

/**
 * Supabase Auth Callback Route Handler
 * Exchanges authorization code for session, creates/syncs MarrowNode Profile in Neon,
 * and redirects user to /dashboard or next requested path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      try {
        // Sync MarrowNode profile in Neon PostgreSQL
        const profile = await getOrCreateCurrentProfile(data.user);

        // If authenticated via GitHub, sync GitHub connection metadata
        if (
          data.user.app_metadata?.provider === 'github' ||
          data.user.user_metadata?.user_name
        ) {
          const githubUsername =
            data.user.user_metadata?.user_name ||
            data.user.user_metadata?.preferred_username ||
            data.user.email?.split('@')[0] ||
            'github-user';

          const githubAccountId =
            data.user.user_metadata?.provider_id ||
            data.user.user_metadata?.sub ||
            data.user.id;

          await saveGitHubConnection(data.user.id, {
            githubAccountId: String(githubAccountId),
            githubUsername,
            avatarUrl: data.user.user_metadata?.avatar_url || null,
          });
        }
      } catch (profileError) {
        // Non-blocking for session redirect, but log cleanly without secrets
        console.error(
          '[MarrowNode Auth Callback] Error syncing user profile:',
          profileError instanceof Error ? profileError.message : 'Unknown error'
        );
      }

      const forwardUrl = next.startsWith('/') ? `${origin}${next}` : `${origin}/dashboard`;
      return NextResponse.redirect(forwardUrl);
    }
  }

  // Return user to auth with error param if code exchange fails
  return NextResponse.redirect(`${origin}/auth?error=auth_exchange_failed`);
}

