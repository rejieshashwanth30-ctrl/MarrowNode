/**
 * MarrowNode Server-Side Environment Validation
 * Validates required environment variables safely without printing secret values.
 */

interface ValidatedEnv {
  DATABASE_URL: string;
  DIRECT_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
}

export function validateEnv(): ValidatedEnv {
  const missing: string[] = [];

  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!dbUrl) missing.push('DATABASE_URL');
  if (!directUrl) missing.push('DIRECT_URL');
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  if (missing.length > 0) {
    const errorMsg = `[MarrowNode Configuration] Missing environment variables: ${missing.join(
      ', '
    )}. Please ensure these are set in Vercel Project Settings → Environment Variables.`;
    console.warn(errorMsg);
  }

  return {
    DATABASE_URL: dbUrl || '',
    DIRECT_URL: directUrl || dbUrl || '',
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl || '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseKey || '',
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://marrow-node.vercel.app' : 'http://localhost:3000'),
  };
}

export const env = validateEnv();

