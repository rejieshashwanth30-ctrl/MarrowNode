import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getOrCreateCurrentProfile } from '@/lib/auth';
import { saveGitHubConnection } from '@/lib/services/users';
import { getAppOrigin, sanitizeRedirectPath } from '@/lib/origin';

export const dynamic = 'force-dynamic';

/**
 * MarrowNode Standard Auth Callback Route Handler
 * GET /auth/callback
 *
 * Exchanges GitHub OAuth code for a Supabase session, synchronizes the MarrowNode user
 * profile in Neon PostgreSQL, stores GitHub connection metadata, and safely redirects
 * to the internal workstation dashboard.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const rawNext = requestUrl.searchParams.get('next');

  // Dynamically resolve application origin
  const appOrigin = getAppOrigin();
  const safeNext = sanitizeRedirectPath(rawNext, '/dashboard');

  console.log('[MarrowNode Auth Callback] OAuth callback reached at /auth/callback');
  console.log('[MarrowNode Auth Callback] Callback origin:', appOrigin);
  console.log('[MarrowNode Auth Callback] Code exists:', Boolean(code));

  // 1. Handle OAuth provider errors or user cancellation
  if (errorParam) {
    console.warn(
      '[MarrowNode Auth Callback] OAuth returned error:',
      errorParam,
      errorDescription || ''
    );
    return NextResponse.redirect(
      `${appOrigin}/auth?error=${encodeURIComponent(errorParam)}`
    );
  }

  // 2. Exchange authorization code for Supabase session
  if (code) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error(
          '[MarrowNode Auth Callback] Code exchange failed:',
          error.message
        );
        return NextResponse.redirect(
          `${appOrigin}/auth?error=auth_exchange_failed`
        );
      }

      if (data?.user) {
        console.log(
          '[MarrowNode Auth Callback] Supabase exchange success for user:',
          data.user.id
        );

        // 3. Synchronize user profile in Neon PostgreSQL (isolated marrownode schema)
        try {
          await getOrCreateCurrentProfile(data.user);

          // 4. Save verified GitHub connection metadata
          const isGitHubProvider =
            data.user.app_metadata?.provider === 'github' ||
            Boolean(data.user.user_metadata?.user_name);

          if (isGitHubProvider) {
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
            console.log(
              '[MarrowNode Auth Callback] GitHub connection recorded for user:',
              data.user.id
            );
          }
        } catch (syncErr: any) {
          // Log failure safely without exposing DB credentials
          console.error(
            '[MarrowNode Auth Callback] Neon profile sync notice:',
            syncErr instanceof Error ? syncErr.message : 'Unknown'
          );
        }

        // 5. Final internal redirect to verified MarrowNode path
        const finalUrl = `${appOrigin}${safeNext}`;
        console.log(
          '[MarrowNode Auth Callback] Final internal redirect path:',
          finalUrl
        );
        return NextResponse.redirect(finalUrl);
      }
    } catch (err: any) {
      console.error(
        '[MarrowNode Auth Callback] Exception during callback processing:',
        err instanceof Error ? err.message : 'Unknown error'
      );
      return NextResponse.redirect(
        `${appOrigin}/auth?error=callback_exception`
      );
    }
  }

  // 6. Missing code parameter
  console.warn('[MarrowNode Auth Callback] Callback reached without code');
  return NextResponse.redirect(`${appOrigin}/auth?error=missing_code`);
}

