import { NextResponse } from 'next/server';
import { getCurrentUser, getOrCreateCurrentProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Sync Supabase authenticated session with Neon MarrowNode Profile
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: No active session' },
        { status: 401 }
      );
    }

    const profile = await getOrCreateCurrentProfile(user);
    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error(
      '[Sync Profile Error]:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return NextResponse.json(
      { error: 'Failed to synchronize profile in application database' },
      { status: 500 }
    );
  }
}

