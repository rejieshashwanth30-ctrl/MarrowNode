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

  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const isGetOrHead = request.method === 'GET' || request.method === 'HEAD';

  // Enforce canonical production domain on top-level page navigations (GET/HEAD).
  // NEVER 308-redirect API requests (/api/*) across domains to avoid dropping POST payloads
  // or triggering WebKit/Safari cross-origin fetch CORS rejections.
  if (
    !isApiRoute &&
    isGetOrHead &&
    cleanHost &&
    !cleanHost.includes('localhost') &&
    !cleanHost.includes('127.0.0.1') &&
    cleanHost !== CANONICAL_HOST &&
    (cleanHost.endsWith('.vercel.app') || cleanHost === 'marrownode.online')
  ) {
    const canonicalUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://www.marrownode.online');
    return NextResponse.redirect(canonicalUrl, 308);
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

