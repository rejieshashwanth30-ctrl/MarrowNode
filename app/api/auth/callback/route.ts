import { NextResponse, type NextRequest } from 'next/server';
import { GET as handleAuthCallback } from '@/app/auth/callback/route';

export const dynamic = 'force-dynamic';

/**
 * Backward-compatible Auth Callback Route Handler
 * GET /api/auth/callback
 * Delegates directly to /auth/callback to ensure both endpoint patterns resolve cleanly.
 */
export async function GET(request: NextRequest) {
  return handleAuthCallback(request);
}
