import { NextResponse } from 'next/server';
import { prisma, getNormalizedDatabaseUrl } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { getSupabaseUrl } from '@/utils/supabase/config';
import { getAppOrigin } from '@/lib/origin';
import { ensureMarrowNodeSchema } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

function parseSafeHost(rawUrl?: string): { host: string; db: string } {
  if (!rawUrl) return { host: 'not_set', db: 'not_set' };
  try {
    const fake = rawUrl.replace('postgresql://', 'http://').replace('postgres://', 'http://').replace('prisma+postgres://', 'http://');
    const u = new URL(fake);
    return { host: u.hostname, db: u.pathname ? u.pathname.replace(/^\//, '') : 'default' };
  } catch (_) {
    return { host: 'invalid_format', db: 'unknown' };
  }
}

/**
 * Health & Connectivity Test Endpoint for MarrowNode Production
 * Safely verifies Supabase Auth, Neon PostgreSQL, marrownode schema, and table presence.
 */
export async function GET() {
  const activeUrl = getNormalizedDatabaseUrl();
  const activeHostInfo = parseSafeHost(activeUrl);

  const envHosts = {
    activePrismaHost: activeHostInfo,
    DATABASE_URL: parseSafeHost(process.env.DATABASE_URL),
    POSTGRES_URL: parseSafeHost(process.env.POSTGRES_URL),
    DATABASE_URL_POOLED: parseSafeHost(process.env.DATABASE_URL_POOLED),
    PRISMA_DATABASE_URL: parseSafeHost(process.env.PRISMA_DATABASE_URL),
    DIRECT_URL: parseSafeHost(process.env.DIRECT_URL),
  };

  // 1. Try to ensure schema and tables exist
  let schemaInitError: string | null = null;
  try {
    await ensureMarrowNodeSchema();
  } catch (err: any) {
    schemaInitError = err?.message || 'Init failed';
  }

  const responseData: any = {
    status: 'ok',
    database: 'connected',
    schema: 'marrownode',
    envHosts,
    tables: {
      users: false,
      github_connections: false,
      projects: false,
      repositories: false,
      analyses: false,
      evidences: false,
    },
    services: {
      neonPostgres: { connected: false, latencyMs: 0, error: schemaInitError || undefined },
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

    // Query critical columns to detect schema drift early
    const columnsQuery: Array<{ table_name: string; column_name: string }> = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'marrownode' AND (
        (table_name = 'projects' AND column_name = 'isActive') OR
        (table_name = 'repositories' AND column_name = 'currentCommitSha') OR
        (table_name = 'analyses' AND column_name = 'coverage')
      );
    `);

    responseData.columns = {
      projects_isActive: columnsQuery.some((c) => c.table_name === 'projects' && c.column_name === 'isActive'),
      repositories_currentCommitSha: columnsQuery.some((c) => c.table_name === 'repositories' && c.column_name === 'currentCommitSha'),
      analyses_coverage: columnsQuery.some((c) => c.table_name === 'analyses' && c.column_name === 'coverage'),
    };

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
  const allColumnsOk = responseData.columns ? Object.values(responseData.columns).every(Boolean) : true;

  if (!allTablesOk || !allColumnsOk || !responseData.services.neonPostgres.connected) {
    responseData.status = 'degraded';
  }

  const httpStatus = responseData.services.neonPostgres.connected ? 200 : 503;
  return NextResponse.json(responseData, { status: httpStatus });
}
