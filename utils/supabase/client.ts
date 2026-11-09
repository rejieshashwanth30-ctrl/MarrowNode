import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabasePublishableKey } from '@/utils/supabase/config';

/**
 * Supabase Browser Client for MarrowNode
 * Uses sanitized public credentials only. Guaranteed to connect to MarrowNode Supabase project.
 */
export function createClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  return createBrowserClient(supabaseUrl, supabaseKey);
}

export default createClient;
