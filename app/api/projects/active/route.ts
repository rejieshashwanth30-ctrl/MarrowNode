import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getActiveUserProject, setActiveUserProject } from '@/lib/services/projects';
import { getProjectWorkstationContext } from '@/lib/services/project-context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/active
 * Resolves the authenticated user's current active project from the database.
 * Returns the full workstation context.
 */
export async function GET() {
  try {
    await requireAuth();
    const activeProject = await getActiveUserProject();

    if (!activeProject) {
      return NextResponse.json({
        success: true,
        hasActiveProject: false,
        project: null,
        context: null,
      });
    }

    const context = await getProjectWorkstationContext(activeProject.id);

    return NextResponse.json({
      success: true,
      hasActiveProject: true,
      project: activeProject,
      context,
    });
  } catch (error: any) {
    console.error('[MarrowNode Active Project GET Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to resolve active project' },
      { status: error?.statusCode || 500 }
    );
  }
}

/**
 * POST /api/projects/active
 * Sets a specific project as the active project for the authenticated user.
 * Body: { projectId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { projectId } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { error: 'Valid projectId is required' },
        { status: 400 }
      );
    }

    const updatedProject = await setActiveUserProject(projectId);
    const context = await getProjectWorkstationContext(projectId);

    return NextResponse.json({
      success: true,
      project: updatedProject,
      context,
    });
  } catch (error: any) {
    console.error('[MarrowNode Active Project POST Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to set active project' },
      { status: error?.statusCode || 500 }
    );
  }
}

