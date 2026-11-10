import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { createAnalysisRun } from '@/lib/services/analysis';
import { getGitHubTokenForCurrentUser } from '@/lib/github/client';
import { executeDeterministicAnalysis } from '@/lib/github/analysis';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/analyze
 *
 * Initiates the deterministic codebase analysis pipeline for an owned project.
 * Analyzes repository tree, dependencies, frameworks, and git activity via GitHub API.
 * Persists results into Neon PostgreSQL Analysis & Evidence tables.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user
    await requireAuth();
    const projectId = params.id;

    // 2. Validate project ownership strictly
    const project = await getUserProject(projectId);

    if (!project.githubOwner || !project.githubRepositoryName) {
      return NextResponse.json(
        { error: 'Project does not have a linked GitHub repository to analyze.' },
        { status: 400 }
      );
    }

    // 3. Retrieve user's GitHub token
    const { token } = await getGitHubTokenForCurrentUser();
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub access token missing. Please reconnect GitHub to run analysis.' },
        { status: 401 }
      );
    }

    // 4. Create an Analysis run record in Neon
    const analysis = await createAnalysisRun(projectId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

    // 5. Execute deterministic analysis
    // Run the pipeline and return results
    const result = await executeDeterministicAnalysis({
      token,
      projectId,
      analysisId: analysis.id,
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
    });

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      status: 'COMPLETED',
      result,
    });
  } catch (error: any) {
    console.error('[MarrowNode Project Analyze Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: error.statusCode || 500 }
    );
  }
}

