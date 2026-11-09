import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseUrl, getSupabasePublishableKey } from '@/utils/supabase/config';

/**
 * Lightweight Supabase Session Refresh for Next.js Middleware
 * Strictly handles cookie refreshes and auth state. Never touches database/Prisma.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh auth token by reading current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
