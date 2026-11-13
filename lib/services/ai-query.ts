import { prisma } from '@/lib/prisma';
import {
  getProjectWorkstationContext,
  registerCacheInvalidationListener,
  type ProjectWorkstationContext,
} from '@/lib/services/project-context';
import { getOrCreateCurrentProfile, requireAuth } from '@/lib/auth';
import { DependencyGraphEngine, type DependencyEdge } from '@/lib/analysis/graph-engine';
import type { FileTreeNode } from '@/types';

export interface AskProjectResult {
  answer: string;
  fact: string | null;
  inference: string | null;
  unknown: string | null;
  citations: Array<{ path: string; label: string; type: string }>;
  confidence: 'High' | 'Medium' | 'Low';
  modelUsed: string;
  cached: boolean;
  intent?: QueryIntent;
  analysisSnapshot?: {
    analysisId: string | null;
    commitSha: string | null;
    freshness: string;
  };
}

export type QueryIntent =
  | 'DEPENDENCY'
  | 'ARCHITECTURE'
  | 'FILE'
  | 'SYMBOL'
  | 'HISTORY'
  | 'IMPACT'
  | 'DOCUMENTATION'
  | 'FRAMEWORK'
  | 'AUTH'
  | 'DATABASE'
  | 'GENERAL_PROJECT';

// In-memory query cache strictly isolated by userId + projectId + analysisId + commitSha + intent + query
const queryCache = new Map<string, { result: AskProjectResult; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

registerCacheInvalidationListener((projectId) => {
  if (!projectId) {
    queryCache.clear();
    return;
  }
  for (const key of Array.from(queryCache.keys())) {
    if (key.includes(`:${projectId}:`)) {
      queryCache.delete(key);
    }
  }
});

/**
 * Flatten recursive FileTreeNode tree into file path strings.
 */
function flattenFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (items: FileTreeNode[]) => {
    for (const item of items) {
      if (item.type === 'file') {
        paths.push(item.path);
      }
      if (item.children && item.children.length > 0) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

/**
 * Classifies the user's question into the exact repository evidence domain.
 */
export function classifyQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();

  if (
    q.includes('blast radius') ||
    q.includes('what breaks') ||
    q.includes('what depends on') ||
    q.includes('if i change') ||
    q.includes('impact of') ||
    q.includes('affected if') ||
    q.includes('downstream') ||
    q.includes('consumers of') ||
    q.includes('who imports') ||
    q.includes('what imports') ||
    q.includes('who uses') ||
    q.includes('what uses') ||
    q.includes('imported by')
  ) {
    return 'IMPACT';
  }

  if (
    /\b(dependenc(?:y|ies)|package(?:s)?|librar(?:y|ies)|npm|manifest|third[- ]party)\b/.test(q)
  ) {
    return 'DEPENDENCY';
  }

  if (
    /\b(readme|document(?:ation)?|docs|contributing|license|changelog|manual)\b/.test(q)
  ) {
    return 'DOCUMENTATION';
  }

  if (
    /\b(commit(?:s)?|history|timeline|recent(?:ly)?|latest change|who added|who wrote|when was)\b/.test(
      q
    ) ||
    q.includes('what changed')
  ) {
    return 'HISTORY';
  }

  if (
    /\b(auth(?:entication)?|login|log in|signin|sign in|oauth|supabase|session|jwt|credentials|clerk|next-auth)\b/.test(
      q
    )
  ) {
    return 'AUTH';
  }

  if (
    /\b(database|db|prisma|neon|postgres|postgresql|mysql|sqlite|mongodb|mongoose|redis|drizzle|schema|sql|orm)\b/.test(
      q
    )
  ) {
    return 'DATABASE';
  }

  if (
    /\b(framework|tech stack|stack|built with|written in|language|runtime)\b/.test(q)
  ) {
    return 'FRAMEWORK';
  }

  if (
    /\b(architecture|project structure|structure|modules|topology|organized|layout)\b/.test(q)
  ) {
    return 'ARCHITECTURE';
  }

  if (
    /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|json|prisma|sql|md|yml|yaml)\b/.test(q) ||
    q.includes('/')
  ) {
    return 'FILE';
  }

  return 'GENERAL_PROJECT';
}

function categorizeDependencies(dependencies: string[]) {
  const framework: string[] = [];
  const database: string[] = [];
  const auth: string[] = [];
  const uiAndStyling: string[] = [];
  const tooling: string[] = [];
  const others: string[] = [];

  for (const dep of dependencies) {
    const lower = dep.toLowerCase();
    if (
      [
        'next',
        'react',
        'react-dom',
        'vue',
        '@angular/core',
        'express',
        '@nestjs/core',
        'fastify',
        'svelte',
        'django',
        'fastapi',
        'flask',
      ].includes(lower)
    ) {
      framework.push(dep);
    } else if (
      lower.includes('prisma') ||
      lower.includes('postgres') ||
      lower.includes('mysql') ||
      lower.includes('sqlite') ||
      lower.includes('mongo') ||
      lower.includes('mongoose') ||
      lower.includes('redis') ||
      lower === 'pg' ||
      lower.includes('drizzle') ||
      lower.includes('sqlalchemy')
    ) {
      database.push(dep);
    } else if (
      lower.includes('supabase') ||
      lower.includes('auth') ||
      lower.includes('jwt') ||
      lower.includes('bcrypt') ||
      lower.includes('clerk') ||
      lower.includes('lucia') ||
      lower.includes('passport')
    ) {
      auth.push(dep);
    } else if (
      lower.includes('tailwind') ||
      lower.includes('lucide') ||
      lower.includes('clsx') ||
      lower.includes('radix') ||
      lower.includes('framer')
    ) {
      uiAndStyling.push(dep);
    } else if (
      lower.includes('type') ||
      lower.includes('eslint') ||
      lower.includes('prettier') ||
      lower.includes('jest') ||
      lower.includes('vitest') ||
      lower.includes('postcss')
    ) {
      tooling.push(dep);
    } else {
      others.push(dep);
    }
  }

  return { framework, database, auth, uiAndStyling, tooling, others };
}

function findDocumentationExplanation(
  subject: string,
  readmePreview: string | null,
  commits: Array<{ title: string; commitShort: string }>
): string | null {
  if (!subject) return null;
  const s = subject.toLowerCase();
  if (
    readmePreview &&
    readmePreview.toLowerCase().includes(s) &&
    /\b(because|chosen|selected|uses .* for|reason|since)\b/i.test(readmePreview)
  ) {
    return readmePreview.slice(0, 260);
  }
  const commitWhy = commits.find(
    (c) =>
      c.title.toLowerCase().includes(s) &&
      /\b(because|replace|migrate|reason|switch|prefer)\b/i.test(c.title)
  );
  if (commitWhy) {
    return `Commit ${commitWhy.commitShort}: "${commitWhy.title}"`;
  }
  return null;
}

/**
 * Pure deterministic evidence-grounded Ask MarrowNode synthesizer.
 */
export function synthesizeAskAnswerPure(params: {
  context: ProjectWorkstationContext;
  dependencyEdges: DependencyEdge[];
  query: string;
  historicalCommits?: Array<{
    commitSha: string;
    shortSha: string;
    message: string;
    authorName: string;
    committedAt: Date | string;
    eventType?: string;
  }>;
  totalCommitsCount?: number;
}): AskProjectResult {
  const { context, dependencyEdges, query, historicalCommits, totalCommitsCount } = params;
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const intent = classifyQueryIntent(trimmed);
  const allFiles = flattenFilePaths(context.fileTree);
  const allFilesSet = new Set(allFiles);
  const citations: Array<{ path: string; label: string; type: string }> = [];

  const parsedCount = context.coverage?.files?.parsed ?? 0;
  const sourceTotal = context.coverage?.files?.source ?? allFiles.length;
  const parsedScopeStr = `${parsedCount} of ${sourceTotal} source files analyzed`;

  const isMotivationQuery =
    /\bwhy\b/.test(q) ||
    q.includes('rationale') ||
    q.includes('reason for choosing') ||
    q.includes('motivation');

  // Helper: cite manifest ONLY if that actual manifest file exists in the repository
  const existingManifest =
    ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml'].find((m) =>
      allFilesSet.has(m)
    ) ||
    allFiles.find(
      (f) =>
        f.endsWith('/package.json') ||
        f.endsWith('requirements.txt') ||
        f.endsWith('go.mod') ||
        f.endsWith('Cargo.toml')
    ) ||
    null;

  let fact = '';
  let inference = '';
  let unknown = '';
  let confidence: 'High' | 'Medium' | 'Low' = 'High';

  // Detect real DB technologies cleanly
  const dbDeps = context.dependencies.filter((d) =>
    /^(prisma|@prisma\/client|drizzle-orm|pg|postgres|@neondatabase|mysql|mysql2|sqlite3|better-sqlite3|mongodb|mongoose|redis|ioredis|psycopg2|sqlalchemy|alembic)/i.test(
      d
    )
  );
  const dbFiles = allFiles.filter((f) =>
    /(^|\/)(schema\.prisma|prisma\/|drizzle|migrations\/|db\.|database)/i.test(f) ||
    f.endsWith('.sql')
  );
  const detectedDbLabel =
    context.project.database ||
    (dbDeps.some((d) => d.includes('prisma')) || dbFiles.some((f) => f.endsWith('schema.prisma'))
      ? 'PostgreSQL / Prisma'
      : dbDeps.some((d) => /mongo/i.test(d))
      ? 'MongoDB'
      : dbDeps.some((d) => /mysql/i.test(d))
      ? 'MySQL'
      : dbDeps.some((d) => /sqlite/i.test(d))
      ? 'SQLite'
      : dbDeps.some((d) => /^(pg|postgres|@neondatabase|psycopg)/i.test(d))
      ? 'PostgreSQL'
      : null);

  switch (intent) {
    case 'DATABASE': {
      // Negative check: e.g. "Does this project use MongoDB?"
      const queriedDbs = [
        { key: 'mongodb', re: /\bmongo(?:db)?|mongoose\b/, matches: /mongo/i.test(detectedDbLabel || '') || dbDeps.some((d) => /mongo/i.test(d)) },
        { key: 'mysql', re: /\bmysql\b/, matches: /mysql/i.test(detectedDbLabel || '') || dbDeps.some((d) => /mysql/i.test(d)) },
        { key: 'sqlite', re: /\bsqlite\b/, matches: /sqlite/i.test(detectedDbLabel || '') || dbDeps.some((d) => /sqlite/i.test(d)) },
        { key: 'redis', re: /\bredis\b/, matches: /redis/i.test(detectedDbLabel || '') || dbDeps.some((d) => /redis/i.test(d)) },
        { key: 'postgresql', re: /\bpostgres(?:ql)?|neon\b/, matches: /postgres|neon/i.test(detectedDbLabel || '') || dbDeps.some((d) => /postgres|pg|prisma|neon/i.test(d)) },
      ];
      const specificQueried = queriedDbs.find((item) => item.re.test(q));

      if (specificQueried && !specificQueried.matches) {
        if (detectedDbLabel) {
          fact = `No. The analyzed repository evidence indicates ${detectedDbLabel} is configured rather than ${specificQueried.key}.`;
          inference = `Verified across ${dbDeps.length} database package(s) and ${dbFiles.length} schema/database file(s).`;
          unknown =
            'External services configured solely through undocumented runtime environment variables cannot be seen in static source.';
        } else {
          fact = `No. No ${specificQueried.key} client libraries, schema files, or database configuration were found in the analyzed repository (${parsedScopeStr}).`;
          unknown =
            parsedCount < sourceTotal
              ? `${sourceTotal - parsedCount} source files were not AST-parsed and could not be inspected.`
              : 'Runtime-injected services outside version-controlled files cannot be verified statically.';
          confidence = 'Medium';
        }
        dbFiles.slice(0, 3).forEach((f) => citations.push({ path: f, label: f, type: 'Schema' }));
        if (citations.length === 0 && existingManifest) {
          citations.push({ path: existingManifest, label: existingManifest, type: 'Manifest' });
        }
        break;
      }

      if (detectedDbLabel || dbDeps.length > 0 || dbFiles.length > 0) {
        const displayDb = detectedDbLabel || `ORM / SQL storage (${dbDeps.join(', ') || dbFiles[0]})`;
        if (isMotivationQuery) {
          const docWhy = findDocumentationExplanation(
            detectedDbLabel || 'prisma',
            context.summary.readmePreview,
            context.timeline
          );
          fact = `The repository evidence shows that ${displayDb} is configured${
            dbFiles.length > 0 ? ` (e.g., ${dbFiles.slice(0, 3).join(', ')})` : ''
          }.`;
          if (docWhy) {
            inference = `Documented context found: ${docWhy}`;
          } else {
            unknown = `The repository shows ${displayDb} is used, but I couldn't verify why it was chosen from README documentation or commits.`;
          }
        } else {
          fact = `This project uses ${displayDb}${
            dbDeps.length > 0 ? ` via ${dbDeps.join(', ')}` : ''
          }.`;
          inference =
            dbFiles.length > 0
              ? `Schema and persistence files are located at ${dbFiles.slice(0, 4).join(', ')}.`
              : `Confirmed via declared packages (${dbDeps.join(', ')}).`;
          unknown =
            'Live database host credentials, row counts, and runtime query latency are outside static source code.';
        }
        dbFiles.slice(0, 3).forEach((f) => citations.push({ path: f, label: f, type: 'Schema' }));
        if (existingManifest) {
          citations.push({ path: existingManifest, label: existingManifest, type: 'Manifest' });
        }
      } else {
        fact = `I couldn't verify any database from the analyzed repository (${parsedScopeStr}). No schema files, SQL migrations, or recognized ORM/database packages were found.`;
        unknown = 'If data is stored in an external HTTP API or browser storage, it appears outside standard DB manifests.';
        confidence = 'Low';
      }
      break;
    }

    case 'AUTH': {
      const authFiles = allFiles.filter((p) =>
        /(auth|supabase|session|login|signin|signout|callback|oauth|middleware|rbac|jwt)/i.test(p)
      );
      const authDeps = context.dependencies.filter((d) =>
        /(supabase|auth|clerk|lucia|jose|jsonwebtoken|passport|oauth)/i.test(d)
      );

      if (authFiles.length > 0 || authDeps.length > 0) {
        const provider = authDeps.some((d) => d.includes('supabase')) || authFiles.some((f) => f.includes('supabase'))
          ? 'Supabase Auth / SSR'
          : authDeps[0] || 'server auth handlers';

        if (isMotivationQuery) {
          const subject = q.includes('supabase') ? 'supabase' : q.includes('oauth') ? 'oauth' : 'auth';
          const docWhy = findDocumentationExplanation(
            subject,
            context.summary.readmePreview,
            context.timeline
          );
          fact = `Authentication is handled through ${provider}${
            authFiles.length > 0 ? ` across ${authFiles.slice(0, 5).join(', ')}` : ''
          }.`;
          if (docWhy) {
            inference = `Documented context found: ${docWhy}`;
          } else {
            unknown = `The repository evidence shows that ${provider} is used, but I couldn't verify why it was chosen.`;
          }
        } else if (q.includes('oauth') || q.includes('callback')) {
          const oauthFiles = authFiles.filter((f) => /callback|oauth|auth/i.test(f));
          fact = `OAuth / login callback handling appears in: ${
            (oauthFiles.length > 0 ? oauthFiles : authFiles).slice(0, 5).join(', ') || provider
          }.`;
          inference = authDeps.length > 0
            ? `Backed by declared auth package(s): ${authDeps.join(', ')}.`
            : 'Auth helpers handle session exchange and server request verification.';
          unknown = 'OAuth client IDs/secrets and callback URLs configured inside provider dashboards are not stored in repository source.';
        } else {
          fact = `Authentication uses ${provider}${
            authDeps.length > 0 ? ` (${authDeps.join(', ')})` : ''
          }.\n• Key files verified: ${authFiles.slice(0, 6).join(', ') || 'None in tree'}.`;
          inference =
            'Auth modules and middleware guard protected endpoints and validate sessions on incoming requests.';
          unknown =
            'Provider dashboard settings (token lifetime, redirect allowlists) live outside static code.';
        }
        authFiles.slice(0, 4).forEach((f) => citations.push({ path: f, label: f, type: 'File' }));
      } else {
        fact = `No authentication libraries or auth handlers were verified in the analyzed repository (${parsedScopeStr}).`;
        unknown = 'Authentication may be handled by an external gateway or reside in unparsed files.';
        confidence = 'Low';
      }
      break;
    }

    case 'DEPENDENCY': {
      const deps = context.dependencies;
      if (deps.length > 0) {
        const categories = categorizeDependencies(deps);
        const lines: string[] = [];
        if (categories.framework.length > 0) lines.push(`• Framework & UI: ${categories.framework.join(', ')}`);
        if (categories.database.length > 0) lines.push(`• Database & Data: ${categories.database.join(', ')}`);
        if (categories.auth.length > 0) lines.push(`• Auth & Security: ${categories.auth.join(', ')}`);
        if (categories.uiAndStyling.length > 0) lines.push(`• Styling & UI Utils: ${categories.uiAndStyling.join(', ')}`);
        if (categories.tooling.length > 0) lines.push(`• Tooling & Testing: ${categories.tooling.slice(0, 6).join(', ')}`);
        if (categories.others.length > 0) lines.push(`• Other Libraries: ${categories.others.slice(0, 8).join(', ')}`);

        const declaredCount = context.coverage?.dependencies?.declaredDependencies || deps.length;
        const resolvedCount = context.coverage?.dependencies?.resolvedDependencies || 0;
        fact = `This repository declares ${declaredCount} dependency package(s)${
          existingManifest ? ` in ${existingManifest}` : ''
        }:\n${lines.join('\n')}`;
        inference = `${resolvedCount} declared package(s) were matched against parsed source imports (${parsedScopeStr}).`;
        unknown = isMotivationQuery
          ? 'Dependency manifests list installed libraries, though they do not explain why each library was chosen.'
          : 'Dynamically imported or runtime-only dependencies may not appear in static source import scans.';
        if (existingManifest) {
          citations.push({ path: existingManifest, label: existingManifest, type: 'Manifest' });
        }
      } else {
        fact = `No declared dependency packages were found (${parsedScopeStr}).`;
        unknown = 'No recognized dependency manifest (package.json, requirements.txt, go.mod, Cargo.toml) had parsable entries.';
        confidence = 'Low';
      }
      break;
    }

    case 'IMPACT': {
      // Clean target path extraction
      const stripped = trimmed
        .replace(
          /^(?:what\s+breaks\s+if\s+i\s+change|what\s+depends\s+on|blast\s+radius\s+of|impact\s+of|what\s+uses|who\s+uses|what\s+imports|who\s+imports|consumers\s+of)\s+/i,
          ''
        )
        .replace(/[?'"`]/g, '')
        .trim();

      // Match exact file or best matching file in analyzed files/edges
      const matchedFile =
        allFiles.find((f) => f === stripped) ||
        allFiles.find((f) => f.endsWith(`/${stripped}`) || f.toLowerCase().includes(stripped.toLowerCase())) ||
        stripped;

      if (dependencyEdges.length > 0 && matchedFile) {
        const engine = new DependencyGraphEngine(dependencyEdges);
        const blast = engine.calculateBlastRadius(matchedFile, 'interface');
        fact =
          blast.totalAffectedCount === 0
            ? `No analyzed downstream relationships were found for "${matchedFile}" (${parsedScopeStr}).`
            : `Changing "${matchedFile}" has ${blast.blastRating} possible impact: ${blast.directConsumersCount} direct and ${blast.transitiveConsumersCount} indirect dependent file(s) across analyzed project relationships.`;
        inference =
          blast.directConsumers.length > 0
            ? `Direct consumers include: ${blast.directConsumers
                .slice(0, 5)
                .map((c) => `${c.path}:${c.line}`)
                .join(', ')}.`
            : 'This target is currently isolated in parsed import edges.';
        unknown =
          parsedCount < sourceTotal
            ? `Analysis covered ${parsedCount}/${sourceTotal} source files; callers in unparsed files or dynamic runtime calls remain UNKNOWN.`
            : 'Dynamic runtime calls or external consumers cannot be verified from static source alone.';
        blast.directConsumers
          .slice(0, 4)
          .forEach((c) => citations.push({ path: c.path, label: `${c.path}:${c.line}`, type: 'Edge' }));
      } else {
        fact = `No analyzed file-level dependency edges were available to compute impact for "${stripped || 'target'}".`;
        unknown = 'Run a full repository analysis to extract AST dependency edges.';
        confidence = 'Low';
      }
      break;
    }

    case 'HISTORY': {
      const effectiveTotal = Math.max(totalCommitsCount ?? 0, context.timeline.length);
      const sourceEntries =
        historicalCommits && historicalCommits.length > 0
          ? historicalCommits.map((c) => ({
              commitShort: c.shortSha,
              date: new Date(c.committedAt).toISOString().split('T')[0],
              author: { name: c.authorName },
              title: c.message.split('\n')[0],
              explanation: c.message,
            }))
          : context.timeline;

      if (sourceEntries.length > 0 || effectiveTotal > 0) {
        const stop = new Set([
          'when', 'what', 'which', 'commit', 'commits', 'history', 'recent',
          'recently', 'changed', 'change', 'introduced', 'added', 'project', 'this',
          'ago', 'month', 'months', 'from',
        ]);
        const words = q.split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));
        const isNthOrDateQuery =
          /commit\s*#?\d+/.test(q) || /(\d+|six|one|three|two|twelve)\s+month/.test(q);
        const matches =
          historicalCommits && historicalCommits.length > 0
            ? sourceEntries
            : words.length > 0 && !q.includes('changed recently') && !q.includes('recent change')
              ? sourceEntries.filter((c) =>
                  words.some(
                    (w) => c.title.toLowerCase().includes(w) || c.explanation.toLowerCase().includes(w)
                  )
                )
              : sourceEntries.slice(0, 5);

        if (matches.length > 0) {
          fact =
            `Observed in indexed Git history (${effectiveTotal} commit(s) indexed on ${context.project.defaultBranch}):\n` +
            matches
              .slice(0, 5)
              .map((c) => `• ${c.commitShort} (${c.date}) by ${c.author.name}: "${c.title}"`)
              .join('\n');
          inference = `These commits show observed changes across the ${effectiveTotal} indexed commit(s) on branch ${context.project.defaultBranch}.`;
          unknown = isMotivationQuery
            ? 'Commit subjects show what changed; architectural rationale outside commit messages cannot be confirmed.'
            : isNthOrDateQuery
              ? 'Only commit metadata and subjects are indexed here; full line-by-line diffs require fetching individual commits.'
              : 'Older commits not yet ingested (if repository history indexing is incomplete) are not included.';
          matches.slice(0, 4).forEach((c) =>
            citations.push({ path: c.commitShort, label: `Commit ${c.commitShort}`, type: 'Commit' })
          );
        } else {
          fact = `None of the ${effectiveTotal} indexed commits mention "${words.join(' ') || trimmed}".`;
          unknown =
            context.latestAnalysis?.freshness === 'PARTIAL'
              ? 'This commit was not found in the currently indexed history window and full history indexing has not completed yet.'
              : `This query did not match any of the ${effectiveTotal} indexed commits on ${context.project.defaultBranch}.`;
          confidence = 'Medium';
        }
      } else {
        fact = 'No commit history has been indexed for this repository yet.';
        unknown = 'Git commit history is unavailable until repository synchronization runs.';
        confidence = 'Low';
      }
      break;
    }

    case 'DOCUMENTATION': {
      const hasReadme = Boolean(context.coverage?.documentation?.hasReadme || context.summary.hasReadme);
      const docFiles = allFiles.filter(
        (f) => /^readme/i.test(f.split('/').pop() || '') || f.startsWith('docs/') || f.endsWith('.md')
      );
      if (hasReadme || docFiles.length > 0) {
        fact = `Found ${docFiles.length || 1} documentation artifact(s)${
          docFiles.length > 0 ? `: ${docFiles.slice(0, 4).join(', ')}` : ''
        }.`;
        if (context.summary.readmePreview) {
          inference = `README excerpt: ${context.summary.readmePreview.slice(0, 220)}…`;
        }
        unknown = 'External wikis, Notion docs, or issue trackers outside this repository are not visible.';
        docFiles.slice(0, 3).forEach((f) => citations.push({ path: f, label: f, type: 'Documentation' }));
      } else {
        fact = 'No README or Markdown documentation files were detected in this repository.';
        unknown = 'Project documentation was not documented in the analyzed repository files.';
        confidence = 'Medium';
      }
      break;
    }

    case 'FRAMEWORK': {
      const framework = context.summary.framework || 'Generic';
      const topLang = context.summary.topLanguage || 'Unknown';
      const techEvidence: string[] = [];
      if (existingManifest) techEvidence.push(existingManifest);
      if (allFilesSet.has('tsconfig.json')) techEvidence.push('tsconfig.json');

      if (isMotivationQuery) {
        const subject = context.summary.framework || context.summary.topLanguage;
        const docWhy = findDocumentationExplanation(
          subject,
          context.summary.readmePreview,
          context.timeline
        );
        fact = `The repository evidence confirms ${framework} (${topLang}) is used${
          existingManifest ? ` based on ${existingManifest}` : ''
        }.`;
        if (docWhy) {
          inference = `Documented context: ${docWhy}`;
        } else {
          unknown = `The repository shows that ${framework} is used, but I couldn't verify why it was chosen.`;
        }
      } else {
        fact = `Primary stack detected: ${framework} (${topLang}).${
          context.dependencies.length > 0
            ? ` Top declared dependencies: ${context.dependencies.slice(0, 6).join(', ')}.`
            : ''
        }`;
        inference =
          context.modules.length > 0
            ? `Top-level workspace areas include ${context.modules.slice(0, 6).map((m) => `/${m}`).join(', ')}.`
            : 'Source files are organized cleanly at the repository root.';
        unknown = 'Hosting configuration and runtime environment variables sit outside repository source code.';
      }
      techEvidence.forEach((f) => citations.push({ path: f, label: f, type: 'Manifest' }));
      break;
    }

    case 'ARCHITECTURE': {
      if (context.modules.length > 0 || context.nodes.length > 0) {
        const moduleList = context.modules.map((m) => `/${m}`).join(', ');
        const realEdges = context.edges.filter((e) => e.source !== 'node-app');
        fact = `This ${context.summary.framework} repository (${parsedScopeStr}) is organized into ${
          context.modules.length
        } top-level area(s): ${moduleList || 'root'}, with ${dependencyEdges.length} verified file-level import edges.`;
        inference =
          realEdges.length > 0
            ? `Observed cross-area connections include: ${realEdges
                .slice(0, 4)
                .map((e) => `${e.source.replace(/^node-/, '/')} -> ${e.target.replace(/^node-/, '/')}`)
                .join(', ')}.`
            : 'Top-level areas represent distinct directories detected in the repository tree.';
        unknown =
          'Runtime service boundaries, external webhooks, or unparsed source modules cannot be inferred beyond analyzed edges.';
        context.nodes
          .filter((n) => n.id !== 'node-app')
          .slice(0, 3)
          .forEach((n) => citations.push({ path: n.id.replace(/^node-/, ''), label: n.name, type: 'Module' }));
      } else {
        fact = `This repository contains ${allFiles.length} root-level files without separate top-level subdirectories.`;
        unknown = 'No modular directory hierarchy was detected.';
      }
      break;
    }

    case 'FILE': {
      const tokens = q.split(/\s+/).filter((w) => w.length > 2);
      const matchedFiles = allFiles.filter((f) =>
        tokens.some((t) => f.toLowerCase().includes(t.replace(/[`'"]/g, '')))
      );
      if (matchedFiles.length > 0) {
        fact = `Matching repository files found:\n${matchedFiles
          .slice(0, 6)
          .map((f) => `• ${f}`)
          .join('\n')}`;
        inference = `Verified directly against the analyzed file tree (${parsedScopeStr}).`;
        unknown = 'Runtime execution frequency cannot be confirmed from static files.';
        matchedFiles.slice(0, 4).forEach((f) => citations.push({ path: f, label: f, type: 'File' }));
      } else {
        fact = `I couldn't verify a matching file in the analyzed repository (${parsedScopeStr}).`;
        unknown = 'The file may not exist in this repository or sits inside an ignored folder like node_modules.';
        confidence = 'Low';
      }
      break;
    }

    case 'GENERAL_PROJECT':
    default: {
      if (isMotivationQuery) {
        // E.g. "Why is Zustand used?" or "Why was Redis chosen?"
        const subjectMatch = q.match(/why\s+(?:is|was|did|are|were)\s+([a-z0-9_.@/-]+)/i);
        const rawSubject = subjectMatch?.[1] || 'this technology';
        const isPresent =
          context.dependencies.some((d) => d.toLowerCase().includes(rawSubject.toLowerCase())) ||
          allFiles.some((f) => f.toLowerCase().includes(rawSubject.toLowerCase()));

        if (isPresent) {
          const docWhy = findDocumentationExplanation(
            rawSubject,
            context.summary.readmePreview,
            context.timeline
          );
          fact = `The repository evidence shows that ${rawSubject} is used.`;
          if (docWhy) {
            inference = `Documented context: ${docWhy}`;
          } else {
            unknown = `The repository evidence shows that ${rawSubject} is used, but I couldn't verify why it was chosen.`;
          }
          if (existingManifest) {
            citations.push({ path: existingManifest, label: existingManifest, type: 'Manifest' });
          }
        } else {
          fact = `I couldn't verify "${rawSubject}" from the analyzed repository (${parsedScopeStr}).`;
          unknown = `No dependency or file reference matching "${rawSubject}" was found.`;
          confidence = 'Low';
        }
        break;
      }

      fact = `Repository "${context.project.name}" uses ${context.summary.framework} (${context.summary.topLanguage}) with ${context.summary.totalFiles} discovered files (${parsedScopeStr}).`;
      inference =
        context.modules.length > 0
          ? `Main workspace directories: ${context.modules.slice(0, 5).map((m) => `/${m}`).join(', ')}.`
          : 'Files are structured at the repository root.';
      unknown =
        'For detailed evidence, ask about dependencies, architecture, authentication, database setup, recent commits, or change impact.';
      if (existingManifest) {
        citations.push({ path: existingManifest, label: existingManifest, type: 'Manifest' });
      }
      break;
    }
  }

  // Append honest staleness / partial coverage notice if snapshot is not current/complete
  const freshness = context.latestAnalysis?.freshness;
  if (freshness === 'STALE') {
    unknown = `${unknown ? `${unknown} ` : ''}Note: Repository has changed since this analysis (${context.latestAnalysis?.commitSha?.slice(0, 7) || 'earlier commit'}).`;
  } else if (freshness === 'SYNC_FAILED') {
    unknown = `${unknown ? `${unknown} ` : ''}Note: The latest sync attempt failed; answering from the last successfully analyzed snapshot (${context.latestAnalysis?.commitSha?.slice(0, 7) || 'HEAD'}).`;
  } else if (freshness === 'UNVERIFIED') {
    unknown = `${unknown ? `${unknown} ` : ''}Note: ${context.latestAnalysis?.freshnessMessage || 'Repository freshness could not be verified against GitHub.'}`;
  } else if (parsedCount < sourceTotal && sourceTotal > 0) {
    unknown = `${unknown ? `${unknown} ` : ''}Partial coverage: ${parsedCount}/${sourceTotal} source files were parsed.`;
  }

  const answer = [
    `**FACT:**\n${fact}`,
    inference ? `**INFERENCE:**\n${inference}` : null,
    unknown ? `**UNKNOWN:**\n${unknown}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    answer,
    fact: fact || null,
    inference: inference || null,
    unknown: unknown || null,
    citations,
    confidence,
    modelUsed: 'MarrowNode-Deterministic-V2',
    cached: false,
    intent,
    analysisSnapshot: {
      analysisId: context.latestAnalysis?.id || null,
      commitSha: context.latestAnalysis?.commitSha || null,
      freshness: freshness || 'UNKNOWN',
    },
  };
}

/**
 * Main Ask Project Query Function — strictly multi-tenant isolated & grounded in consistent snapshot evidence.
 */
export async function askProjectQuestion(params: {
  projectId: string;
  query: string;
}): Promise<AskProjectResult> {
  const { projectId, query } = params;
  await requireAuth();
  const profile = await getOrCreateCurrentProfile();

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error('Query cannot be empty');
  }

  const intent = classifyQueryIntent(trimmedQuery);
  const context = await getProjectWorkstationContext(projectId, { checkFreshnessLive: false, profile });

  const analysisId = context.latestAnalysis?.id || 'initial';
  const commitSha = context.latestAnalysis?.commitSha || 'none';
  const cacheKey = `${profile.id}:${projectId}:${analysisId}:${commitSha}:${intent}:${trimmedQuery.toLowerCase()}`;

  const cachedEntry = queryCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
    return { ...cachedEntry.result, cached: true };
  }

  // Load real file-level dependency edges for the active project (already verified via getProjectWorkstationContext)
  const archEv = await prisma.evidence.findFirst({
    where: { projectId, type: 'architecture' },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const archMeta = (archEv?.metadata as any) || {};
  const dependencyEdges: DependencyEdge[] = Array.isArray(archMeta.dependencyEdges)
    ? archMeta.dependencyEdges
    : [];

  // If HISTORY intent, query across ALL indexed ProjectCommit rows in Neon (no 30-commit limit)
  let historicalCommits: Array<{
    commitSha: string;
    shortSha: string;
    message: string;
    authorName: string;
    committedAt: Date;
    eventType: string;
  }> = [];
  let totalCommitsCount = context.historyTotalCount ?? context.timeline.length;

  if (intent === 'HISTORY') {
    const branch = context.project.defaultBranch || 'main';
    totalCommitsCount = await prisma.projectCommit
      .count({ where: { projectId, branch } })
      .catch(() => totalCommitsCount);

    if (totalCommitsCount > 0) {
      const qLower = trimmedQuery.toLowerCase();
      const nthMatch = qLower.match(/commit\s*#?(\d+)/);
      const monthsMatch = qLower.match(/(\d+|six|one|three|two|twelve)\s+month/);
      const wordMap: Record<string, number> = { one: 1, two: 2, three: 3, six: 6, twelve: 12 };

      if (nthMatch) {
        const nth = Math.max(1, parseInt(nthMatch[1], 10));
        historicalCommits = await prisma.projectCommit.findMany({
          where: { projectId, branch },
          orderBy: { committedAt: 'desc' },
          skip: nth - 1,
          take: 3,
        });
      } else if (monthsMatch) {
        const numMonths = Number(monthsMatch[1]) || wordMap[monthsMatch[1]] || 6;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() - numMonths);
        const startWindow = new Date(targetDate.getTime() - 21 * 24 * 60 * 60 * 1000);
        const endWindow = new Date(targetDate.getTime() + 21 * 24 * 60 * 60 * 1000);
        historicalCommits = await prisma.projectCommit.findMany({
          where: {
            projectId,
            branch,
            committedAt: { gte: startWindow, lte: endWindow },
          },
          orderBy: { committedAt: 'desc' },
          take: 10,
        });
      } else {
        const stopWords = new Set([
          'when', 'what', 'which', 'commit', 'commits', 'history', 'recent',
          'recently', 'changed', 'change', 'introduced', 'added', 'project', 'this',
        ]);
        const keywords = qLower
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stopWords.has(w));

        if (keywords.length > 0 && !qLower.includes('changed recently') && !qLower.includes('recent change')) {
          historicalCommits = await prisma.projectCommit.findMany({
            where: {
              projectId,
              branch,
              OR: keywords.map((kw) => ({ message: { contains: kw, mode: 'insensitive' as const } })),
            },
            orderBy: { committedAt: 'desc' },
            take: 10,
          });
        } else {
          historicalCommits = await prisma.projectCommit.findMany({
            where: { projectId, branch },
            orderBy: { committedAt: 'desc' },
            take: 10,
          });
        }
      }
    }
  }

  const result = synthesizeAskAnswerPure({
    context,
    dependencyEdges,
    query: trimmedQuery,
    historicalCommits: historicalCommits.length > 0 ? historicalCommits : undefined,
    totalCommitsCount,
  });

  console.info(
    `[MarrowNode Ask] projectId=${projectId} analysisId=${analysisId} intent=${intent} citations=${result.citations.length}`
  );

  queryCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}
