import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile, AuthError } from '@/lib/auth';
import { fetchUserRepositories, GitHubApiError } from '@/lib/github/client';
import { ensureMarrowNodeSchema } from '@/lib/db/init';
import { validateGitHubConnection } from '@/lib/github/connection-validator';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/github/repositories
 *
 * Fetches real repositories accessible to the currently authenticated user from GitHub API.
 * Supports pagination, search querying, and visibility filtering.
 * Strictly verifies user ownership and never exposes GitHub tokens to the client.
 */
export async function GET(request: NextRequest) {
  try {
    // 0. Ensure schema exists
    await ensureMarrowNodeSchema();

    // 1. Verify user session & resolve profile
    const supabaseUser = await requireAuth();
    const profile = await getOrCreateCurrentProfile(supabaseUser);

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(50, Math.max(10, parseInt(searchParams.get('per_page') || '25', 10)));
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const filter = (searchParams.get('filter') || 'all').toLowerCase(); // all, owned, private, forks

    // 3. Canonical Connection & Token Validation
    const validation = await validateGitHubConnection({
      userId: profile.id,
      forceFresh: page === 1,
    });

    if (!validation.valid || !validation.token) {
      let status = 401;
      if (validation.state === 'NOT_CONNECTED') status = 400;
      else if (validation.state === 'ACCOUNT_MISMATCH' || validation.state === 'PERMISSION_DENIED') status = 403;
      else if (validation.state === 'RATE_LIMITED') status = 429;
      else if (validation.state === 'GITHUB_UNAVAILABLE') status = 502;

      return NextResponse.json(
        {
          error: validation.statusMessage,
          state: validation.state,
          connectionStatus: validation.state.toLowerCase(),
          requiresReconnect: validation.requiresReconnect,
          repositories: [],
        },
        { status }
      );
    }

    const token = validation.token;
    const effectiveUsername = validation.verifiedLogin || validation.githubUsername;

    // 4. Fetch repositories from GitHub
    let rawRepos;
    try {
      rawRepos = await fetchUserRepositories(token, {
        page,
        perPage,
        sort: 'updated',
        direction: 'desc',
      });
    } catch (fetchErr: any) {
      if (fetchErr instanceof GitHubApiError && fetchErr.isAuthError) {
        // Mark expired in database
        prisma.gitHubConnection
          .updateMany({
            where: { userId: profile.id },
            data: { connectionStatus: 'token_expired' },
          })
          .catch(() => {});

        return NextResponse.json(
          {
            error: 'GitHub authentication expired or token revoked. Please reconnect GitHub.',
            state: 'TOKEN_EXPIRED',
            connectionStatus: 'token_expired',
            requiresReconnect: true,
            repositories: [],
          },
          { status: 401 }
        );
      }
      throw fetchErr;
    }

    // 5. Apply filters
    let filtered = rawRepos;

    if (filter === 'owned' && effectiveUsername) {
      filtered = filtered.filter((r) => r.owner.login.toLowerCase() === effectiveUsername.toLowerCase() && !r.fork);
    } else if (filter === 'private') {
      filtered = filtered.filter((r) => r.private);
    } else if (filter === 'forks') {
      filtered = filtered.filter((r) => r.fork);
    }

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.full_name.toLowerCase().includes(search) ||
          (r.description && r.description.toLowerCase().includes(search))
      );
    }

    // 6. Normalize response format
    const repositories = filtered.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      ownerAvatarUrl: r.owner.avatar_url,
      description: r.description,
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch,
      isPrivate: r.private,
      isFork: r.fork,
      language: r.language,
      stargazersCount: r.stargazers_count,
      forksCount: r.forks_count,
      updatedAt: r.updated_at,
      pushedAt: r.pushed_at,
    }));

    return NextResponse.json({
      connected: true,
      githubUsername: effectiveUsername,
      repositories,
      page,
      perPage,
      hasMore: rawRepos.length === perPage,
      totalCount: repositories.length,
    });
  } catch (error: any) {
    if (error instanceof AuthError || error?.name === 'AuthError') {
      return NextResponse.json(
        {
          error: error.message,
          connectionStatus: 'unauthenticated',
          requiresReconnect: true,
          repositories: [],
        },
        { status: error.statusCode || 401 }
      );
    }

    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        {
          error: error.message,
          connectionStatus: error.isAuthError ? 'token_expired' : 'connected',
          isRateLimit: error.isRateLimit,
          isAuthError: error.isAuthError,
          requiresReconnect: error.isAuthError,
          repositories: [],
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch repositories',
        repositories: [],
      },
      { status: 500 }
    );
  }
}

