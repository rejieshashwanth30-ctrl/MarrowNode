import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Sign out handler to clear session cookies
 */
export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}

