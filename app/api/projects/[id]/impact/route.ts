import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile, AuthError } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DependencyGraphEngine, DependencyEdge } from '@/lib/analysis/graph-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseUser = await requireAuth();
    const profile = await getOrCreateCurrentProfile(supabaseUser);
    const projectId = params.id;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const target = searchParams.get('target') || 'app';
    const changeType = (searchParams.get('changeType') as 'interface' | 'refactor' | 'delete') || 'interface';

    // Verify project ownership strictly
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: profile.id,
      },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        evidences: {
          where: { type: 'architecture' },
          take: 1,
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    const archEvidence = project.evidences[0];
    const archMeta = (archEvidence?.metadata as any) || {};
    const latestAnalysis = project.analyses[0];
    const summaryJson = (latestAnalysis?.summaryJson as any) || {};

    // Retrieve file-level dependency edges
    const dependencyEdges: DependencyEdge[] =
      archMeta.dependencyEdges || summaryJson.dependencyEdges || [];

    const graphEngine = new DependencyGraphEngine(dependencyEdges);
    const result = graphEngine.calculateBlastRadius(target, changeType);

    return NextResponse.json({
      success: true,
      projectId,
      ...result,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[Impact Analysis API Error]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to compute change impact analysis' },
      { status: 500 }
    );
  }
}

