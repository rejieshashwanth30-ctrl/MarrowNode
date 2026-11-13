import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { getActiveUserProject, setActiveUserProject } from '@/lib/services/projects';
import { getProjectWorkstationContext } from '@/lib/services/project-context';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/active
 * Resolves the authenticated user's current active project from the database.
 * Returns the full workstation context along with profile and project list for instant dashboard hydration.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const profile = await getOrCreateCurrentProfile();
    const activeProject = await getActiveUserProject();

    // Query user's projects for unified dashboard hydration
    const userProjects = await prisma.project.findMany({
      where: { ownerId: profile.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        repository: true,
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!activeProject) {
      return NextResponse.json({
        success: true,
        hasActiveProject: false,
        project: null,
        context: null,
        user: profile,
        projects: userProjects,
      });
    }

    const checkFreshnessLive = request.nextUrl.searchParams.get('live') === 'true';
    const context = await getProjectWorkstationContext(activeProject.id, {
      checkFreshnessLive,
      profile,
    });

    return NextResponse.json({
      success: true,
      hasActiveProject: true,
      project: activeProject,
      context,
      user: profile,
      projects: userProjects,
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
    const context = await getProjectWorkstationContext(projectId, { checkFreshnessLive: false });

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

