import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile, AuthError } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGitHubTokenForCurrentUser, fetchRepositoryDetails, GitHubApiError } from '@/lib/github/client';
import { upsertRepository } from '@/lib/services/repositories';
import { ensureMarrowNodeSchema } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

/**
 * POST /api/github/repositories/connect
 *
 * Connects and persists a GitHub repository into Neon PostgreSQL.
 * Strictly verifies repository access via the authenticated user's GitHub token.
 * Prevents cross-tenant leaks by binding the project directly to the authenticated Neon user.
 */
export async function POST(request: NextRequest) {
  let profile: any = null;
  try {
    await ensureMarrowNodeSchema();

    // 1. Verify user authentication
    await requireAuth();
    profile = await getOrCreateCurrentProfile();

    // 2. Retrieve GitHub token
    const { token, connectionStatus } = await getGitHubTokenForCurrentUser();
    if (!token || connectionStatus === 'token_expired') {
      return NextResponse.json(
        {
          error: 'GitHub authentication expired or token revoked. Please reconnect GitHub.',
          connectionStatus: 'token_expired',
          requiresReconnect: true,
        },
        { status: 401 }
      );
    }

    // 3. Parse and validate input
    const body = await request.json();
    const owner = body.owner?.trim();
    const name = body.name?.trim();

    if (!owner || !name) {
      return NextResponse.json(
        { error: 'Repository owner and name are required.' },
        { status: 400 }
      );
    }

    // 4. Server-Side Authorization: Verify caller has real access to this repository on GitHub
    const repoDetails = await fetchRepositoryDetails(token, owner, name);

    // 5. Deactivate other projects for this user to guarantee single active project context
    await prisma.project.updateMany({
      where: { ownerId: profile.id, isActive: true },
      data: { isActive: false },
    }).catch(() => {});

    // Locate or create Project for this repository under the current user's profile
    let project = await prisma.project.findFirst({
      where: {
        ownerId: profile.id,
        githubOwner: repoDetails.owner.login,
        githubRepositoryName: repoDetails.name,
      },
      include: { repository: true },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          ownerId: profile.id,
          name: repoDetails.name,
          description: repoDetails.description,
          githubRepositoryId: String(repoDetails.id),
          githubRepositoryName: repoDetails.name,
          githubOwner: repoDetails.owner.login,
          defaultBranch: repoDetails.default_branch || 'main',
          visibility: repoDetails.private ? 'private' : 'public',
          primaryLanguage: repoDetails.language,
          analysisStatus: 'PENDING',
          isActive: true,
        },
        include: { repository: true },
      });
    } else {
      project = await prisma.project.update({
        where: { id: project.id },
        data: {
          isActive: true,
          defaultBranch: repoDetails.default_branch || 'main',
          visibility: repoDetails.private ? 'private' : 'public',
          primaryLanguage: repoDetails.language || project.primaryLanguage,
          updatedAt: new Date(),
        },
        include: { repository: true },
      });
    }

    // 6. Upsert the Repository record in Neon
    const repository = await upsertRepository(project.id, {
      githubRepoId: String(repoDetails.id),
      owner: repoDetails.owner.login,
      name: repoDetails.name,
      fullName: repoDetails.full_name,
      url: repoDetails.html_url,
      defaultBranch: repoDetails.default_branch || 'main',
      isPrivate: repoDetails.private,
      language: repoDetails.language || undefined,
      description: repoDetails.description || undefined,
      stars: repoDetails.stargazers_count,
      isFork: repoDetails.fork,
    });

    console.log(
      `[MarrowNode Repository Connect] Connected repo ${repoDetails.full_name} for user ${profile.id} in project ${project.id}`
    );

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        githubOwner: project.githubOwner,
        githubRepositoryName: project.githubRepositoryName,
        defaultBranch: project.defaultBranch,
        visibility: project.visibility,
        analysisStatus: project.analysisStatus,
      },
      repository,
    });
  } catch (error: any) {
    if (error instanceof AuthError || error?.name === 'AuthError') {
      return NextResponse.json(
        {
          error: error.message,
          connectionStatus: 'unauthenticated',
          requiresReconnect: true,
        },
        { status: error.statusCode || 401 }
      );
    }

    if (error instanceof GitHubApiError) {
      if (error.isAuthError && profile?.id) {
        prisma.gitHubConnection
          .updateMany({
            where: { userId: profile.id },
            data: { connectionStatus: 'token_expired' },
          })
          .catch(() => {});
      }
      return NextResponse.json(
        {
          error: error.message,
          connectionStatus: error.isAuthError ? 'token_expired' : 'connected',
          requiresReconnect: error.isAuthError,
        },
        { status: error.statusCode }
      );
    }

    console.error('[MarrowNode Repository Connect Error]:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isInternalDbError =
      errorMsg.includes('prisma') ||
      errorMsg.includes('column') ||
      errorMsg.includes('database') ||
      errorMsg.includes('relation');

    return NextResponse.json(
      {
        error: isInternalDbError
          ? 'MarrowNode is temporarily synchronizing its project data. Please try again in a moment.'
          : errorMsg,
      },
      { status: 500 }
    );
  }
}

