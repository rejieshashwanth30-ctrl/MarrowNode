import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase Browser Client for MarrowNode
 * Uses public environment variables only. Never exposes database credentials.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(
        '[MarrowNode] Missing Supabase environment variables. Please check .env.local'
      );
    }
  }

  return createBrowserClient(supabaseUrl || '', supabaseKey || '');
}

export default createClient;

