import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError, getOrCreateCurrentProfile } from '@/lib/auth';

export class GitHubApiError extends Error {
  statusCode: number;
  isRateLimit: boolean;
  isAuthError: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
    this.isRateLimit = statusCode === 403 && message.toLowerCase().includes('rate limit');
    this.isAuthError = statusCode === 401;
  }
}

/**
 * Retrieve the verified GitHub access token for the currently authenticated MarrowNode user.
 * STRICT ISOLATION: Queries solely by the current user's verified Supabase ID.
 */
export async function getGitHubTokenForCurrentUser(): Promise<{
  token: string | null;
  githubUsername: string | null;
  connectionStatus: string;
}> {
  const supabaseUser = await requireAuth();

  let userProfile = await prisma.user.findUnique({
    where: { supabaseUserId: supabaseUser.id },
    include: { githubConnection: true },
  });

  if (!userProfile) {
    userProfile = (await getOrCreateCurrentProfile(supabaseUser)) as any;
  }

  if (!userProfile) {
    throw new AuthError('User profile not found in application database', 404);
  }

  const connection = userProfile.githubConnection;
  if (!connection) {
    return {
      token: null,
      githubUsername: null,
      connectionStatus: 'not_connected',
    };
  }

  return {
    token: connection.accessToken || null,
    githubUsername: connection.githubUsername,
    connectionStatus: connection.connectionStatus || 'connected',
  };
}

/**
 * Server-Side GitHub REST API Caller.
 * Automatically injects authentication, versioning, and user-agent headers.
 * NEVER exposes tokens to client responses.
 */
export async function githubRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MarrowNode-Developer-Intelligence',
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let errorDetail = `GitHub API request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.message) {
        errorDetail = errorJson.message;
      }
    } catch (_) {}

    if (response.status === 401) {
      throw new GitHubApiError('GitHub authentication expired or token revoked. Please reconnect GitHub.', 401);
    }
    if (response.status === 403) {
      if (errorDetail.toLowerCase().includes('rate limit')) {
        throw new GitHubApiError('GitHub API rate limit reached. Please try again later.', 403);
      }
      throw new GitHubApiError(`GitHub access forbidden: ${errorDetail}`, 403);
    }
    if (response.status === 404) {
      throw new GitHubApiError(`GitHub resource not found: ${errorDetail}`, 404);
    }

    throw new GitHubApiError(errorDetail, response.status);
  }

  return response.json() as Promise<T>;
}

/**
 * Verify GitHub identity for the authenticated user
 */
export async function fetchAuthenticatedGitHubUser(token: string) {
  return githubRequest<{
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    public_repos: number;
    total_private_repos?: number;
    html_url: string;
  }>('/user', token);
}

export interface GitHubRepositoryItem {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  pushed_at: string;
}

/**
 * Fetch repositories available to the authenticated GitHub user.
 * Supports pagination, sorting, and user affiliation (owner, collaborator, org member).
 */
export async function fetchUserRepositories(
  token: string,
  options: {
    page?: number;
    perPage?: number;
    sort?: 'updated' | 'created' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    visibility?: 'all' | 'public' | 'private';
    affiliation?: string;
  } = {}
): Promise<GitHubRepositoryItem[]> {
  const page = options.page || 1;
  const perPage = Math.min(options.perPage || 30, 50);
  const sort = options.sort || 'updated';
  const direction = options.direction || 'desc';
  const affiliation = options.affiliation || 'owner,collaborator,organization_member';

  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    sort,
    direction,
    affiliation,
  });

  if (options.visibility && options.visibility !== 'all') {
    params.set('visibility', options.visibility);
  }

  return githubRequest<GitHubRepositoryItem[]>(`/user/repos?${params.toString()}`, token);
}

/**
 * Fetch a single repository and verify caller access.
 */
export async function fetchRepositoryDetails(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubRepositoryItem> {
  return githubRequest<GitHubRepositoryItem>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
}

/**
 * Fetch Git Tree recursively to map codebase architecture without cloning the repo.
 */
export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  treeSha: string
): Promise<{
  sha: string;
  truncated: boolean;
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
  }>;
}> {
  return githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    token
  );
}

/**
 * Fetch language breakdown for a repository
 */
export async function fetchRepoLanguages(
  token: string,
  owner: string,
  repo: string
): Promise<Record<string, number>> {
  return githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, token);
}

/**
 * Fetch recent commits to map project development timeline
 */
export async function fetchRepoCommits(
  token: string,
  owner: string,
  repo: string,
  perPage = 10
): Promise<
  Array<{
    sha: string;
    commit: {
      message: string;
      author: {
        name: string;
        email: string;
        date: string;
      } | null;
    };
    html_url: string;
  }>
> {
  return githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${perPage}`,
    token
  );
}

/**
 * Fetch raw file content (e.g., README.md, package.json, requirements.txt)
 */
export async function fetchRepoFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const data = await githubRequest<{
      content: string;
      encoding: string;
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`, token);

    if (data.encoding === 'base64' && data.content) {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
    return null;
  } catch (err) {
    return null;
  }
}

