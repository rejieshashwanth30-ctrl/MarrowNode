import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';
import { ensureMarrowNodeSchema } from '@/lib/db/init';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Retrieve the currently authenticated Supabase user from server cookies
 */
export async function getCurrentUser(): Promise<SupabaseUser | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    return null;
  }
}

/**
 * Require authentication, throwing AuthError if no active session
 */
export async function requireAuth(): Promise<SupabaseUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('Authentication required. Please sign in to continue.', 401);
  }
  return user;
}

/**
 * Get or automatically create the MarrowNode Profile linked to the Supabase User.
 * Anchored strictly on supabaseUserId in the marrownode.users PostgreSQL table.
 * Self-healing and idempotent.
 */
export async function getOrCreateCurrentProfile(supabaseUser?: SupabaseUser) {
  await ensureMarrowNodeSchema();
  const authUser = supabaseUser || (await requireAuth());

  const displayName =
    authUser.user_metadata?.full_name ||
    authUser.user_metadata?.name ||
    authUser.user_metadata?.user_name ||
    authUser.user_metadata?.preferred_username ||
    authUser.email?.split('@')[0] ||
    'Developer';

  const avatarUrl =
    authUser.user_metadata?.avatar_url ||
    authUser.user_metadata?.picture ||
    null;

  const profile = await prisma.user.upsert({
    where: { supabaseUserId: authUser.id },
    update: {
      displayName,
      avatarUrl,
      ...(authUser.email ? { email: authUser.email } : {}),
    },
    create: {
      supabaseUserId: authUser.id,
      email: authUser.email || `${authUser.id}@marrownode.internal`,
      displayName,
      avatarUrl,
    },
    include: {
      githubConnection: true,
    },
  });

  return profile;
}
