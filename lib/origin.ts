/**
 * MarrowNode Origin & Redirect Security Resolver
 *
 * Provides a single source of truth for the application's base URL and strictly validates
 * redirect targets to eliminate open redirect vulnerabilities.
 */

export function getAppOrigin(): string {
  // 1. Browser context: always use the current window origin so local and production dynamically work
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // 2. Explicit environment variables
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL;

  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 3. Vercel deployment URL
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim().length > 0) {
    const host = vercelUrl.trim().replace(/\/$/, '');
    return host.startsWith('http') ? host : `https://${host}`;
  }

  // 4. Fallback for local development
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
