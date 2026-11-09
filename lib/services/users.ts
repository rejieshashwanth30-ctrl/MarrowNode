import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth';

export interface SyncProfileData {
  supabaseUserId: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Upsert MarrowNode profile record based on verified Supabase user ID
 */
export async function syncUserProfile(data: SyncProfileData) {
  return prisma.user.upsert({
    where: { supabaseUserId: data.supabaseUserId },
    update: {
      email: data.email,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
    },
    create: {
      supabaseUserId: data.supabaseUserId,
      email: data.email,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
    },
  });
}

/**
 * Get profile for currently authenticated user
 */
export async function getCurrentUserProfile() {
  const user = await requireAuth();
  const profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    include: {
      githubConnection: true,
      _count: {
        select: { projects: true },
      },
    },
  });

  return profile;
}

/**
 * Save GitHub Connection metadata securely for the authenticated user
 */
export async function saveGitHubConnection(
  supabaseUserId: string,
  data: {
    githubAccountId: string;
    githubUsername: string;
    avatarUrl?: string | null;
    accessToken?: string | null;
  }
) {
  const profile = await prisma.user.findUnique({
    where: { supabaseUserId },
  });

  if (!profile) {
    throw new AuthError('Profile not found for authenticated user', 404);
  }

  return prisma.gitHubConnection.upsert({
    where: { userId: profile.id },
    update: {
      githubAccountId: data.githubAccountId,
      githubUsername: data.githubUsername,
      avatarUrl: data.avatarUrl,
      ...(data.accessToken ? { accessToken: data.accessToken } : {}),
      connectionStatus: 'connected',
    },
    create: {
      userId: profile.id,
      githubAccountId: data.githubAccountId,
      githubUsername: data.githubUsername,
      avatarUrl: data.avatarUrl,
      accessToken: data.accessToken || null,
      connectionStatus: 'connected',
    },
  });
}

/**
 * Update user profile by ID
 */
export async function updateUserProfile(
  userId: string,
  data: Partial<Omit<SyncProfileData, 'supabaseUserId'>>
) {
  return prisma.user.update({
    where: { id: userId },
    data,
  });
}

/**
 * Delete user profile by ID (cascades to GitHub connection, projects, etc.)
 */
export async function deleteUser(userId: string) {
  return prisma.user.delete({
    where: { id: userId },
  });
}
