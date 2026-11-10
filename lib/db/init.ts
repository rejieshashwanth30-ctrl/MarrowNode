import { prisma } from '@/lib/prisma';

let isInitialized = false;
let initPromise: Promise<boolean> | null = null;

/**
 * Ensures the 'marrownode' PostgreSQL schema and all required tables exist.
 * Idempotent, safe, and runs on cold start so that ANY Neon database connected
 * to MarrowNode (in production or local) automatically has the required schema.
 */
export async function ensureMarrowNodeSchema(): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // 1. Fast check: verify marrownode schema and critical modernized columns exist
      const schemaCheck: any[] = await prisma.$queryRawUnsafe(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'marrownode' 
          AND table_name = 'projects' 
          AND column_name = 'isActive'
        LIMIT 1;
      `);

      if (schemaCheck.length > 0) {
        isInitialized = true;
        return true;
      }

      console.log('[MarrowNode DB Init] marrownode schema, tables, or modernized columns missing. Provisioning now...');

      // 2. Execute idempotent schema DDL
      await prisma.$executeRawUnsafe(`
        -- Create Schema
        CREATE SCHEMA IF NOT EXISTS "marrownode";

        -- Create Enum
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'AnalysisStatus' AND n.nspname = 'marrownode') THEN
            CREATE TYPE "marrownode"."AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
          END IF;
        END $$;

        -- Create Users Table
        CREATE TABLE IF NOT EXISTS "marrownode"."users" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "supabaseUserId" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "displayName" TEXT,
          "avatarUrl" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- Create GitHub Connections Table
        CREATE TABLE IF NOT EXISTS "marrownode"."github_connections" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "githubAccountId" TEXT NOT NULL,
          "githubUsername" TEXT NOT NULL,
          "avatarUrl" TEXT,
          "accessToken" TEXT,
          "connectionStatus" TEXT NOT NULL DEFAULT 'connected',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "github_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marrownode"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );

        -- Create Projects Table
        CREATE TABLE IF NOT EXISTS "marrownode"."projects" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "ownerId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "githubRepositoryId" TEXT,
          "githubRepositoryName" TEXT,
          "githubOwner" TEXT,
          "defaultBranch" TEXT NOT NULL DEFAULT 'main',
          "visibility" TEXT NOT NULL DEFAULT 'private',
          "primaryLanguage" TEXT,
          "framework" TEXT,
          "database" TEXT,
          "analysisStatus" "marrownode"."AnalysisStatus" NOT NULL DEFAULT 'PENDING',
          "lastAnalyzedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "marrownode"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );

        -- Create Repositories Table
        CREATE TABLE IF NOT EXISTS "marrownode"."repositories" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectId" TEXT NOT NULL,
          "githubRepoId" TEXT,
          "owner" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "fullName" TEXT NOT NULL,
          "url" TEXT NOT NULL,
          "defaultBranch" TEXT NOT NULL DEFAULT 'main',
          "isPrivate" BOOLEAN NOT NULL DEFAULT true,
          "language" TEXT,
          "description" TEXT,
          "stars" INTEGER NOT NULL DEFAULT 0,
          "isFork" BOOLEAN NOT NULL DEFAULT false,
          "lastSyncedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "marrownode"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );

        -- Create Analyses Table
        CREATE TABLE IF NOT EXISTS "marrownode"."analyses" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectId" TEXT NOT NULL,
          "status" "marrownode"."AnalysisStatus" NOT NULL DEFAULT 'PENDING',
          "startedAt" TIMESTAMP(3),
          "completedAt" TIMESTAMP(3),
          "filesAnalyzed" INTEGER NOT NULL DEFAULT 0,
          "commitsAnalyzed" INTEGER NOT NULL DEFAULT 0,
          "dependenciesDetected" INTEGER NOT NULL DEFAULT 0,
          "architectureNodes" INTEGER NOT NULL DEFAULT 0,
          "evidenceCount" INTEGER NOT NULL DEFAULT 0,
          "errorMessage" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "marrownode"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );

        -- Create Evidences Table
        CREATE TABLE IF NOT EXISTS "marrownode"."evidences" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "path" TEXT,
          "externalUrl" TEXT,
          "reference" TEXT,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "evidences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "marrownode"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );

        -- Unique constraints & indexes
        CREATE UNIQUE INDEX IF NOT EXISTS "users_supabaseUserId_key" ON "marrownode"."users"("supabaseUserId");
        CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "marrownode"."users"("email");
        CREATE UNIQUE INDEX IF NOT EXISTS "github_connections_userId_key" ON "marrownode"."github_connections"("userId");
        CREATE INDEX IF NOT EXISTS "projects_ownerId_idx" ON "marrownode"."projects"("ownerId");
        CREATE UNIQUE INDEX IF NOT EXISTS "repositories_projectId_key" ON "marrownode"."repositories"("projectId");
        CREATE INDEX IF NOT EXISTS "analyses_projectId_idx" ON "marrownode"."analyses"("projectId");
        CREATE INDEX IF NOT EXISTS "evidences_projectId_idx" ON "marrownode"."evidences"("projectId");

        -- Safe idempotency updates for new fields on existing databases
        ALTER TABLE "marrownode"."projects" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE "marrownode"."repositories" ADD COLUMN IF NOT EXISTS "currentCommitSha" TEXT;
        ALTER TABLE "marrownode"."analyses" ADD COLUMN IF NOT EXISTS "commitSha" TEXT;
        ALTER TABLE "marrownode"."analyses" ADD COLUMN IF NOT EXISTS "branch" TEXT;
        ALTER TABLE "marrownode"."analyses" ADD COLUMN IF NOT EXISTS "coverage" DOUBLE PRECISION;
        ALTER TABLE "marrownode"."analyses" ADD COLUMN IF NOT EXISTS "analyzerVersion" TEXT DEFAULT 'v1.0';
        ALTER TABLE "marrownode"."analyses" ADD COLUMN IF NOT EXISTS "summaryJson" JSONB;
      `);

      console.log('[MarrowNode DB Init] marrownode schema and tables successfully provisioned.');
      isInitialized = true;
      return true;
    } catch (err: any) {
      console.error('[MarrowNode DB Init] Error provisioning marrownode schema:', err?.message || err);
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}
