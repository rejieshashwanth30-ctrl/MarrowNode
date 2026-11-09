import { prisma } from '@/lib/prisma';
import { requireAuth, getOrCreateCurrentProfile, AuthError } from '@/lib/auth';
import type { AnalysisStatus } from '@prisma/client';

export interface CreateProjectInput {
  name: string;
  description?: string;
  githubRepositoryId?: string;
  githubRepositoryName?: string;
  githubOwner?: string;
  defaultBranch?: string;
  visibility?: string;
  primaryLanguage?: string;
  framework?: string;
  database?: string;
}

/**
 * List all projects owned by the currently authenticated user.
 * STRICT ISOLATION: Never returns another user's projects.
 */
export async function listUserProjects() {
  const profile = await getOrCreateCurrentProfile();

  return prisma.project.findMany({
    where: { ownerId: profile.id },
    include: {
      repository: true,
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          evidences: true,
          analyses: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Get a specific project by ID with STRICT ownership validation.
 * Throws 404/403 if project does not belong to the user.
 */
export async function getUserProject(projectId: string) {
  const profile = await getOrCreateCurrentProfile();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ownerId: profile.id, // Enforce ownership check
    },
    include: {
      repository: true,
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      evidences: {
        take: 20,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!project) {
    throw new AuthError('Project not found or access denied', 404);
  }

  return project;
}

/**
 * Create a new project strictly bound to the authenticated user's profile.
 */
export async function createProject(input: CreateProjectInput) {
  const profile = await getOrCreateCurrentProfile();

  return prisma.project.create({
    data: {
      ownerId: profile.id,
      name: input.name,
      description: input.description,
      githubRepositoryId: input.githubRepositoryId,
      githubRepositoryName: input.githubRepositoryName,
      githubOwner: input.githubOwner,
      defaultBranch: input.defaultBranch || 'main',
      visibility: input.visibility || 'private',
      primaryLanguage: input.primaryLanguage,
      framework: input.framework,
      database: input.database,
      analysisStatus: 'PENDING',
    },
  });
}

/**
 * Update an existing project with ownership check.
 */
export async function updateProject(
  projectId: string,
  data: Partial<CreateProjectInput> & { analysisStatus?: AnalysisStatus; lastAnalyzedAt?: Date }
) {
  const profile = await getOrCreateCurrentProfile();

  // Verify ownership before updating
  const existing = await prisma.project.findFirst({
    where: { id: projectId, ownerId: profile.id },
  });

  if (!existing) {
    throw new AuthError('Project not found or unauthorized', 404);
  }

  return prisma.project.update({
    where: { id: projectId },
    data,
  });
}

/**
 * Delete a project with ownership check.
 */
export async function deleteProject(projectId: string) {
  const profile = await getOrCreateCurrentProfile();

  const existing = await prisma.project.findFirst({
    where: { id: projectId, ownerId: profile.id },
  });

  if (!existing) {
    throw new AuthError('Project not found or unauthorized', 404);
  }

  return prisma.project.delete({
    where: { id: projectId },
  });
}

