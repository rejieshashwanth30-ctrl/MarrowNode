import { AuthError } from '@/lib/auth';

/**
 * Maps internal server/database exceptions to safe, user-friendly API messages
 * without leaking Prisma details, SQL schema, stack traces, or tokens.
 */
export function getSafeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  logContext?: string
): { message: string; statusCode: number } {
  if (error instanceof AuthError) {
    return { message: error.message, statusCode: error.statusCode };
  }

  const raw = error instanceof Error ? error.message : String(error || '');
  if (logContext) {
    console.error(`[MarrowNode Error] ${logContext}:`, raw);
  }

  const lower = raw.toLowerCase();
  const isInternalDbOrSystem =
    lower.includes('prisma') ||
    lower.includes('invocation') ||
    lower.includes('postgres') ||
    lower.includes('neon') ||
    lower.includes('column ') ||
    lower.includes('relation ') ||
    lower.includes('econn') ||
    lower.includes('etimedout') ||
    lower.includes('bearer ') ||
    lower.includes('token=');

  if (isInternalDbOrSystem || !raw.trim()) {
    return { message: fallbackMessage, statusCode: 500 };
  }

  // Safe explicit domain error (e.g. "GitHub access token missing..." or "Project not found...")
  const statusCode =
    typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
  return { message: raw, statusCode };
}

