/**
 * MarrowNode Canonical Supabase Public Configuration
 *
 * Enforces that MarrowNode connects EXCLUSIVELY to the MarrowNode Supabase project (fzkhipupwxhiylxuzyhj).
 * Explicitly guards against and rejects any accidental Gitrium project references (fcccmfnyvignzdpplknc).
 */

export const MARROWNODE_SUPABASE_URL = 'https://fzkhipupwxhiylxuzyhj.supabase.co';
export const MARROWNODE_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_x2RCZ9FCFNvBvl1SopLMNA_qi4Kn5oK';

export function getSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // Reject stale Gitrium project reference or missing URL
  if (!envUrl || envUrl.includes('fcccmfnyvignzdpplknc') || !envUrl.startsWith('http')) {
    return MARROWNODE_SUPABASE_URL;
  }
  return envUrl;
}

export function getSupabasePublishableKey(): string {
  const envKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  // Reject stale Gitrium publishable key or missing key
  if (!envKey || envKey.includes('2YSArftN') || envKey.length < 20) {
    return MARROWNODE_SUPABASE_PUBLISHABLE_KEY;
  }
  return envKey;
}
