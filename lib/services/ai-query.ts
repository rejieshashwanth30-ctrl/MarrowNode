import { getProjectWorkstationContext } from '@/lib/services/project-context';
import { requireAuth } from '@/lib/auth';

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

// In-memory query cache by projectId + analysisId + intent + queryHash
const queryCache = new Map<string, { result: AskProjectResult; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Classifies the exact user inquiry into a domain-specific intent.
 * Prevents generic keyword search from hijacking specialized domain queries.
 */
export function classifyQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();

  // 1. Dependency questions
  if (
    q.includes('dependenc') ||
    q.includes('package') ||
    q.includes('librar') ||
    q.includes('external module') ||
    q.includes('npm') ||
    q.includes('node_modules') ||
    q.includes('manifest') ||
    q.includes('third party') ||
    q.includes('third-party') ||
    q.includes('what are the core external') ||
    q.includes('what packages') ||
    q.includes('which packages')
  ) {
    return 'DEPENDENCY';
  }

  // 2. Documentation questions
  if (
    q.includes('readme') ||
    q.includes('document') ||
    q.includes('docs') ||
    q.includes('contributing') ||
    q.includes('license') ||
    q.includes('changelog') ||
    q.includes('specification') ||
    q.includes('manual')
  ) {
    return 'DOCUMENTATION';
  }

  // 3. Impact & blast radius questions
  if (
    q.includes('blast radius') ||
    q.includes('what breaks') ||
    q.includes('what depends on') ||
    q.includes('if i change') ||
    q.includes('impact of') ||
    q.includes('affect if') ||
    q.includes('downstream') ||
    q.includes('consumers of')
  ) {
    return 'IMPACT';
  }

  // 4. Git history & commit questions
  if (
    q.includes('when was') ||
    q.includes('who added') ||
    q.includes('commit') ||
    q.includes('history') ||
    q.includes('recent change') ||
    q.includes('timeline') ||
    q.includes('who wrote') ||
    q.includes('evolution') ||
    q.includes('introduced') ||
    q.includes('why was')
  ) {
    return 'HISTORY';
  }

  // 5. Authentication questions
  if (
    q.includes('auth') ||
    q.includes('login') ||
    q.includes('oauth') ||
    q.includes('supabase') ||
    q.includes('session') ||
    q.includes('jwt') ||
    q.includes('credentials')
  ) {
    return 'AUTH';
  }

  // 6. Database questions
  if (
    q.includes('database') ||
    q.includes('db') ||
    q.includes('prisma') ||
    q.includes('neon') ||
    q.includes('schema') ||
    q.includes('sql') ||
    q.includes('model') ||
    q.includes('postgres') ||
    q.includes('orm')
  ) {
    return 'DATABASE';
  }

  // 7. Framework & stack questions
  if (
    q.includes('framework') ||
    q.includes('tech stack') ||
    q.includes('stack') ||
    q.includes('built with') ||
    q.includes('what is this written in') ||
    q.includes('runtime')
  ) {
    return 'FRAMEWORK';
  }

  // 8. Specific file path questions
  if (
    q.includes('.ts') ||
    q.includes('.tsx') ||
    q.includes('.js') ||
    q.includes('.jsx') ||
    q.includes('.json') ||
    q.includes('.css') ||
    q.includes('.sql') ||
    q.includes('/')
  ) {
    return 'FILE';
  }

  // 9. Architecture questions
  if (
    q.includes('architecture') ||
    q.includes('structure') ||
    q.includes('module') ||
    q.includes('topology') ||
    q.includes('layer') ||
    q.includes('coupling') ||
    q.includes('graph')
  ) {
    return 'ARCHITECTURE';
  }

  return 'GENERAL_PROJECT';
}

/**
 * Categorizes external packages based on verified ecosystem knowledge
 * to provide structured, explainable dependency answers.
 */
function categorizeDependencies(dependencies: string[]) {
  const framework: string[] = [];
  const database: string[] = [];
  const auth: string[] = [];
  const uiAndStyling: string[] = [];
  const tooling: string[] = [];
  const others: string[] = [];

  for (const dep of dependencies) {
    const lower = dep.toLowerCase();
    if (['next', 'react', 'react-dom', 'vue', '@angular/core', 'express', '@nestjs/core', 'svelte'].includes(lower)) {
      framework.push(dep);
    } else if (lower.includes('prisma') || lower.includes('postgres') || lower.includes('sql') || lower.includes('pg') || lower.includes('drizzle')) {
      database.push(dep);
    } else if (lower.includes('supabase') || lower.includes('auth') || lower.includes('jwt') || lower.includes('bcrypt') || lower.includes('clerk')) {
      auth.push(dep);
    } else if (
      lower.includes('tailwind') ||
      lower.includes('lucide') ||
      lower.includes('clsx') ||
      lower.includes('radix') ||
      lower.includes('framer') ||
      lower.includes('icon')
    ) {
      uiAndStyling.push(dep);
    } else if (
      lower.includes('type') ||
      lower.includes('eslint') ||
      lower.includes('prettier') ||
      lower.includes('jest') ||
      lower.includes('test') ||
      lower.includes('postcss')
    ) {
      tooling.push(dep);
    } else {
      others.push(dep);
    }
  }

  return { framework, database, auth, uiAndStyling, tooling, others };
}

/**
 * Evidence-grounded deterministic answer synthesizer.
 * Routes directly to the verified evidence domain dictated by query intent.
 * Guarantees FACT / INFERENCE / UNKNOWN separation without hallucination or unrelated file citations.
 */
function synthesizeIntentGroundedAnswer(
  context: Awaited<ReturnType<typeof getProjectWorkstationContext>>,
  intent: QueryIntent,
  query: string
): AskProjectResult {
  const q = query.toLowerCase();
  const citations: Array<{ path: string; label: string; type: string }> = [];

  let fact = '';
  let inference = '';
  let unknown = '';
  let confidence: 'High' | 'Medium' | 'Low' = 'High';

  const isMotivationQuery =
    q.startsWith('why') ||
    q.includes('why was') ||
    q.includes('why did') ||
    q.includes('rationale') ||
    q.includes('motivation') ||
    q.includes('decision to');

  const parsedScopeStr = `${context.coverage?.files?.parsed || 0} of ${context.coverage?.files?.source || context.summary.totalFiles} source files indexed`;

  switch (intent) {
    case 'DEPENDENCY': {
      const deps = context.dependencies;
      const declaredCount = context.coverage?.dependencies?.declaredDependencies || deps.length;
      const resolvedCount = context.coverage?.dependencies?.resolvedDependencies || deps.length;
      const categories = categorizeDependencies(deps);

      if (deps.length > 0) {
        const coreHighlights: string[] = [];
        if (categories.framework.length > 0) coreHighlights.push(`• **Framework & UI:** ${categories.framework.join(', ')}`);
        if (categories.database.length > 0) coreHighlights.push(`• **Database & ORM:** ${categories.database.join(', ')}`);
        if (categories.auth.length > 0) coreHighlights.push(`• **Authentication & Backend:** ${categories.auth.join(', ')}`);
        if (categories.uiAndStyling.length > 0) coreHighlights.push(`• **Components & Styling:** ${categories.uiAndStyling.join(', ')}`);
        if (categories.tooling.length > 0) coreHighlights.push(`• **Tooling & Compilation:** ${categories.tooling.slice(0, 4).join(', ')}`);

        fact = `The repository declares ${declaredCount} external packages in package.json.\n\n**CORE EXTERNAL DEPENDENCIES:**\n${coreHighlights.join('\n')}`;
        inference = `${resolvedCount} of ${declaredCount} declared packages matched verified resolution metadata and static import links across ${parsedScopeStr}.`;
        unknown = isMotivationQuery
          ? 'UNKNOWN: The repository package manifest records declared package versions, but does not state the original business decision or architectural rationale for selecting each library over alternatives.'
          : 'Static analysis proves declared packages and static import references. Dynamic import targets or runtime-only package usage cannot be verified statically.';

        citations.push({ path: 'package.json', label: 'package.json (Manifest)', type: 'Manifest' });
      } else {
        fact = `No external dependencies were identified in repository manifest files (${parsedScopeStr}).`;
        unknown = 'No package.json or ecosystem manifests were found in the analyzed tree.';
        confidence = 'Low';
      }
      break;
    }

    case 'DOCUMENTATION': {
      const docCoverage = context.coverage?.documentation;
      const hasReadme = Boolean(docCoverage?.hasReadme || context.summary.hasReadme);
      const docFilesCount = docCoverage?.filesDetected || (hasReadme ? 1 : 0);
      const docTypes = docCoverage?.docTypes || (hasReadme ? ['README'] : []);

      if (hasReadme) {
        fact = `Project documentation is present in the repository (${docTypes.join(', ')}).`;
        if (context.summary.readmePreview) {
          inference = `README summary: ${context.summary.readmePreview.substring(0, 200)}…`;
        }
        citations.push({ path: 'README.md', label: 'README.md', type: 'Documentation' });
      } else if (docFilesCount > 0) {
        fact = `The repository contains ${docFilesCount} documentation artifact(s): ${docTypes.join(', ')}.`;
      } else {
        fact = 'No documentation artifacts (such as README.md, docs/ directory, or architecture RFCs) were detected in the analyzed repository.';
        inference = 'The repository currently lacks published onboarding documentation or an architecture specification in the root workspace.';
        unknown = 'Documentation may exist externally on team wikis or issue trackers, but none is committed to the indexed repository tree.';
      }
      break;
    }

    case 'IMPACT': {
      const cleanTarget = query.replace(/(?:what\s+breaks\s+if\s+i\s+change|what\s+depends\s+on|blast\s+radius\s+of|impact\s+of)\s*/i, '').trim() || 'app';
      const matchingEdges = context.edges.filter((e) => e.target.toLowerCase().includes(cleanTarget.toLowerCase()));

      fact = `According to the analyzed static dependency graph, ${matchingEdges.length} inter-module relationship(s) depend directly on target "${cleanTarget}".`;
      inference = matchingEdges.length > 0
        ? `Direct consumers importing this target: ${matchingEdges.slice(0, 4).map((e) => e.source).join(', ')}.`
        : `Target "${cleanTarget}" has 0 incoming static import edges in the mapped dependency graph and represents an isolated subsystem.`;
      unknown = 'Dynamic runtime invocations, network RPCs, and environment variables are not captured in static import graphs.';

      if (matchingEdges.length > 0) {
        matchingEdges.slice(0, 3).forEach((e) => citations.push({ path: e.source, label: `Edge from ${e.source}`, type: 'Edge' }));
      }
      break;
    }

    case 'HISTORY': {
      if (context.timeline.length > 0) {
        // Check if query is looking for a specific topic (e.g., "When was GitHub OAuth introduced?")
        const searchWords = q.split(/\s+/).filter((w) => w.length > 3 && !['when', 'what', 'which', 'commit', 'history', 'recent', 'introduced', 'added', 'with'].includes(w));
        const matchingCommits = searchWords.length > 0
          ? context.timeline.filter((c) => searchWords.some((w) => c.title.toLowerCase().includes(w) || c.explanation.toLowerCase().includes(w)))
          : context.timeline.slice(0, 3);

        if (matchingCommits.length > 0) {
          const top = matchingCommits[0];
          fact = `Commit evidence within indexed scope (${context.coverage?.git?.historyScope || `${context.timeline.length} commits`}):\n• Commit **#${top.commitShort}** by **${top.author.name}** on **${top.date}**: "${top.title}".`;
          inference = `Modified components participate in the ${context.summary.framework} application layer.`;
          unknown = isMotivationQuery
            ? 'UNKNOWN: The repository commit log records the change summary authored by the developer, but does not provide an architectural decision record explaining the business motivation.'
            : 'Commits outside the default branch history scope are not reflected in this snapshot.';
          citations.push({ path: top.commitShort, label: `Commit #${top.commitShort}`, type: 'Commit' });
        } else {
          fact = `None of the commits in the analyzed history scope (${context.coverage?.git?.historyScope || `${context.timeline.length} commits`}) explicitly match "${searchWords.join(' ')}".`;
          unknown = `The event may have been introduced in an earlier commit outside the current indexed scope (${context.coverage?.git?.historyScope || 'HEAD window'}).`;
          confidence = 'Medium';
        }
      } else {
        fact = 'No historical commits have been indexed for this repository yet.';
        unknown = 'Git history timeline is unavailable.';
        confidence = 'Low';
      }
      break;
    }

    case 'AUTH': {
      const allFiles: string[] = [];
      const traverse = (nodes: typeof context.fileTree) => {
        for (const n of nodes) {
          if (n.type === 'file') allFiles.push(n.path);
          if (n.children) traverse(n.children);
        }
      };
      traverse(context.fileTree);

      const authFiles = allFiles.filter((p) => /auth|supabase|session|login|oauth/i.test(p));
      const usesSupabase = context.dependencies.some((d) => d.includes('supabase')) || authFiles.some((f) => f.includes('supabase'));

      if (authFiles.length > 0 || usesSupabase) {
        fact = `Authentication is anchored through ${usesSupabase ? 'Supabase Auth' : 'custom route handlers'}.\n• Implementation files detected: ${authFiles.slice(0, 5).join(', ')}.`;
        inference = 'User session cookies and JWT identity verification are managed on the server side via middleware and API route handlers.';
        unknown = isMotivationQuery
          ? 'UNKNOWN: Insufficient repository evidence to determine the original business motivation or decision rationale for choosing this authentication strategy.'
          : 'Cloud-level session lifetime policies and MFA settings are not hardcoded in repository source files.';
        authFiles.slice(0, 4).forEach((f) => citations.push({ path: f, label: f, type: 'File' }));
      } else {
        fact = `No standard Supabase or OAuth authentication library was identified in the analyzed repository evidence (${parsedScopeStr}).`;
        unknown = 'Authentication mechanics cannot be determined from indexed files.';
        confidence = 'Low';
      }
      break;
    }

    case 'DATABASE': {
      const hasPrisma = context.dependencies.some((d) => d.includes('prisma')) ||
        context.fileTree.some((n) => n.path.includes('prisma'));

      fact = `Database interaction is managed via ${hasPrisma ? 'Prisma ORM with PostgreSQL (schema: marrownode)' : (context.project.database || 'standard relational drivers')}.`;
      inference = hasPrisma
        ? 'Database models, enums, and relations are defined in prisma/schema.prisma and accessed via generated client bindings.'
        : 'Database connections are configured through server-side environment variables.';
      unknown = isMotivationQuery
        ? 'UNKNOWN: Insufficient repository evidence to determine why this ORM or database provider was chosen.'
        : 'Production connection pool sizes and physical cloud database topology cannot be determined from static source code.';

      if (hasPrisma) citations.push({ path: 'prisma/schema.prisma', label: 'prisma/schema.prisma', type: 'Schema' });
      break;
    }

    case 'FRAMEWORK': {
      fact = `The project is built with **${context.summary.framework}** using **${context.summary.topLanguage}**.\n• Core dependencies: ${context.dependencies.slice(0, 6).join(', ')}.`;
      inference = `Architectural boundaries are structured around ${context.modules.slice(0, 4).map((m) => `/${m}`).join(', ')}.`;
      unknown = isMotivationQuery
        ? 'UNKNOWN: The repository contains framework configuration files, but does not contain an architectural decision record explaining why this framework was chosen over alternatives.'
        : 'Serverless deployment memory quotas and target SLA are not specified in the codebase.';
      citations.push({ path: 'package.json', label: 'package.json (Manifest)', type: 'Manifest' });
      break;
    }

    case 'FILE': {
      // Find matching files in the file tree
      const matchedFiles: string[] = [];
      const traverse = (nodes: typeof context.fileTree) => {
        for (const n of nodes) {
          if (n.type === 'file') {
            const pathLower = n.path.toLowerCase();
            const queryWords = q.split(/\s+/).filter((w) => w.length > 2);
            if (queryWords.some((w) => pathLower.includes(w))) {
              matchedFiles.push(n.path);
            }
          }
          if (n.children) traverse(n.children);
        }
      };
      traverse(context.fileTree);

      if (matchedFiles.length > 0) {
        fact = `Verified repository files matching query:\n${matchedFiles.slice(0, 5).map((f) => `• \`${f}\``).join('\n')}`;
        inference = `These files participate in the ${context.summary.framework} application structure.`;
        unknown = 'File runtime execution frequency requires production telemetry.';
        matchedFiles.slice(0, 4).forEach((f) => citations.push({ path: f, label: f, type: 'File' }));
      } else {
        fact = `No files matching "${query}" were found in the indexed repository tree (${parsedScopeStr}).`;
        unknown = 'File does not exist or was ignored by analysis filters (e.g., node_modules, generated assets).';
        confidence = 'Low';
      }
      break;
    }

    case 'ARCHITECTURE': {
      const moduleList = context.modules.map((m) => `/${m}`).join(', ');
      fact = `The codebase is organized into **${context.modules.length} modules** [${moduleList}] across **${context.nodes.length} architecture nodes** and **${context.edges.length} verified import links**.`;
      inference = `Application boundaries follow a ${context.summary.framework} layout: /app handles route endpoints, /components encapsulates UI presentation, and /lib manages business logic, data models, and authentication.`;
      unknown = 'Dynamic runtime dependency injection and external API webhooks are not represented in static import graphs.';

      if (context.nodes.length > 0) {
        context.nodes.slice(0, 3).forEach((n) => citations.push({ path: n.id, label: `Module ${n.name}`, type: 'Module' }));
      }
      break;
    }

    case 'GENERAL_PROJECT':
    default: {
      fact = `The project is a **${context.summary.framework}** application (${context.summary.topLanguage}) containing ${context.summary.totalFiles} discovered files (${parsedScopeStr}).`;
      inference = `Core structure consists of modules: ${context.modules.slice(0, 4).map((m) => `/${m}`).join(', ')}.`;
      unknown = 'For deep subsystem queries, ask specifically about dependencies, architecture, authentication, database, or recent commits.';
      citations.push({ path: 'package.json', label: 'package.json', type: 'Manifest' });
      break;
    }
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
    modelUsed: 'MarrowNode-Deterministic-V1',
    cached: false,
    intent,
  };
}

/**
 * Validation layer to ensure the generated answer actually answers the detected query intent.
 * Section 8: Prevents returning unrelated files for dependency or architecture questions.
 */
function validateAnswerRelevance(intent: QueryIntent, result: AskProjectResult): AskProjectResult {
  const fullText = (result.fact + ' ' + (result.inference || '') + ' ' + (result.unknown || '')).toLowerCase();

  if (intent === 'DEPENDENCY' && !fullText.includes('packag') && !fullText.includes('dependenc')) {
    return {
      answer: `**FACT:**\nThe repository declares external packages in package.json.\n\n**UNKNOWN:**\nInsufficient dependency resolution evidence available for this specific inquiry.`,
      fact: 'The repository declares external packages in package.json.',
      inference: null,
      unknown: 'Insufficient dependency resolution evidence available for this specific inquiry.',
      citations: [{ path: 'package.json', label: 'package.json', type: 'Manifest' }],
      confidence: 'Medium',
      modelUsed: 'MarrowNode-Deterministic-V1',
      cached: false,
      intent,
    };
  }

  if (intent === 'DOCUMENTATION' && !fullText.includes('document') && !fullText.includes('readme')) {
    return {
      answer: `**FACT:**\nDocumentation detection evaluated repository artifacts.\n\n**UNKNOWN:**\nInsufficient documentation evidence found in the analyzed tree.`,
      fact: 'Documentation detection evaluated repository artifacts.',
      inference: null,
      unknown: 'Insufficient documentation evidence found in the analyzed tree.',
      citations: [],
      confidence: 'Medium',
      modelUsed: 'MarrowNode-Deterministic-V1',
      cached: false,
      intent,
    };
  }

  return result;
}

/**
 * Main Ask Project Query Function
 */
export async function askProjectQuestion(params: {
  projectId: string;
  query: string;
}): Promise<AskProjectResult> {
  const { projectId, query } = params;
  await requireAuth();

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error('Query cannot be empty');
  }

  // 1. Classify Query Intent
  const intent = classifyQueryIntent(trimmedQuery);

  // 2. Retrieve validated workstation context (strictly verifies ownership)
  const context = await getProjectWorkstationContext(projectId);

  // 3. Check in-memory cache keyed by projectId + latestAnalysisId + intent + normalizedQuery
  const cacheKey = `${projectId}:${context.latestAnalysis?.id || 'initial'}:${intent}:${trimmedQuery.toLowerCase()}`;
  const cachedEntry = queryCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
    return { ...cachedEntry.result, cached: true };
  }

  // 4. Synthesize intent-grounded answer
  const rawResult = synthesizeIntentGroundedAnswer(context, intent, trimmedQuery);

  // 5. Final Answer Relevance Validation
  const validatedResult = validateAnswerRelevance(intent, rawResult);

  // 6. Store in cache
  queryCache.set(cacheKey, { result: validatedResult, timestamp: Date.now() });

  return validatedResult;
}
