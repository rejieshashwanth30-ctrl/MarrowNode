import { NextResponse } from 'next/server';
import { getCurrentUser, getOrCreateCurrentProfile } from '@/lib/auth';
import { ensureMarrowNodeSchema } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

/**
 * Get current authenticated user profile from Neon PostgreSQL
 */
export async function GET() {
  try {
    await ensureMarrowNodeSchema();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getOrCreateCurrentProfile(user);
    return NextResponse.json({
      user: {
        id: profile.id,
        supabaseUserId: profile.supabaseUserId,
        email: profile.email,
        displayName: profile.displayName || profile.email.split('@')[0],
        avatarUrl: profile.avatarUrl,
        githubConnection: profile.githubConnection,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

