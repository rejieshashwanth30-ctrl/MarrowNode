import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabasePublishableKey } from '@/utils/supabase/config';

/**
 * Supabase Server Client for MarrowNode
 * Uses Next.js cookies to securely read and set session cookies.
 * Enforces canonical MarrowNode Supabase project targeting.
 */
export function createClient(cookieStore?: ReturnType<typeof cookies>) {
  const store = cookieStore || cookies();
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options)
          );
        } catch {
          // Ignored if middleware handles token refresh
        }
      },
    },
  });
}

export default createClient;
