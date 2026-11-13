import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError, getOrCreateCurrentProfile } from '@/lib/auth';
import { ensureMarrowNodeSchema } from '@/lib/db/init';
import { githubCache } from '@/lib/github/cache';

export { githubCache };

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
  await ensureMarrowNodeSchema();
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

export interface GitHubResponseMeta {
  status: number;
  rateLimitRemaining: number | null;
  rateLimitResetAt: number | null;
  hasNextPage: boolean;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server-Side GitHub REST API Caller with bounded retries, 429/5xx backoff, and rate-limit headers.
 * NEVER exposes tokens to client responses.
 */
export async function githubRequestWithMeta<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<{ data: T; meta: GitHubResponseMeta }> {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MarrowNode-Developer-Intelligence',
    ...((options.headers as Record<string, string>) || {}),
  };

  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        cache: 'no-store',
        signal: options.signal ?? AbortSignal.timeout(12000),
      });

      const remainingHeader = response.headers.get('x-ratelimit-remaining');
      const resetHeader = response.headers.get('x-ratelimit-reset');
      const retryAfterHeader = response.headers.get('retry-after');
      const linkHeader = response.headers.get('link') || '';

      const rateLimitRemaining = remainingHeader !== null ? Number(remainingHeader) : null;
      const rateLimitResetAt = resetHeader !== null ? Number(resetHeader) * 1000 : null;
      const hasNextPage = /rel="next"/i.test(linkHeader);

      if (response.ok) {
        const data = (await response.json()) as T;
        return {
          data,
          meta: {
            status: response.status,
            rateLimitRemaining: Number.isFinite(rateLimitRemaining) ? rateLimitRemaining : null,
            rateLimitResetAt: Number.isFinite(rateLimitResetAt) ? rateLimitResetAt : null,
            hasNextPage,
          },
        };
      }

      let errorDetail = `GitHub API request failed with status ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson.message) errorDetail = errorJson.message;
      } catch (_) {}

      const isTransient =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status === 403 && retryAfterHeader !== null);

      if (isTransient && attempt < maxAttempts) {
        const retrySec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const backoffMs = Number.isFinite(retrySec)
          ? Math.min(Math.max(retrySec * 1000, 300), 4500)
          : Math.min(500 * Math.pow(2, attempt - 1), 3000);
        await delayMs(backoffMs);
        continue;
      }

      if (response.status === 401) {
        throw new GitHubApiError(
          'GitHub authentication expired or token revoked. Please reconnect GitHub.',
          401
        );
      }
      if (response.status === 403 || response.status === 429) {
        if (errorDetail.toLowerCase().includes('rate limit') || response.status === 429) {
          throw new GitHubApiError('GitHub API rate limit reached. Please wait and resume.', response.status);
        }
        throw new GitHubApiError(`GitHub access forbidden: ${errorDetail}`, 403);
      }
      if (response.status === 404) {
        throw new GitHubApiError(`GitHub resource not found: ${errorDetail}`, 404);
      }

      throw new GitHubApiError(errorDetail, response.status);
    } catch (err: any) {
      lastErr = err;
      if (err instanceof GitHubApiError || err?.name === 'AbortError') {
        if (attempt >= maxAttempts || err instanceof GitHubApiError) {
          throw err;
        }
      }
      if (attempt < maxAttempts) {
        await delayMs(400 * attempt);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr instanceof Error ? lastErr : new GitHubApiError('GitHub API request failed', 500);
}

export async function githubRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const { data } = await githubRequestWithMeta<T>(endpoint, token, options);
  return data;
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
  repo: string,
  userScope = 'default'
): Promise<GitHubRepositoryItem> {
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${userScope}:details`;
  return githubCache.fetchWithCache(
    cacheKey,
    'repo_details',
    () => githubRequest<GitHubRepositoryItem>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token),
    60 * 1000
  );
}

/**
 * Fetch Git Tree recursively to map codebase architecture without cloning the repo.
 */
export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  treeSha: string,
  userScope = 'default'
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
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${userScope}:tree:${treeSha}`;
  return githubCache.fetchWithCache(
    cacheKey,
    'repo_tree',
    () =>
      githubRequest(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
        token
      ),
    15 * 60 * 1000,
    treeSha
  );
}

/**
 * Fetch language breakdown for a repository
 */
export async function fetchRepoLanguages(
  token: string,
  owner: string,
  repo: string,
  userScope = 'default'
): Promise<Record<string, number>> {
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${userScope}:languages`;
  return githubCache.fetchWithCache(
    cacheKey,
    'repo_languages',
    () => githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, token),
    5 * 60 * 1000
  );
}

export interface GitHubCommitItem {
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
}

/**
 * Fetch a specific page of GitHub commits (up to 100/page) with Link rel="next" pagination flag.
 * Cache key includes userScope + owner/repo + branch + page + perPage.
 */
export async function fetchRepoCommitsPaginated(params: {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  page?: number;
  perPage?: number;
  userScope?: string;
  bypassCache?: boolean;
}): Promise<{
  commits: GitHubCommitItem[];
  hasNextPage: boolean;
  rateLimitRemaining: number | null;
}> {
  const {
    token,
    owner,
    repo,
    branch,
    page = 1,
    perPage = 100,
    userScope = 'default',
    bypassCache = false,
  } = params;

  const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${perPage}&page=${page}${branchParam}`;
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${userScope}:commits:${branch || 'default'}:p${page}:${perPage}`;

  if (bypassCache) {
    const { data, meta } = await githubRequestWithMeta<GitHubCommitItem[]>(endpoint, token);
    return {
      commits: data,
      hasNextPage: meta.hasNextPage,
      rateLimitRemaining: meta.rateLimitRemaining,
    };
  }

  return githubCache.fetchWithCache(
    cacheKey,
    'repo_commits_page',
    async () => {
      const { data, meta } = await githubRequestWithMeta<GitHubCommitItem[]>(endpoint, token);
      return {
        commits: data,
        hasNextPage: meta.hasNextPage,
        rateLimitRemaining: meta.rateLimitRemaining,
      };
    },
    30 * 1000
  );
}

/**
 * Fetch recent commits to map project development timeline
 */
export async function fetchRepoCommits(
  token: string,
  owner: string,
  repo: string,
  perPage = 10,
  options?: { branch?: string; bypassCache?: boolean; userScope?: string }
): Promise<GitHubCommitItem[]> {
  const res = await fetchRepoCommitsPaginated({
    token,
    owner,
    repo,
    branch: options?.branch,
    page: 1,
    perPage,
    userScope: options?.userScope,
    bypassCache: options?.bypassCache,
  });
  return res.commits;
}

export type RepositoryHeadProviderStatus =
  | 'VERIFIED'
  | 'PUBLIC_VERIFIED'
  | 'TOKEN_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'REPOSITORY_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'GITHUB_UNAVAILABLE'
  | 'NO_TOKEN'
  | 'UNKNOWN_ERROR';

export interface RepositoryHeadResult {
  verified: boolean;
  repositoryId?: string;
  projectId?: string;
  owner: string;
  name: string;
  branch: string;
  currentHeadSha: string | null;
  verifiedAt: string;
  providerStatus: RepositoryHeadProviderStatus;
  statusMessage: string;
  tokenValid: boolean;
  isPublicFallback: boolean;
  rateLimitRemaining: number | null;
  latencyMs: number;
}

export interface GetCurrentRepositoryHeadParams {
  token: string | null;
  owner: string;
  repo: string;
  branch?: string | null;
  userScope?: string;
  repositoryId?: string;
  projectId?: string;
  analyzedCommitSha?: string | null;
  bypassCache?: boolean;
}

/**
 * Canonical Server-Side Service: getCurrentRepositoryHead
 *
 * Responsibilities:
 * 1. Resolves canonical repository identity: owner + repo + branch.
 * 2. Enforces bounded 4500ms timeout with AbortController so Next.js requests never hang.
 * 3. Checks GitHub with user OAuth token if available.
 * 4. On 401 Bad credentials, asynchronously flags connectionStatus = 'token_expired' in Neon DB,
 *    and falls back to unauthenticated public verification so public repos never show false unknown freshness.
 * 5. Provides truthful providerStatus, error categorization, rate-limit information, and structured audit logs.
 * 6. Scopes caching strictly by userScope + owner + repo + branch.
 */
export async function getCurrentRepositoryHead(
  params: GetCurrentRepositoryHeadParams
): Promise<RepositoryHeadResult> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = params.branch?.trim() || 'main';
  const userScope = params.userScope || 'default';
  const startMs = Date.now();

  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${userScope}:head:${branch}`;
  if (!params.bypassCache) {
    const cached = githubCache.get<RepositoryHeadResult>(cacheKey);
    if (cached) {
      return cached.data;
    }
  }

  const baseHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MarrowNode-Developer-Intelligence',
  };

  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=1`;
  const url = `https://api.github.com${endpoint}`;

  const executeFetch = async (
    withToken: boolean
  ): Promise<{ status: number; data: any; headers: Headers }> => {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 4500);
    try {
      const headers: Record<string, string> = { ...baseHeaders };
      if (withToken && params.token) {
        headers.Authorization = `Bearer ${params.token}`;
      }
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data, headers: res.headers };
    } finally {
      clearTimeout(timeoutTimer);
    }
  };

  try {
    let response: { status: number; data: any; headers: Headers } | null = null;
    let tokenUsed = Boolean(params.token);

    if (params.token) {
      response = await executeFetch(true);
    }

    // 1. Success with user token
    if (response && response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
      const currentHeadSha = response.data[0]?.sha || null;
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
        ? Number(response.headers.get('x-ratelimit-remaining'))
        : null;

      const result: RepositoryHeadResult = {
        verified: Boolean(currentHeadSha),
        repositoryId: params.repositoryId,
        projectId: params.projectId,
        owner,
        name: repo,
        branch,
        currentHeadSha,
        verifiedAt: new Date().toISOString(),
        providerStatus: 'VERIFIED',
        statusMessage: 'GitHub branch HEAD verified successfully.',
        tokenValid: true,
        isPublicFallback: false,
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
      };

      console.info(
        `[MarrowNode Freshness] Head verified: user=${userScope} repo=${owner}/${repo} branch=${branch} sha=${currentHeadSha?.slice(0, 7)} durationMs=${result.latencyMs}`
      );
      githubCache.set(cacheKey, result, 20 * 1000);
      return result;
    }

    // 2. Token rejected / expired (401 Bad credentials) -> Fallback to unauthenticated public verification
    if (response && response.status === 401) {
      console.warn(
        `[MarrowNode Freshness] Token rejected (401 Bad credentials): user=${userScope} repo=${owner}/${repo} branch=${branch}`
      );

      // Asynchronously mark token as expired in DB
      if (userScope !== 'default') {
        prisma.gitHubConnection
          .updateMany({
            where: { userId: userScope },
            data: { connectionStatus: 'token_expired' },
          })
          .catch(() => {});
      }

      // Try public unauthenticated request
      try {
        const publicRes = await executeFetch(false);
        if (publicRes.status === 200 && Array.isArray(publicRes.data) && publicRes.data.length > 0) {
          const currentHeadSha = publicRes.data[0]?.sha || null;
          const rateLimitRemaining = publicRes.headers.get('x-ratelimit-remaining')
            ? Number(publicRes.headers.get('x-ratelimit-remaining'))
            : null;

          const result: RepositoryHeadResult = {
            verified: Boolean(currentHeadSha),
            repositoryId: params.repositoryId,
            projectId: params.projectId,
            owner,
            name: repo,
            branch,
            currentHeadSha,
            verifiedAt: new Date().toISOString(),
            providerStatus: 'PUBLIC_VERIFIED',
            statusMessage: 'Verified via public repository access; GitHub OAuth token is expired and needs reconnect.',
            tokenValid: false,
            isPublicFallback: true,
            rateLimitRemaining,
            latencyMs: Date.now() - startMs,
          };

          console.info(
            `[MarrowNode Freshness] Public HEAD fallback succeeded: repo=${owner}/${repo} branch=${branch} sha=${currentHeadSha?.slice(0, 7)}`
          );
          githubCache.set(cacheKey, result, 20 * 1000);
          return result;
        }
      } catch (_) {
        // Fall through to TOKEN_EXPIRED if public check fails
      }

      const result: RepositoryHeadResult = {
        verified: false,
        repositoryId: params.repositoryId,
        projectId: params.projectId,
        owner,
        name: repo,
        branch,
        currentHeadSha: null,
        verifiedAt: new Date().toISOString(),
        providerStatus: 'TOKEN_EXPIRED',
        statusMessage: 'GitHub authentication expired or token revoked. Please reconnect GitHub.',
        tokenValid: false,
        isPublicFallback: false,
        rateLimitRemaining: null,
        latencyMs: Date.now() - startMs,
      };
      return result;
    }

    // 3. No token provided upfront -> Try public unauthenticated request
    if (!params.token) {
      try {
        const publicRes = await executeFetch(false);
        if (publicRes.status === 200 && Array.isArray(publicRes.data) && publicRes.data.length > 0) {
          const currentHeadSha = publicRes.data[0]?.sha || null;
          const rateLimitRemaining = publicRes.headers.get('x-ratelimit-remaining')
            ? Number(publicRes.headers.get('x-ratelimit-remaining'))
            : null;

          const result: RepositoryHeadResult = {
            verified: Boolean(currentHeadSha),
            repositoryId: params.repositoryId,
            projectId: params.projectId,
            owner,
            name: repo,
            branch,
            currentHeadSha,
            verifiedAt: new Date().toISOString(),
            providerStatus: 'PUBLIC_VERIFIED',
            statusMessage: 'Verified via public repository access.',
            tokenValid: false,
            isPublicFallback: true,
            rateLimitRemaining,
            latencyMs: Date.now() - startMs,
          };
          githubCache.set(cacheKey, result, 20 * 1000);
          return result;
        }
      } catch (_) {}

      return {
        verified: false,
        repositoryId: params.repositoryId,
        projectId: params.projectId,
        owner,
        name: repo,
        branch,
        currentHeadSha: null,
        verifiedAt: new Date().toISOString(),
        providerStatus: 'NO_TOKEN',
        statusMessage: 'No GitHub token available. Connect GitHub to verify repository.',
        tokenValid: false,
        isPublicFallback: false,
        rateLimitRemaining: null,
        latencyMs: Date.now() - startMs,
      };
    }

    // 4. Handle other HTTP status codes (404, 403, 429, 5xx)
    const status = response ? response.status : 500;
    const rateLimitRemaining = response?.headers.get('x-ratelimit-remaining')
      ? Number(response.headers.get('x-ratelimit-remaining'))
      : null;

    if (status === 404) {
      return {
        verified: false,
        repositoryId: params.repositoryId,
        projectId: params.projectId,
        owner,
        name: repo,
        branch,
        currentHeadSha: null,
        verifiedAt: new Date().toISOString(),
        providerStatus: 'REPOSITORY_NOT_FOUND',
        statusMessage: `Repository "${owner}/${repo}" or branch "${branch}" was not found on GitHub.`,
        tokenValid: true,
        isPublicFallback: false,
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
      };
    }

    if (status === 403 || status === 429) {
      const isRate = status === 429 || (rateLimitRemaining !== null && rateLimitRemaining <= 0);
      return {
        verified: false,
        repositoryId: params.repositoryId,
        projectId: params.projectId,
        owner,
        name: repo,
        branch,
        currentHeadSha: null,
        verifiedAt: new Date().toISOString(),
        providerStatus: isRate ? 'RATE_LIMITED' : 'PERMISSION_DENIED',
        statusMessage: isRate
          ? 'GitHub API rate limit reached. Freshness could not be verified right now.'
          : `Access forbidden to repository "${owner}/${repo}". Check GitHub permissions.`,
        tokenValid: true,
        isPublicFallback: false,
        rateLimitRemaining,
        latencyMs: Date.now() - startMs,
      };
    }

    return {
      verified: false,
      repositoryId: params.repositoryId,
      projectId: params.projectId,
      owner,
      name: repo,
      branch,
      currentHeadSha: null,
      verifiedAt: new Date().toISOString(),
      providerStatus: 'GITHUB_UNAVAILABLE',
      statusMessage: `GitHub API returned unexpected status ${status}.`,
      tokenValid: true,
      isPublicFallback: false,
      rateLimitRemaining,
      latencyMs: Date.now() - startMs,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || String(err).includes('aborted');
    console.error(
      `[MarrowNode Freshness] Exception verifying HEAD: user=${userScope} repo=${owner}/${repo} branch=${branch} error=${err?.message || err}`
    );

    return {
      verified: false,
      repositoryId: params.repositoryId,
      projectId: params.projectId,
      owner,
      name: repo,
      branch,
      currentHeadSha: null,
      verifiedAt: new Date().toISOString(),
      providerStatus: isTimeout ? 'TIMEOUT' : 'GITHUB_UNAVAILABLE',
      statusMessage: isTimeout
        ? 'GitHub request timed out while verifying branch HEAD.'
        : 'GitHub service is temporarily unreachable.',
      tokenValid: Boolean(params.token),
      isPublicFallback: false,
      rateLimitRemaining: null,
      latencyMs: Date.now() - startMs,
    };
  }
}

/**
 * Fast, timeout-bounded live GitHub HEAD verification for backward compatibility.
 */
export async function verifyRepositoryHeadSha(params: {
  token: string | null;
  owner: string;
  repo: string;
  branch: string;
  userScope: string;
  bypassCache?: boolean;
}): Promise<{ headSha: string | null; verified: boolean; result?: RepositoryHeadResult }> {
  const result = await getCurrentRepositoryHead(params);
  return {
    headSha: result.currentHeadSha,
    verified: result.verified,
    result,
  };
}

/**
 * Fetch raw file content (e.g., README.md, package.json, tsconfig.json, or source file).
 * Keyed strictly by user scope + repository + commitSha/blobSha + path.
 * Supports skipMemoryCache when batch ingestion stores AST immediately into Neon.
 */
export async function fetchRepoFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  commitSha?: string,
  options?: {
    blobSha?: string;
    userScope?: string;
    skipMemoryCache?: boolean;
    throwOnRateLimit?: boolean;
  }
): Promise<string | null> {
  const cleanPath = path.replace(/^\/+/, '');
  const scope = options?.userScope || 'default';
  const versionKey = options?.blobSha || commitSha || 'head';
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${scope}:file:${cleanPath}:${versionKey}`;

  const loader = async (): Promise<string | null> => {
    try {
      const encodedPath = cleanPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      const queryParam = commitSha ? `?ref=${encodeURIComponent(commitSha)}` : '';
      const data = await githubRequest<{
        content: string;
        encoding: string;
      }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${queryParam}`, token);

      if (data.encoding === 'base64' && data.content) {
        return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
      }
      return null;
    } catch (err) {
      if (options?.throwOnRateLimit && err instanceof GitHubApiError && (err.isRateLimit || err.statusCode === 429 || err.isAuthError)) {
        throw err;
      }
      return null;
    }
  };

  if (options?.skipMemoryCache) {
    return loader();
  }

  return githubCache.fetchWithCache(
    cacheKey,
    'file_content',
    loader,
    15 * 60 * 1000,
    versionKey
  );
}

