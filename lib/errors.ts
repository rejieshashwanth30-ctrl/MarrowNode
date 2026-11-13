import { AuthError } from '@/lib/auth';

export type SafeErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'REPOSITORY_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'GITHUB_RATE_LIMIT'
  | 'GITHUB_TIMEOUT'
  | 'GITHUB_UNAVAILABLE'
  | 'DATABASE_ERROR'
  | 'ANALYSIS_ERROR'
  | 'UNKNOWN_ERROR';

export interface SafeErrorResult {
  message: string;
  statusCode: number;
  category: SafeErrorCategory;
}

/**
 * Maps internal server/database exceptions to safe, user-friendly API messages
 * without leaking Prisma details, SQL schema, stack traces, or tokens.
 */
export function getSafeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  logContext?: string
): SafeErrorResult {
  if (error instanceof AuthError) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      category: 'AUTHENTICATION_ERROR',
    };
  }

  const raw = error instanceof Error ? error.message : String(error || '');
  if (logContext) {
    console.error(`[MarrowNode Error] ${logContext}:`, raw);
  }

  const lower = raw.toLowerCase();

  // 1. Explicit GitHub API errors with domain classification
  const isGitHubApiError =
    (error as any)?.name === 'GitHubApiError' ||
    Boolean((error as any)?.isRateLimit || (error as any)?.isAuthError);

  const statusCode =
    typeof (error as any)?.statusCode === 'number'
      ? (error as any).statusCode
      : error instanceof AuthError
        ? error.statusCode
        : 500;

  if (isGitHubApiError || (statusCode >= 400 && statusCode < 500 && lower.includes('github'))) {
    if (statusCode === 401 || (error as any)?.isAuthError || lower.includes('bad credentials')) {
      return {
        message: 'GitHub access expired or token revoked. Please reconnect GitHub and try again.',
        statusCode: 401,
        category: 'AUTHENTICATION_ERROR',
      };
    }
    if (statusCode === 403) {
      if (lower.includes('rate limit')) {
        return {
          message: 'GitHub API rate limit reached. Please wait a moment and try again.',
          statusCode: 429,
          category: 'GITHUB_RATE_LIMIT',
        };
      }
      return {
        message: 'GitHub access forbidden. Check repository permissions or reconnect GitHub.',
        statusCode: 403,
        category: 'PERMISSION_ERROR',
      };
    }
    if (statusCode === 404) {
      return {
        message: 'Repository or branch not found on GitHub. Verify the repository still exists.',
        statusCode: 404,
        category: 'REPOSITORY_NOT_FOUND',
      };
    }
    if (statusCode === 429 || (error as any)?.isRateLimit) {
      return {
        message: 'GitHub API rate limit reached. Please wait a moment and try again.',
        statusCode: 429,
        category: 'GITHUB_RATE_LIMIT',
      };
    }
  }

  // 2. Timeout and abort errors
  if (
    (error as any)?.name === 'AbortError' ||
    lower.includes('aborted') ||
    lower.includes('etimedout') ||
    lower.includes('timed out')
  ) {
    return {
      message: 'GitHub request timed out. Please try again.',
      statusCode: 504,
      category: 'GITHUB_TIMEOUT',
    };
  }

  // 3. Database / internal driver errors (must mask SQL/driver details)
  const isInternalDbOrSystem =
    lower.includes('prisma') ||
    lower.includes('invocation') ||
    lower.includes('postgres') ||
    lower.includes('neon') ||
    lower.includes('column ') ||
    lower.includes('relation ') ||
    /\beconn[a-z0-9_]*\b/i.test(lower) || // Word-boundary ECONN check (does NOT match "reconnect")
    lower.includes('bearer ') ||
    lower.includes('token=');

  if (isInternalDbOrSystem || !raw.trim()) {
    return {
      message: fallbackMessage,
      statusCode: 500,
      category: 'DATABASE_ERROR',
    };
  }

  // 4. Safe explicit application error
  return {
    message: raw,
    statusCode,
    category: statusCode === 401 ? 'AUTHENTICATION_ERROR' : 'UNKNOWN_ERROR',
  };
}

