import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { listProjectPullRequestChecks } from '@/lib/services/pr-check';
import { getGitHubTokenForCurrentUser } from '@/lib/github/client';
import { fetchRepoPullRequests, type GitHubPullRequestSummary } from '@/lib/github/pr-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/pull-requests
 * Lists stored PR Check audit records and (when ?includeOpen=true) live GitHub PRs for selection.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const data = await listProjectPullRequestChecks(params.id);

    const includeOpen = request.nextUrl.searchParams.get('includeOpen') === 'true';
    let githubPullRequests: Array<{
      number: number;
      title: string;
      state: string;
      draft: boolean;
      author: string | null;
      headRef: string;
      headSha: string;
      baseRef: string;
      baseSha: string;
      updatedAt: string;
      url: string;
    }> = [];
    let githubError: string | null = null;

    if (includeOpen && data.project.githubOwner && data.project.githubRepositoryName) {
      try {
        const { token } = await getGitHubTokenForCurrentUser();
        if (token) {
          const prs: GitHubPullRequestSummary[] = await fetchRepoPullRequests(
            token,
            data.project.githubOwner,
            data.project.githubRepositoryName,
            { state: 'all', perPage: 20, userScope: profile.id }
          );
          githubPullRequests = prs.map((p) => ({
            number: p.number,
            title: p.title,
            state: p.merged_at ? 'merged' : p.state,
            draft: Boolean(p.draft),
            author: p.user?.login || null,
            headRef: p.head.ref,
            headSha: p.head.sha,
            baseRef: p.base.ref,
            baseSha: p.base.sha,
            updatedAt: p.updated_at,
            url: p.html_url,
          }));
        } else {
          githubError = 'Connect or reconnect GitHub to browse live Pull Requests.';
        }
      } catch (err: any) {
        githubError = err?.message || 'Unable to load GitHub Pull Requests.';
      }
    }

    return NextResponse.json({
      ...data,
      githubPullRequests,
      githubError,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[MarrowNode Pull Requests Route Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load Pull Request checks.' },
      { status: 500 }
    );
  }
}

