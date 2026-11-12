import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getOrCreateCurrentProfile } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DependencyGraphEngine, DependencyEdge } from '@/lib/analysis/graph-engine';
import { registerCacheInvalidationListener } from '@/lib/services/project-context';
import { telemetry } from '@/lib/observability/timing';
import { getSafeErrorResponse } from '@/lib/errors';

// In-memory cache for instantiated graph engines strictly scoped by userId:projectId:analysisId
const engineCache = new Map<string, DependencyGraphEngine>();

registerCacheInvalidationListener((projectId) => {
  if (!projectId) {
    engineCache.clear();
    return;
  }
  for (const key of Array.from(engineCache.keys())) {
    if (key.includes(`:${projectId}:`)) {
      engineCache.delete(key);
    }
  }
});

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
    const rawChangeType = searchParams.get('changeType') || 'interface';
    const changeType: 'interface' | 'refactor' | 'delete' =
      rawChangeType === 'delete' || rawChangeType === 'refactor' ? rawChangeType : 'interface';

    // Verify project ownership strictly and load latest COMPLETED snapshot
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: profile.id,
      },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        evidences: {
          where: { type: 'architecture' },
          orderBy: { createdAt: 'desc' },
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

    const completedAnalysis =
      project.analyses.find(
        (a) => a.status === 'COMPLETED' || a.status === 'PARTIALLY_COMPLETED'
      ) || null;
    const latestAnalysis = completedAnalysis || project.analyses[0] || null;
    const engineKey = `${profile.id}:${projectId}:${latestAnalysis?.id || 'none'}`;
    let graphEngine = engineCache.get(engineKey);

    if (!graphEngine) {
      const archEvidence = project.evidences[0];
      const archMeta = (archEvidence?.metadata as any) || {};
      const summaryJson = (latestAnalysis?.summaryJson as any) || {};

      const dependencyEdges: DependencyEdge[] =
        Array.isArray(archMeta.dependencyEdges) && archMeta.dependencyEdges.length > 0
          ? archMeta.dependencyEdges
          : Array.isArray(summaryJson.dependencyEdges)
          ? summaryJson.dependencyEdges
          : [];

      graphEngine = new DependencyGraphEngine(dependencyEdges);
      engineCache.set(engineKey, graphEngine);
    }

    const result = await telemetry.measure(
      'impact.calculate_blast_radius',
      async () => graphEngine!.calculateBlastRadius(target, changeType),
      { projectId, analysisId: latestAnalysis?.id }
    );

    const summaryJson = (latestAnalysis?.summaryJson as any) || {};
    const cov = summaryJson?.coverage || {};
    const totalSourceFiles = Number(cov?.files?.source || 0);
    const parsedSourceFiles = Number(cov?.files?.parsed || 0);
    const sourceCoveragePercent =
      typeof cov?.files?.coveragePercent === 'number'
        ? cov.files.coveragePercent
        : totalSourceFiles > 0
        ? Math.round((parsedSourceFiles / totalSourceFiles) * 100)
        : 0;
    const unresolvedImportsCount = Number(cov?.imports?.unresolved || 0);
    const isPartial =
      !completedAnalysis ||
      (totalSourceFiles > 0 && parsedSourceFiles < totalSourceFiles) ||
      unresolvedImportsCount > 0;

    const reason =
      result.totalAffectedCount === 0
        ? 'No analyzed downstream relationships were found.'
        : `The changed target has ${result.directConsumersCount} direct and ${result.transitiveConsumersCount} indirect downstream consumer(s) in analyzed repository relationships.`;

    const whatIsUnknown = [
      'Dynamic imports resolved only at runtime, external webhooks, or reflection-based callers are outside static AST graph analysis.',
      ...(isPartial && totalSourceFiles > 0
        ? [
            `Impact analysis is limited because ${totalSourceFiles - parsedSourceFiles} source file(s) and ${unresolvedImportsCount} import(s) could not be analyzed.`,
          ]
        : []),
    ];

    return NextResponse.json({
      success: true,
      projectId,
      ...result,
      explanation: {
        whatChanged: target,
        reason,
        whatIsUnknown,
      },
      analysisSnapshot: {
        analysisId: latestAnalysis?.id || null,
        commitSha: latestAnalysis?.commitSha || null,
        branch: latestAnalysis?.branch || project.defaultBranch,
        sourceFilesTotal: totalSourceFiles,
        sourceFilesParsed: parsedSourceFiles,
        sourceCoveragePercent,
        unresolvedImportsCount,
        isPartial,
      },
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(error, 'Failed to compute change impact analysis.', 'impact.GET');
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}
