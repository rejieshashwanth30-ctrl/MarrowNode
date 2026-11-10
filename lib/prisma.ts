import { PrismaClient } from '@prisma/client';

/**
 * Reusable Prisma Client Singleton for Next.js
 * Prevents multiple instances in development / hot reload to conserve Neon connection pool.
 * Enforces marrownode PostgreSQL schema targeting across all environments.
 */

function getNormalizedDatabaseUrl(): string | undefined {
  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_POOLED ||
    process.env.PRISMA_DATABASE_URL;

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
