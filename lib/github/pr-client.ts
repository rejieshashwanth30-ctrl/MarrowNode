import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import {
  GitHubApiError,
  fetchRepoFileContent,
  githubRequest,
} from '@/lib/github/client';
import { githubCache } from '@/lib/github/cache';

export interface GitHubPullRequestSummary {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  draft?: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  body: string | null;
  user: {
    login: string;
    avatar_url?: string;
  } | null;
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubPullRequestFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged' | string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface GitHubPublishResult {
  status: 'published' | 'skipped' | 'failed';
  note: string;
}

async function githubPrRequest<T>(
  endpoint: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  if (token) {
    return githubRequest<T>(endpoint, token, options);
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'MarrowNode-Workstation',
      ...options.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let errorMessage = `GitHub API returned status ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) errorMessage = data.message;
    } catch {
      // ignore non-json body
    }
    throw new GitHubApiError(errorMessage, res.status);
  }

  return res.json() as Promise<T>;
}

/**
 * Retrieve stored GitHub OAuth access token strictly server-side for background webhook jobs.
 * Never expose or return this token to clients or logs.
 */
export async function getServerGitHubTokenForUser(userId: string): Promise<string | null> {
  const conn = await prisma.gitHubConnection.findUnique({
    where: { userId },
    select: { accessToken: true, connectionStatus: true },
  });

  if (!conn || conn.connectionStatus !== 'connected' || !conn.accessToken) {
    return null;
  }

  return conn.accessToken;
}

/**
 * Fetch repository pull requests (newest updated first) scoped safely by user + repository.
 */
export async function fetchRepoPullRequests(
  token: string | null,
  owner: string,
  repo: string,
  options?: {
    state?: 'open' | 'closed' | 'all';
    perPage?: number;
    userScope?: string;
  }
): Promise<GitHubPullRequestSummary[]> {
  const state = options?.state || 'all';
  const perPage = Math.min(Math.max(options?.perPage ?? 20, 1), 50);
  const scope = options?.userScope || 'default';
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${scope}:pulls:${state}:${perPage}`;

  return githubCache.fetchWithCache(
    cacheKey,
    'pulls_list',
    () =>
      githubPrRequest<GitHubPullRequestSummary[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&sort=updated&direction=desc&per_page=${perPage}`,
        token
      ),
    60 * 1000
  );
}

/**
 * Fetch single pull request metadata.
 */
export async function fetchPullRequestDetails(
  token: string | null,
  owner: string,
  repo: string,
  prNumber: number,
  userScope?: string
): Promise<GitHubPullRequestSummary> {
  const scope = userScope || 'default';
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${scope}:pr:${prNumber}`;

  return githubCache.fetchWithCache(
    cacheKey,
    'pr_details',
    () =>
      githubPrRequest<GitHubPullRequestSummary>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`,
        token
      ),
    45 * 1000
  );
}

/**
 * Fetch changed files for a pull request (paginated up to 500 files).
 */
export async function fetchPullRequestFiles(
  token: string | null,
  owner: string,
  repo: string,
  prNumber: number,
  headSha?: string,
  userScope?: string
): Promise<GitHubPullRequestFile[]> {
  const scope = userScope || 'default';
  const shaKey = headSha || 'latest';
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}:u:${scope}:pr_files:${prNumber}:${shaKey}`;

  return githubCache.fetchWithCache(
    cacheKey,
    'pr_files',
    async () => {
      const allFiles: GitHubPullRequestFile[] = [];
      const maxPages = 5;

      for (let page = 1; page <= maxPages; page++) {
        const batch = await githubPrRequest<GitHubPullRequestFile[]>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files?per_page=100&page=${page}`,
          token
        );

        allFiles.push(...batch);
        if (batch.length < 100) {
          break;
        }
      }

      return allFiles;
    },
    headSha ? 10 * 60 * 1000 : 45 * 1000,
    headSha
  );
}

/**
 * Fetch text content of a single file at a specific commit SHA / ref.
 */
export async function fetchPullRequestFileContent(
  token: string | null,
  owner: string,
  repo: string,
  filePath: string,
  ref: string
): Promise<string | null> {
  if (token) {
    return fetchRepoFileContent(token, owner, repo, filePath, ref).catch(() => null);
  }

  try {
    const encodedPath = filePath
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const data = await githubPrRequest<{ content?: string; encoding?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      null
    );
    if (data?.content && data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Optionally publish a compact GitHub commit status for a verified PR check.
 * Gracefully degrades when OAuth scope lacks status write permission.
 */
export async function publishPullRequestCommitStatus(params: {
  token: string | null;
  owner: string;
  repo: string;
  headSha: string;
  projectId: string;
  prNumber: number;
  checkStatus: 'PASS' | 'REVIEW' | 'INCOMPLETE';
  impactLevel: string;
  summaryText: string;
}): Promise<GitHubPublishResult> {
  const { token, owner, repo, headSha, projectId, prNumber, checkStatus, impactLevel, summaryText } = params;

  if (!token) {
    return {
      status: 'skipped',
      note: 'No server GitHub token available to publish commit status; check report stored in MarrowNode.',
    };
  }

  const ghState: 'success' | 'pending' | 'failure' =
    checkStatus === 'PASS' ? 'success' : 'pending';

  const shortDesc = `${impactLevel}: ${summaryText}`.replace(/\s+/g, ' ').slice(0, 138);
  const targetUrl = `${env.NEXT_PUBLIC_APP_URL}/project/${encodeURIComponent(projectId)}/pull-requests/${prNumber}`;

  try {
    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/statuses/${encodeURIComponent(headSha)}`,
      token,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: ghState,
          target_url: targetUrl,
          description: shortDesc,
          context: 'MarrowNode / PR Check',
        }),
      }
    );

    return {
      status: 'published',
      note: `Published "${ghState}" status to GitHub commit ${headSha.substring(0, 7)}.`,
    };
  } catch (err: any) {
    const statusCode = err instanceof GitHubApiError ? err.statusCode : undefined;
    if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 422) {
      return {
        status: 'skipped',
        note: 'GitHub token lacks write access for commit statuses (or read-only OAuth scope); MarrowNode check saved locally.',
      };
    }

    return {
      status: 'failed',
      note: 'Unable to reach GitHub Commit Status API cleanly; MarrowNode check saved locally.',
    };
  }
}

