import { PrismaClient } from '@prisma/client';

/**
 * Reusable Prisma Client Singleton for Next.js
 * Prevents multiple instances in development / hot reload to conserve Neon connection pool.
 * Enforces marrownode PostgreSQL schema targeting and guards against legacy db.prisma.io.
 */

export function getNormalizedDatabaseUrl(): string | undefined {
  const isPrismaIo = (url?: string) =>
    Boolean(url && (url.includes('db.prisma.io') || url.includes('prisma-data.net')));

  let rawUrl: string | undefined;

  // 1. If DATABASE_URL is set and points to real Neon (not legacy db.prisma.io), use it
  if (process.env.DATABASE_URL && !isPrismaIo(process.env.DATABASE_URL)) {
    rawUrl = process.env.DATABASE_URL;
  }
  // 2. If DATABASE_URL was pointing to legacy db.prisma.io, override with Neon DIRECT_URL
  else if (process.env.DIRECT_URL && !isPrismaIo(process.env.DIRECT_URL)) {
    console.warn('[MarrowNode DB] Overriding legacy db.prisma.io with Neon DIRECT_URL');
    rawUrl = process.env.DIRECT_URL;
  }
  // 3. Check other non-prisma.io variables
  else if (process.env.POSTGRES_URL && !isPrismaIo(process.env.POSTGRES_URL)) {
    rawUrl = process.env.POSTGRES_URL;
  } else if (process.env.DATABASE_URL_POOLED && !isPrismaIo(process.env.DATABASE_URL_POOLED)) {
    rawUrl = process.env.DATABASE_URL_POOLED;
  } else {
    rawUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  }

  if (!rawUrl) return undefined;

  // If connection string does not already specify schema, append schema=marrownode
  if (!rawUrl.includes('schema=')) {
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}schema=marrownode`;
  }

  return rawUrl;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = getNormalizedDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: databaseUrl
      ? {
          db: {
            url: databaseUrl,
          },
        }
      : undefined,
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
