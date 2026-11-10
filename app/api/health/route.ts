import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { getSupabaseUrl } from '@/utils/supabase/config';
import { getAppOrigin } from '@/lib/origin';
import { ensureMarrowNodeSchema } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

function getSafeDatabaseInfo() {
  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_POOLED ||
    process.env.PRISMA_DATABASE_URL ||
    '';

  if (!rawUrl) {
    return { host: 'unknown', database: 'unknown', mode: 'none' };
  }

  try {
    const parsed = new URL(rawUrl.replace('postgresql://', 'http://').replace('postgres://', 'http://'));
    return {
      host: parsed.hostname || 'unknown',
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'unknown',
      mode: rawUrl.includes('pooler') ? 'pooled' : 'direct',
    };
  } catch (_) {
    return { host: 'unparseable', database: 'unknown', mode: 'unknown' };
  }
}

/**
 * Health & Connectivity Test Endpoint for MarrowNode Production
 * Safely verifies Supabase Auth, Neon PostgreSQL, marrownode schema, and table presence.
 */
export async function GET() {
  // 1. Ensure schema and tables exist
  await ensureMarrowNodeSchema();

  const dbInfo = getSafeDatabaseInfo();

  const responseData: {
    status: 'ok' | 'degraded' | 'error';
    database: 'connected' | 'disconnected' | 'error';
    schema: string;
    databaseInfo: {
      host: string;
      database: string;
      mode: string;
    };
    tables: {
      users: boolean;
      github_connections: boolean;
      projects: boolean;
      repositories: boolean;
      analyses: boolean;
      evidences: boolean;
    };
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
      prismaUserCount: number;
    };
  } = {
    status: 'ok',
    database: 'connected',
    schema: 'marrownode',
    databaseInfo: dbInfo,
    tables: {
      users: false,
      github_connections: false,
      projects: false,
      repositories: false,
      analyses: false,
      evidences: false,
    },
    services: {
      neonPostgres: { connected: false, latencyMs: 0 },
      supabaseAuth: { reachable: false },
    },
    diagnostic: {
      supabaseHost: new URL(getSupabaseUrl()).hostname,
      applicationOrigin: getAppOrigin(),
      prismaUserCount: 0,
    },
  };

  // 2. Query information_schema for existing tables in marrownode
  const dbStart = Date.now();
  try {
    const tablesQuery: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'marrownode';
    `);

    const existingTables = new Set(tablesQuery.map((t) => t.table_name.toLowerCase()));

    responseData.tables.users = existingTables.has('users');
    responseData.tables.github_connections = existingTables.has('github_connections');
    responseData.tables.projects = existingTables.has('projects');
    responseData.tables.repositories = existingTables.has('repositories');
    responseData.tables.analyses = existingTables.has('analyses');
    responseData.tables.evidences = existingTables.has('evidences');

    // Test Prisma model query
    const userCount = await prisma.user.count();
    responseData.diagnostic.prismaUserCount = userCount;

    responseData.services.neonPostgres.connected = true;
    responseData.services.neonPostgres.latencyMs = Date.now() - dbStart;
    responseData.database = 'connected';
  } catch (err: any) {
    responseData.status = 'error';
    responseData.database = 'error';
    responseData.services.neonPostgres.connected = false;
    responseData.services.neonPostgres.error = err?.message || 'Database query error';
  }

  // 3. Test Supabase Auth client reachability
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.getSession();
    if (!error) {
      responseData.services.supabaseAuth.reachable = true;
    } else {
      responseData.services.supabaseAuth.error = 'Authentication service error';
    }
  } catch (err: any) {
    responseData.services.supabaseAuth.error = 'Authentication service unreachable';
  }

  const allTablesOk = Object.values(responseData.tables).every(Boolean);
  if (!allTablesOk || !responseData.services.neonPostgres.connected) {
    responseData.status = 'degraded';
  }

  const httpStatus = responseData.services.neonPostgres.connected ? 200 : 503;
  return NextResponse.json(responseData, { status: httpStatus });
}
