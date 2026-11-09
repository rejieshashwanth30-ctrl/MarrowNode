import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserProject, deleteProject } from '@/lib/services/projects';

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/projects/[id]
 * Enforces strict user ownership
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = await getUserProject(params.id);
    return NextResponse.json({ project });
  } catch (error: any) {
    const status = error.statusCode || 404;
    return NextResponse.json(
      { error: error?.message || 'Project not found' },
      { status }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await deleteProject(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = error.statusCode || 404;
    return NextResponse.json(
      { error: error?.message || 'Failed to delete project' },
      { status }
    );
  }
}

