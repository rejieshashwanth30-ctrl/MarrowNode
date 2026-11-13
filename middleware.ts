import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

const CANONICAL_HOST = 'www.marrownode.online';

/**
 * Root Next.js Middleware for MarrowNode
 * Enforces canonical production domain (https://www.marrownode.online)
 * and keeps user session active without loading heavyweight database logic.
 */
export async function middleware(request: NextRequest) {
  // 1. Canonical domain enforcement in production
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const cleanHost = host.split(',')[0].trim().toLowerCase();

  // If request hits old vercel domain or non-www apex domain on GET/HEAD, redirect to canonical production origin
  if (
    cleanHost &&
    !cleanHost.includes('localhost') &&
    !cleanHost.includes('127.0.0.1') &&
    cleanHost !== CANONICAL_HOST &&
    (cleanHost.endsWith('.vercel.app') || cleanHost === 'marrownode.online')
  ) {
    // Preserve POST webhooks without 308 redirecting to avoid payload drop by webhook callers
    if (!request.nextUrl.pathname.startsWith('/api/github/webhooks')) {
      const canonicalUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://www.marrownode.online');
      return NextResponse.redirect(canonicalUrl, 308);
    }
  }

  // 2. Session refresh
  const { supabaseResponse } = await updateSession(request);
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, svg, icons
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

