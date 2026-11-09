import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { getSupabaseUrl } from '@/utils/supabase/config';
import { getAppOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

/**
 * Health & Connectivity Test Endpoint for MarrowNode Backend Foundation
 * Verifies Neon PostgreSQL and Supabase Auth connectivity safely.
 * Includes safe diagnostic metadata without exposing secrets.
 */
export async function GET() {
  const status: {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    services: {
      neonPostgres: {
        connected: boolean;
        latencyMs: number;
        error?: string;
      };
      supabaseAuth: {
        reachable: boolean;
        error?: string;
      };
    };
    diagnostic: {
      supabaseHost: string;
      applicationOrigin: string;
      isGitriumBlocked: boolean;
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      neonPostgres: { connected: false, latencyMs: 0 },
      supabaseAuth: { reachable: false },
    },
    diagnostic: {
      supabaseHost: new URL(getSupabaseUrl()).hostname,
      applicationOrigin: getAppOrigin(),
      isGitriumBlocked: true,
    },
  };

  // 1. Test Neon PostgreSQL via Prisma
  const dbStart = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1;');
    status.services.neonPostgres.connected = true;
    status.services.neonPostgres.latencyMs = Date.now() - dbStart;
  } catch (err: any) {
    status.status = 'error';
    status.services.neonPostgres.connected = false;
    status.services.neonPostgres.error = 'Database service unreachable';
  }

  // 2. Test Supabase Auth client reachability
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.getSession();
    if (!error) {
      status.services.supabaseAuth.reachable = true;
    } else {
      status.services.supabaseAuth.error = 'Authentication service error';
    }
  } catch (err: any) {
    status.services.supabaseAuth.error = 'Authentication service unreachable';
  }

  const httpStatus = status.services.neonPostgres.connected ? 200 : 503;
  return NextResponse.json(status, { status: httpStatus });
}
