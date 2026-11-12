import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserProject } from '@/lib/services/projects';
import { prisma } from '@/lib/prisma';
import { getSafeErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/commits?page=1&limit=50&type=all&q=...
 * Paginated server-side query over ingested ProjectCommit history (never loads thousands at once).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const project = await getUserProject(params.id);

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const eventType = searchParams.get('type') || 'all';
    const q = searchParams.get('q')?.trim() || '';

    const where: any = {
      projectId: project.id,
      branch: project.defaultBranch || 'main',
    };

    if (eventType && eventType !== 'all') {
      where.eventType = eventType;
    }

    if (q) {
      where.OR = [
        { message: { contains: q, mode: 'insensitive' } },
        { authorName: { contains: q, mode: 'insensitive' } },
        { commitSha: { startsWith: q, mode: 'insensitive' } },
      ];
    }

    const [totalCount, rows] = await Promise.all([
      prisma.projectCommit.count({ where }),
      prisma.projectCommit.findMany({
        where,
        orderBy: { committedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const events = rows.map((c) => ({
      id: `ev-${c.shortSha}`,
      date: c.committedAt.toISOString().split('T')[0],
      year: c.committedAt.getFullYear(),
      month: c.committedAt.toLocaleString('default', { month: 'short' }),
      type: c.eventType as 'milestone' | 'security' | 'database' | 'refactor' | 'feature',
      title: c.message,
      explanation: `Observed change in commit ${c.shortSha} by ${c.authorName}: ${c.message}`,
      architecturalImpact: c.body ? `Commit body documentation: ${c.body}` : undefined,
      commitHash: c.commitSha,
      commitShort: c.shortSha,
      author: {
        name: c.authorName,
        avatar: '',
        handle: c.authorName.toLowerCase().replace(/\s+/g, ''),
      },
    }));

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      hasMore: page * limit < totalCount,
      branch: project.defaultBranch || 'main',
      events,
    });
  } catch (error: any) {
    const safe = getSafeErrorResponse(
      error,
      'Failed to load repository commit history.',
      `commits.GET projectId=${params.id}`
    );
    return NextResponse.json({ error: safe.message }, { status: safe.statusCode });
  }
}

