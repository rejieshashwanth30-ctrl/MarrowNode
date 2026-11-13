/**
 * MarrowNode Origin & Redirect Security Resolver
 *
 * Provides a single source of truth for the application's base URL and strictly validates
 * redirect targets to eliminate open redirect vulnerabilities.
 * Enforces the canonical public production domain (https://www.marrownode.online)
 * and strictly prevents redirects to Vercel preview/deployment URLs which require Vercel login.
 */

export const CANONICAL_PUBLIC_ORIGIN = 'https://www.marrownode.online';

export function getAppOrigin(
  request?: Request | { headers?: Headers | { get(key: string): string | null } }
): string {
  // 1. If a server request object is provided (e.g. in /auth/callback route handler):
  if (request?.headers) {
    const host =
      (typeof request.headers.get === 'function' ? request.headers.get('x-forwarded-host') : null) ||
      (typeof request.headers.get === 'function' ? request.headers.get('host') : null);

    if (host) {
      const cleanHost = host.split(',')[0].trim();
      // If running locally, preserve localhost
      if (cleanHost.includes('localhost') || cleanHost.includes('127.0.0.1')) {
        return `http://${cleanHost}`;
      }
      // Any Vercel deployment URL, apex domain, or preview domain maps strictly to canonical public origin
      if (
        cleanHost.endsWith('.vercel.app') ||
        cleanHost.includes('marrow') ||
        cleanHost === 'marrownode.online' ||
        cleanHost === 'www.marrownode.online'
      ) {
        return CANONICAL_PUBLIC_ORIGIN;
      }
    }
  }

  // 2. Browser context:
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '');
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
    // If the browser is on any Vercel domain or apex domain, enforce the canonical public origin
    if (
      origin.includes('.vercel.app') ||
      origin.includes('marrownode.online') ||
      origin.includes('marrow')
    ) {
      return CANONICAL_PUBLIC_ORIGIN;
    }
    return origin;
  }

  // 3. Explicit environment variables (if set)
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim().length > 0) {
    const clean = envUrl.trim().replace(/\/+$/, '');
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) {
      return clean;
    }
    if (
      clean.includes('.vercel.app') ||
      clean.includes('marrownode.online') ||
      clean.includes('marrow')
    ) {
      return CANONICAL_PUBLIC_ORIGIN;
    }
    return clean;
  }

  // 4. In production environment, always default to the public canonical origin
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    return CANONICAL_PUBLIC_ORIGIN;
  }

  // 5. Fallback for local development
  return 'http://localhost:3000';
}

/**
 * Validates and sanitizes internal redirect paths.
 * Rejects external domains, protocol prefixes, scheme-relative URLs, and blocked terms (e.g., gitrium).
 */
export function sanitizeRedirectPath(
  rawPath: string | null | undefined,
  defaultPath = '/dashboard'
): string {
  if (!rawPath) return defaultPath;

  const trimmed = rawPath.trim();

  // Must start with a single slash and not be scheme-relative (//) or backslash (/\)
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('://') ||
    trimmed.includes('\\')
  ) {
    return defaultPath;
  }

  // Explicit security filter: block any external domain fragment or unwanted keyword
  if (/gitrium/i.test(trimmed) || /https?:/i.test(trimmed)) {
    return defaultPath;
  }

  // Allow only valid internal application routes
  const allowedPrefixes = ['/dashboard', '/onboarding', '/settings', '/project', '/overview'];
  const isAllowed = allowedPrefixes.some(
    (prefix) =>
      trimmed === prefix ||
      trimmed.startsWith(prefix + '/') ||
      trimmed.startsWith(prefix + '?')
  );

  return isAllowed ? trimmed : defaultPath;
}
