import { prisma } from '@/lib/prisma';
import { getUserProject } from '@/lib/services/projects';

export interface RepositoryInput {
  githubRepoId?: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch?: string;
  isPrivate?: boolean;
  language?: string;
  description?: string;
  stars?: number;
  isFork?: boolean;
}

/**
 * Upsert repository linked to an owned project
 */
export async function upsertRepository(projectId: string, input: RepositoryInput) {
  // Validate ownership first
  await getUserProject(projectId);

  return prisma.repository.upsert({
    where: { projectId },
    update: {
      githubRepoId: input.githubRepoId,
      owner: input.owner,
      name: input.name,
      fullName: input.fullName,
      url: input.url,
      defaultBranch: input.defaultBranch || 'main',
      isPrivate: input.isPrivate ?? true,
      language: input.language,
      description: input.description,
      stars: input.stars ?? 0,
      isFork: input.isFork ?? false,
      lastSyncedAt: new Date(),
    },
    create: {
      projectId,
      githubRepoId: input.githubRepoId,
      owner: input.owner,
      name: input.name,
      fullName: input.fullName,
      url: input.url,
      defaultBranch: input.defaultBranch || 'main',
      isPrivate: input.isPrivate ?? true,
      language: input.language,
      description: input.description,
      stars: input.stars ?? 0,
      isFork: input.isFork ?? false,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Get repository details for an owned project
 */
export async function getRepository(projectId: string) {
  await getUserProject(projectId);

  return prisma.repository.findUnique({
    where: { projectId },
  });
}

/**
 * Delete repository linked to an owned project
 */
export async function deleteRepository(projectId: string) {
  await getUserProject(projectId);

  return prisma.repository.delete({
    where: { projectId },
  });
}

