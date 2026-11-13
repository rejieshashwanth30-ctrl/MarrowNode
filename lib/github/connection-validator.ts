import { prisma } from '@/lib/prisma';
import { githubCache } from '@/lib/github/client';

export type GitHubConnectionState =
  | 'CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'ACCOUNT_MISMATCH'
  | 'PERMISSION_DENIED'
  | 'GITHUB_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NOT_CONNECTED';

export interface GitHubConnectionValidationResult {
  state: GitHubConnectionState;
  valid: boolean;
  requiresReconnect: boolean;
  userId: string;
  githubUsername: string | null;
  githubAccountId: string | null;
  verifiedLogin: string | null;
  verifiedId: string | null;
  statusMessage: string;
  scopes: string[];
  rateLimitRemaining: number | null;
  latencyMs: number;
  /** Server-side only: never return this in client-facing API responses */
  token?: string | null;
}

/**
 * Invalidate cached validation result for a user
 */
export function invalidateGitHubConnectionCache(userId: string): void {
  githubCache.delete(`github:conn:val:${userId}`);
}

/**
 * Canonical Server-Side Service: validateGitHubConnection
 *
 * Responsibilities:
 * 1. Resolves authenticated MarrowNode user's GitHub connection from Neon PostgreSQL.
 * 2. Retrieves the stored GitHub OAuth access token.
 * 3. Probes GitHub's authenticated /user endpoint with bounded 4500ms timeout.
 * 4. Verifies token validity, rate-limit headers, and granted OAuth scopes ('repo').
 * 5. Compares returned GitHub identity against stored connection to detect account mismatches.
 * 6. Updates connectionStatus asynchronously in Neon DB on 401 (token_expired) or 200 (connected).
 * 7. Scopes in-memory validation cache strictly per-user (20s TTL).
 * 8. Never exposes raw tokens to client responses or error logs.
 */
export async function validateGitHubConnection(params: {
  userId: string;
  forceFresh?: boolean;
}): Promise<GitHubConnectionValidationResult> {
  const { userId, forceFresh } = params;
  const startMs = Date.now();
  const cacheKey = `github:conn:val:${userId}`;

  if (!forceFresh) {
    const cached = githubCache.get<GitHubConnectionValidationResult>(cacheKey);
    if (cached) {
      return cached.data;
    }
  }

  // 1. Look up user's connection in Neon DB (accepts either Profile cuid or Supabase user uuid)
  const connection = await prisma.gitHubConnection.findFirst({
    where: {
      OR: [
        { userId },
        { user: { supabaseUserId: userId } },
      ],
    },
  });

  if (!connection || !connection.accessToken) {
    const res: GitHubConnectionValidationResult = {
      state: 'NOT_CONNECTED',
      valid: false,
      requiresReconnect: true,
      userId,
      githubUsername: connection?.githubUsername || null,
      githubAccountId: connection?.githubAccountId || null,
      verifiedLogin: null,
      verifiedId: null,
      statusMessage: 'No GitHub connection found. Connect your GitHub account to continue.',
      scopes: [],
      rateLimitRemaining: null,
      latencyMs: Date.now() - startMs,
    };
    return res;
  }

  // 2. Validate token against GitHub /user endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MarrowNode-Developer-Intelligence',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const rateLimitRemaining = ghRes.headers.get('x-ratelimit-remaining')
      ? Number(ghRes.headers.get('x-ratelimit-remaining'))
      : null;

    const rawScopes = ghRes.headers.get('x-oauth-scopes') || '';
    const scopes = rawScopes
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // 3. Handle Token Expired or Revoked (HTTP 401)
    if (ghRes.status === 401) {
      console.warn(
        `[MarrowNode Auth] GitHub token rejected (401 Bad credentials) for user=${userId} login=${connection.githubUsername}`
      );

      // Synchronize connection status in Neon DB
      await prisma.gitHubConnection
        .updateMany({
          where: { id: connection.id },
          data: { connectionStatus: 'token_expired' },
        })
        .catch(() => {});

      const res: GitHubConnectionValidationResult = {
        state: 'TOKEN_EXPIRED',
        valid: false,
        requiresReconnect: true,
        userId,
        githubUsername: connection.githubUsername,
        githubAccountId: connection.githubAccountId,
        verifiedLogin: null,
        verifiedId: null,
        statusMessage: 'GitHub authentication expired or token revoked. Please reconnect GitHub.',
        scopes: [],
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
      };

      githubCache.set(cacheKey, res, 15 * 1000);
      return res;
    }

    // 4. Handle Rate Limiting (HTTP 429 or 403 rate limit)
    if (ghRes.status === 429 || (ghRes.status === 403 && rateLimitRemaining === 0)) {
      const res: GitHubConnectionValidationResult = {
        state: 'RATE_LIMITED',
        valid: false,
        requiresReconnect: false,
        userId,
        githubUsername: connection.githubUsername,
        githubAccountId: connection.githubAccountId,
        verifiedLogin: null,
        verifiedId: null,
        statusMessage: 'GitHub API rate limit reached. Please wait a moment and try again.',
        scopes,
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
      };
      githubCache.set(cacheKey, res, 15 * 1000);
      return res;
    }

    // 5. Handle Permission Denied (HTTP 403)
    if (ghRes.status === 403) {
      const res: GitHubConnectionValidationResult = {
        state: 'PERMISSION_DENIED',
        valid: false,
        requiresReconnect: true,
        userId,
        githubUsername: connection.githubUsername,
        githubAccountId: connection.githubAccountId,
        verifiedLogin: null,
        verifiedId: null,
        statusMessage: 'GitHub access forbidden. Please reconnect with required repository permissions.',
        scopes,
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
      };
      githubCache.set(cacheKey, res, 15 * 1000);
      return res;
    }

    // 6. Handle Success (HTTP 200) -> Parse identity & check account match
    if (ghRes.status === 200) {
      const ghData = (await ghRes.json().catch(() => null)) as {
        login?: string;
        id?: number;
      } | null;

      const verifiedLogin = ghData?.login || null;
      const verifiedId = ghData?.id ? String(ghData.id) : null;

      // Identity validation against stored connection (Section 7)
      if (
        connection.githubUsername &&
        verifiedLogin &&
        connection.githubUsername.toLowerCase() !== verifiedLogin.toLowerCase()
      ) {
        console.warn(
          `[MarrowNode Auth] Account mismatch: stored=@${connection.githubUsername} verified=@${verifiedLogin} user=${userId}`
        );

        const res: GitHubConnectionValidationResult = {
          state: 'ACCOUNT_MISMATCH',
          valid: false,
          requiresReconnect: true,
          userId,
          githubUsername: connection.githubUsername,
          githubAccountId: connection.githubAccountId,
          verifiedLogin,
          verifiedId,
          statusMessage: `GitHub account mismatch: token belongs to @${verifiedLogin}, but workspace is linked to @${connection.githubUsername}. Reconnect to switch accounts cleanly.`,
          scopes,
          rateLimitRemaining,
          latencyMs: Date.now() - startMs,
        };
        githubCache.set(cacheKey, res, 15 * 1000);
        return res;
      }

      // Check required repository scope
      if (scopes.length > 0 && !scopes.includes('repo')) {
        const res: GitHubConnectionValidationResult = {
          state: 'PERMISSION_DENIED',
          valid: false,
          requiresReconnect: true,
          userId,
          githubUsername: verifiedLogin || connection.githubUsername,
          githubAccountId: verifiedId || connection.githubAccountId,
          verifiedLogin,
          verifiedId,
          statusMessage: 'GitHub token lacks "repo" scope. Please reconnect GitHub with repository access.',
          scopes,
          rateLimitRemaining,
          latencyMs: Date.now() - startMs,
        };
        githubCache.set(cacheKey, res, 15 * 1000);
        return res;
      }

      // Valid & Active Connection
      if (connection.connectionStatus !== 'connected') {
        await prisma.gitHubConnection
          .updateMany({
            where: { id: connection.id },
            data: { connectionStatus: 'connected' },
          })
          .catch(() => {});
      }

      const res: GitHubConnectionValidationResult = {
        state: 'CONNECTED',
        valid: true,
        requiresReconnect: false,
        userId,
        githubUsername: verifiedLogin || connection.githubUsername,
        githubAccountId: verifiedId || connection.githubAccountId,
        verifiedLogin,
        verifiedId,
        statusMessage: 'GitHub connection active and verified.',
        scopes,
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
        token: connection.accessToken,
      };

      githubCache.set(cacheKey, res, 20 * 1000);
      return res;
    }

    // 7. Unexpected status code
    return {
      state: 'GITHUB_UNAVAILABLE',
      valid: false,
      requiresReconnect: false,
      userId,
      githubUsername: connection.githubUsername,
      githubAccountId: connection.githubAccountId,
      verifiedLogin: null,
      verifiedId: null,
      statusMessage: `GitHub API returned unexpected status ${ghRes.status}.`,
      scopes,
      rateLimitRemaining,
      latencyMs: Date.now() - startMs,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || String(err).includes('aborted');
    console.error(
      `[MarrowNode Auth] Exception validating connection for user=${userId}: ${err?.message || err}`
    );

    return {
      state: 'GITHUB_UNAVAILABLE',
      valid: false,
      requiresReconnect: false,
      userId,
      githubUsername: connection.githubUsername,
      githubAccountId: connection.githubAccountId,
      verifiedLogin: null,
      verifiedId: null,
      statusMessage: isTimeout
        ? 'GitHub request timed out. Please try again.'
        : 'GitHub service is temporarily unreachable.',
      scopes: [],
      rateLimitRemaining: null,
      latencyMs: Date.now() - startMs,
    };
  }
}
