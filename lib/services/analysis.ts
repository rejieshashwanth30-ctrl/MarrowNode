import { prisma } from '@/lib/prisma';
import { getUserProject } from '@/lib/services/projects';
import { AuthError } from '@/lib/auth';
import type { AnalysisStatus } from '@prisma/client';

export interface CreateAnalysisInput {
  status?: AnalysisStatus;
  startedAt?: Date;
  completedAt?: Date;
  filesAnalyzed?: number;
  commitsAnalyzed?: number;
  dependenciesDetected?: number;
  architectureNodes?: number;
  evidenceCount?: number;
  errorMessage?: string;
  commitSha?: string;
  branch?: string;
  coverage?: number;
  summaryJson?: any;
  analyzerVersion?: string;
}

/**
 * List analyses for an owned project
 */
export async function listProjectAnalyses(projectId: string) {
  // Validate ownership first
  await getUserProject(projectId);

  return prisma.analysis.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Create a new analysis run for an owned project
 */
export async function createAnalysisRun(projectId: string, input?: CreateAnalysisInput) {
  // Validate ownership first
  await getUserProject(projectId);

  return prisma.analysis.create({
    data: {
      projectId,
      status: input?.status || 'PENDING',
      analyzerVersion: input?.analyzerVersion || 'v3.0',
      startedAt: input?.startedAt || new Date(),
      completedAt: input?.completedAt,
      filesAnalyzed: input?.filesAnalyzed ?? 0,
      commitsAnalyzed: input?.commitsAnalyzed ?? 0,
      dependenciesDetected: input?.dependenciesDetected ?? 0,
      architectureNodes: input?.architectureNodes ?? 0,
      evidenceCount: input?.evidenceCount ?? 0,
      errorMessage: input?.errorMessage,
    },
  });
}

/**
 * Update analysis run status strictly scoped to project and owner
 */
export async function updateAnalysisRun(
  projectId: string,
  analysisId: string,
  data: Partial<CreateAnalysisInput>
) {
  // Validate user project ownership first
  await getUserProject(projectId);

  // Validate that this analysis actually belongs to the verified project
  const existing = await prisma.analysis.findFirst({
    where: {
      id: analysisId,
      projectId,
    },
  });

  if (!existing) {
    throw new AuthError('Analysis record not found for this project', 404);
  }

  return prisma.analysis.update({
    where: { id: analysisId },
    data,
  });
}

/**
 * Delete analysis run strictly scoped to project and owner
 */
export async function deleteAnalysisRun(projectId: string, analysisId: string) {
  // Validate user project ownership first
  await getUserProject(projectId);

  const existing = await prisma.analysis.findFirst({
    where: {
      id: analysisId,
      projectId,
    },
  });

  if (!existing) {
    throw new AuthError('Analysis record not found for this project', 404);
  }

  return prisma.analysis.delete({
    where: { id: analysisId },
  });
}

/**
 * List evidence items for an owned project
 */
export async function listProjectEvidence(projectId: string) {
  // Validate ownership first
  await getUserProject(projectId);

  return prisma.evidence.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Add evidence item to an owned project
 */
export async function addProjectEvidence(
  projectId: string,
  evidence: {
    type: string;
    title: string;
    path?: string;
    externalUrl?: string;
    reference?: string;
    metadata?: any;
  }
) {
  // Validate ownership first
  await getUserProject(projectId);

  return prisma.evidence.create({
    data: {
      projectId,
      type: evidence.type,
      title: evidence.title,
      path: evidence.path,
      externalUrl: evidence.externalUrl,
      reference: evidence.reference,
      metadata: evidence.metadata,
    },
  });
}

/**
 * Delete evidence item strictly scoped to project and owner
 */
export async function deleteProjectEvidence(projectId: string, evidenceId: string) {
  // Validate ownership first
  await getUserProject(projectId);

  const existing = await prisma.evidence.findFirst({
    where: {
      id: evidenceId,
      projectId,
    },
  });

  if (!existing) {
    throw new AuthError('Evidence record not found for this project', 404);
  }

  return prisma.evidence.delete({
    where: { id: evidenceId },
  });
}
