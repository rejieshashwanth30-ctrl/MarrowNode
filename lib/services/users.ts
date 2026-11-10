import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError, getOrCreateCurrentProfile } from '@/lib/auth';

export interface SyncProfileData {
  supabaseUserId: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Upsert MarrowNode profile record based on verified Supabase user ID in marrownode.users
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
 * Get profile for currently authenticated user from marrownode.users.
 * Self-healing: creates or updates profile if missing.
 */
export async function getCurrentUserProfile() {
  const user = await requireAuth();
  let profile = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    include: {
      githubConnection: true,
      _count: {
        select: { projects: true },
      },
    },
  });

  if (!profile) {
    profile = (await getOrCreateCurrentProfile(user)) as any;
  }

  return profile;
}

/**
 * Save GitHub Connection metadata securely for the authenticated user
 * Stored in marrownode.github_connections.
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
  let profile = await prisma.user.findUnique({
    where: { supabaseUserId },
  });

  if (!profile) {
    profile = await getOrCreateCurrentProfile();
  }

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
