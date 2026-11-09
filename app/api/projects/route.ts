import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listUserProjects, createProject } from '@/lib/services/projects';

/**
 * GET /api/projects
 * Returns all projects owned by the authenticated user from Neon PostgreSQL
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projects = await listUserProjects();
    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Creates a new project in Neon for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    const newProject = await createProject({
      name: body.name.trim(),
      description: body.description?.trim(),
      githubRepositoryId: body.githubRepositoryId,
      githubRepositoryName: body.githubRepositoryName,
      githubOwner: body.githubOwner,
      defaultBranch: body.defaultBranch || 'main',
      visibility: body.visibility || 'private',
      primaryLanguage: body.primaryLanguage,
      framework: body.framework,
      database: body.database,
    });

    return NextResponse.json({ project: newProject }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create project' },
      { status: 500 }
    );
  }
}

