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
      // 1. Fast check: verify marrownode schema, modernized columns, and PR check table exist
      const schemaCheck: any[] = await prisma.$queryRawUnsafe(`
        SELECT c.column_name FROM information_schema.columns c
        INNER JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = 'pull_request_checks'
        WHERE c.table_schema = 'marrownode' 
          AND c.table_name = 'projects' 
          AND c.column_name = 'prChecksEnabled'
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

        ALTER TABLE "marrownode"."projects" ADD COLUMN IF NOT EXISTS "prChecksEnabled" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "marrownode"."projects" ADD COLUMN IF NOT EXISTS "prCheckAutoPublish" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "marrownode"."projects" ADD COLUMN IF NOT EXISTS "prWebhookSecretEnc" TEXT;
        ALTER TABLE "marrownode"."projects" ADD COLUMN IF NOT EXISTS "prWebhookSecretLast4" TEXT;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'PrCheckStatus' AND n.nspname = 'marrownode'
          ) THEN
            CREATE TYPE "marrownode"."PrCheckStatus" AS ENUM ('PASS', 'REVIEW', 'INCOMPLETE');
          END IF;
        END
        $$;

        CREATE TABLE IF NOT EXISTS "marrownode"."pull_request_checks" (
          "id" TEXT NOT NULL,
          "projectId" TEXT NOT NULL,
          "repositoryId" TEXT NOT NULL,
          "analysisId" TEXT,
          "prNumber" INTEGER NOT NULL,
          "prTitle" TEXT NOT NULL,
          "prUrl" TEXT,
          "prState" TEXT NOT NULL DEFAULT 'open',
          "authorLogin" TEXT,
          "baseBranch" TEXT,
          "headBranch" TEXT,
          "baseSha" TEXT NOT NULL,
          "headSha" TEXT NOT NULL,
          "analyzedCommitSha" TEXT,
          "status" "marrownode"."PrCheckStatus" NOT NULL DEFAULT 'REVIEW',
          "impactLevel" TEXT NOT NULL DEFAULT 'ISOLATED',
          "changedFilesCount" INTEGER NOT NULL DEFAULT 0,
          "directAffectedCount" INTEGER NOT NULL DEFAULT 0,
          "transitiveAffectedCount" INTEGER NOT NULL DEFAULT 0,
          "isPartialAnalysis" BOOLEAN NOT NULL DEFAULT false,
          "isStaleBase" BOOLEAN NOT NULL DEFAULT false,
          "summaryText" TEXT NOT NULL,
          "triggerSource" TEXT NOT NULL DEFAULT 'manual',
          "githubPublishStatus" TEXT,
          "githubPublishNote" TEXT,
          "reportJson" JSONB NOT NULL,
          "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "pull_request_checks_pkey" PRIMARY KEY ("id")
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "pull_request_checks_repositoryId_prNumber_headSha_key"
          ON "marrownode"."pull_request_checks"("repositoryId", "prNumber", "headSha");
        CREATE INDEX IF NOT EXISTS "pull_request_checks_projectId_createdAt_idx"
          ON "marrownode"."pull_request_checks"("projectId", "createdAt");
        CREATE INDEX IF NOT EXISTS "pull_request_checks_projectId_prNumber_idx"
          ON "marrownode"."pull_request_checks"("projectId", "prNumber");
        CREATE INDEX IF NOT EXISTS "pull_request_checks_repositoryId_prNumber_idx"
          ON "marrownode"."pull_request_checks"("repositoryId", "prNumber");

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'pull_request_checks_projectId_fkey'
          ) THEN
            ALTER TABLE "marrownode"."pull_request_checks"
              ADD CONSTRAINT "pull_request_checks_projectId_fkey"
              FOREIGN KEY ("projectId") REFERENCES "marrownode"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'pull_request_checks_repositoryId_fkey'
          ) THEN
            ALTER TABLE "marrownode"."pull_request_checks"
              ADD CONSTRAINT "pull_request_checks_repositoryId_fkey"
              FOREIGN KEY ("repositoryId") REFERENCES "marrownode"."repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'pull_request_checks_analysisId_fkey'
          ) THEN
            ALTER TABLE "marrownode"."pull_request_checks"
              ADD CONSTRAINT "pull_request_checks_analysisId_fkey"
              FOREIGN KEY ("analysisId") REFERENCES "marrownode"."analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END
        $$;
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
