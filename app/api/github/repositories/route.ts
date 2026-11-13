import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getGitHubTokenForCurrentUser, fetchUserRepositories, GitHubApiError } from '@/lib/github/client';
import { ensureMarrowNodeSchema } from '@/lib/db/init';

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

    // 1. Verify user session
    await requireAuth();

    // 2. Retrieve user's stored GitHub token securely
    const { token, githubUsername, connectionStatus } = await getGitHubTokenForCurrentUser();

    if (connectionStatus === 'not_connected' || !githubUsername) {
      return NextResponse.json(
        {
          error: 'GitHub is not connected. Please connect your GitHub account to continue.',
          connectionStatus: 'not_connected',
          repositories: [],
        },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        {
          error: 'GitHub access token is missing or expired. Please reconnect GitHub.',
          connectionStatus: 'token_missing',
          repositories: [],
        },
        { status: 401 }
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(50, Math.max(10, parseInt(searchParams.get('per_page') || '25', 10)));
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const filter = (searchParams.get('filter') || 'all').toLowerCase(); // all, owned, private, forks

    // 4. Fetch repositories from GitHub
    const rawRepos = await fetchUserRepositories(token, {
      page,
      perPage,
      sort: 'updated',
      direction: 'desc',
    });

    // 5. Apply filters
    let filtered = rawRepos;

    if (filter === 'owned' && githubUsername) {
      filtered = filtered.filter((r) => r.owner.login.toLowerCase() === githubUsername.toLowerCase() && !r.fork);
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
      repositories,
      page,
      perPage,
      hasMore: rawRepos.length === perPage,
      totalCount: repositories.length,
      githubUsername,
    });
  } catch (error: any) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        {
          error: error.message,
          connectionStatus: error.isAuthError ? 'token_expired' : 'connected',
          isRateLimit: error.isRateLimit,
          isAuthError: error.isAuthError,
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

