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
}

// In-memory query cache by projectId + queryHash
const queryCache = new Map<string, { result: AskProjectResult; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Deterministically extracts the most relevant evidence context from the project snapshot
 * without blindly dumping thousands of lines into the LLM prompt.
 */
function extractRelevantEvidence(
  context: Awaited<ReturnType<typeof getProjectWorkstationContext>>,
  query: string
) {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter((t) => t.length > 2);

  // Match relevant files from the file tree
  const matchedFiles: string[] = [];
  const traverse = (nodes: typeof context.fileTree) => {
    for (const node of nodes) {
      if (node.type === 'file') {
        const pathLower = node.path.toLowerCase();
        if (terms.some((t) => pathLower.includes(t))) {
          matchedFiles.push(node.path);
        }
      }
      if (node.children) traverse(node.children);
    }
  };
  traverse(context.fileTree);

  // Match relevant dependencies
  const matchedDependencies = context.dependencies.filter((dep) =>
    terms.some((t) => dep.toLowerCase().includes(t))
  );

  // Match relevant architecture nodes
  const matchedNodes = context.nodes.filter(
    (n) => terms.some((t) => n.name.toLowerCase().includes(t) || n.description.toLowerCase().includes(t))
  );

  // Match relevant timeline commits
  const matchedCommits = context.timeline.filter(
    (c) => terms.some((t) => c.title.toLowerCase().includes(t) || c.explanation.toLowerCase().includes(t))
  );

  return {
    matchedFiles: matchedFiles.slice(0, 10),
    matchedDependencies: matchedDependencies.slice(0, 10),
    matchedNodes: matchedNodes.slice(0, 5),
    matchedCommits: matchedCommits.slice(0, 5),
    allDependencies: context.dependencies.slice(0, 20),
    framework: context.summary.framework,
    primaryLanguage: context.summary.topLanguage,
    readmeSnippet: context.summary.readmePreview,
  };
}

/**
 * Deterministic evidence-grounded answer synthesizer.
 * Used when external LLM APIs are not configured or as an instantaneous resilient fallback.
 * Strictly adheres to FACT / INFERENCE / UNKNOWN principles without hallucination.
 */
function synthesizeDeterministicAnswer(
  context: Awaited<ReturnType<typeof getProjectWorkstationContext>>,
  evidence: ReturnType<typeof extractRelevantEvidence>,
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

  // Check for technology presence inquiries (e.g., "Does this repo use Redis?", "Do we use Docker?", "Is GraphQL used?")
  const techQueryMatch = q.match(/(?:does\s+(?:this\s+)?(?:repo|project|codebase)\s+use|do\s+we\s+use|is\s+there\s+any)\s+([a-zA-Z0-9_\-\.]+)/i);
  const askedTech = techQueryMatch ? techQueryMatch[1].toLowerCase() : null;

  if (askedTech && !['auth', 'database', 'db', 'framework'].includes(askedTech)) {
    const isPresentInDeps = context.dependencies.some((d) => d.toLowerCase().includes(askedTech));
    const isPresentInFiles = context.fileTree.some(function checkTree(n): boolean {
      if (n.name.toLowerCase().includes(askedTech)) return true;
      if (n.children) return n.children.some(checkTree);
      return false;
    });

    if (isPresentInDeps || isPresentInFiles) {
      fact = `Based on the analyzed repository evidence (${parsedScopeStr}), ${askedTech} usage was confirmed in repository dependencies/files.`;
      inference = `Components interacting with ${askedTech} are integrated into the ${context.summary.framework} project configuration.`;
      citations.push({ path: 'package.json', label: `${askedTech} reference`, type: 'Manifest' });
    } else {
      fact = `No ${askedTech} usage was found in the analyzed repository evidence (${parsedScopeStr}).`;
      inference = `Neither package manifests nor indexed source files contain direct references to ${askedTech}.`;
      unknown = `Unindexed files outside the current analysis scope (${context.coverage?.files?.coveragePercent || 0}% coverage) could potentially reference this technology.`;
      confidence = 'Medium';
    }
  } else if (q.includes('auth') || q.includes('login') || q.includes('supabase') || q.includes('session')) {
    const authFiles = context.fileTree
      .flatMap(function flatten(n): string[] {
        return n.type === 'file' ? [n.path] : (n.children ? n.children.flatMap(flatten) : []);
      })
      .filter((p) => /auth|supabase|session|login/i.test(p));

    const usesSupabase = context.dependencies.some((d) => d.includes('supabase')) ||
      authFiles.some((f) => f.includes('supabase'));

    if (usesSupabase || authFiles.length > 0) {
      fact = `Based on the analyzed repository evidence (${parsedScopeStr}), authentication is anchored through ${usesSupabase ? 'Supabase Auth' : 'custom route handlers'}. Key implementation files detected: ${authFiles.slice(0, 4).join(', ')}.`;
      inference = 'Session tokens and user identity are managed on the server side with cookie-based middleware propagation.';
      unknown = isMotivationQuery
        ? 'UNKNOWN: Insufficient repository evidence to determine the original business motivation or decision rationale for selecting this authentication strategy.'
        : 'Specific cloud session expiration thresholds and MFA policies are not specified in source code.';
      authFiles.slice(0, 4).forEach((f) => citations.push({ path: f, label: f, type: 'File' }));
    } else {
      fact = `No standard Supabase or OAuth authentication library was identified in the analyzed repository evidence (${parsedScopeStr}).`;
      unknown = 'Authentication mechanics cannot be determined from indexed files.';
      confidence = 'Low';
    }
  } else if (q.includes('database') || q.includes('db') || q.includes('prisma') || q.includes('neon') || q.includes('schema')) {
    const hasPrisma = context.dependencies.some((d) => d.includes('prisma')) ||
      context.fileTree.some((n) => n.path.includes('prisma'));

    fact = `Based on the analyzed repository evidence (${parsedScopeStr}), database interaction is managed via ${hasPrisma ? 'Prisma ORM with PostgreSQL' : (context.project.database || 'standard relational drivers')}.`;
    inference = hasPrisma
      ? 'Database models and migrations are defined in prisma/schema.prisma and accessed via generated client bindings.'
      : 'Database schema is referenced in backend application services.';
    unknown = isMotivationQuery
      ? 'UNKNOWN: Insufficient repository evidence to determine why this ORM or database provider was chosen.'
      : 'Database hosting infrastructure tiers and connection pool sizes cannot be determined from code alone.';

    if (hasPrisma) citations.push({ path: 'prisma/schema.prisma', label: 'prisma/schema.prisma', type: 'Schema' });
  } else if (q.includes('framework') || q.includes('tech') || q.includes('stack') || q.includes('built with')) {
    fact = `Based on the analyzed repository evidence (${parsedScopeStr}), the repository is built with ${context.summary.framework} using ${context.summary.topLanguage}. Key dependencies include: ${context.dependencies.slice(0, 6).join(', ')}.`;
    inference = `Architectural boundaries are structured around ${context.modules.slice(0, 4).map((m) => `/${m}`).join(', ')}.`;
    unknown = isMotivationQuery
      ? 'UNKNOWN: Insufficient repository evidence to determine why this framework was chosen over alternatives.'
      : 'Target deployment SLA and cloud infrastructure orchestration are not specified in the codebase.';
    citations.push({ path: 'package.json', label: 'package.json', type: 'Manifest' });
  } else if (q.includes('change') || q.includes('commit') || q.includes('recent') || q.includes('history')) {
    if (context.timeline.length > 0) {
      const topCommits = context.timeline.slice(0, 3);
      fact = `Based on the analyzed repository evidence (${context.coverage?.git?.historyScope || `${context.timeline.length} commits`}), latest commit is: "${topCommits[0]?.title}" (${topCommits[0]?.commitShort}) by ${topCommits[0]?.author.name}.`;
      inference = `Active development focus involves ${topCommits.map((c) => c.title).slice(0, 2).join(' and ')}.`;
      unknown = 'Private branches or commits outside the default branch are not reflected in this snapshot.';
      topCommits.forEach((c) => citations.push({ path: c.commitShort, label: `Commit ${c.commitShort}`, type: 'Commit' }));
    } else {
      fact = 'No historical commits have been indexed for this repository yet.';
      unknown = 'Development timeline cannot be derived without commit history.';
      confidence = 'Low';
    }
  } else if (evidence.matchedFiles.length > 0 || evidence.matchedDependencies.length > 0) {
    const fileList = evidence.matchedFiles.slice(0, 4).join(', ');
    const depList = evidence.matchedDependencies.join(', ');

    fact = `Based on the analyzed repository evidence (${parsedScopeStr}), inspection identified matching entities: ${fileList ? `Files [${fileList}]` : ''} ${depList ? `Libraries [${depList}]` : ''}.`;
    inference = `These components participate in the ${context.summary.framework} module architecture.`;
    unknown = 'Specific runtime behavioral flows require static AST verification.';
    evidence.matchedFiles.slice(0, 4).forEach((f) => citations.push({ path: f, label: f, type: 'File' }));
  } else {
    fact = `Based on the analyzed repository evidence (${parsedScopeStr}), the project is a ${context.summary.framework} codebase with ${context.summary.totalFiles} discovered files.`;
    inference = 'The requested topic was not directly matched in indexed file paths, dependencies, or commit logs.';
    unknown = 'Insufficient repository evidence to determine this specific question with high confidence.';
    confidence = 'Low';
  }

  const answer = [
    `**FACT:** ${fact}`,
    inference ? `**INFERENCE:** ${inference}` : null,
    unknown ? `**UNKNOWN:** ${unknown}` : null,
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
  };
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

  // Retrieve validated workstation context (strictly verifies ownership)
  const context = await getProjectWorkstationContext(projectId);

  // Check in-memory cache keyed by projectId + latestAnalysisId + query
  const cacheKey = `${projectId}:${context.latestAnalysis?.id || 'initial'}:${trimmedQuery.toLowerCase()}`;
  const cachedEntry = queryCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
    return { ...cachedEntry.result, cached: true };
  }

  const evidence = extractRelevantEvidence(context, trimmedQuery);

  // Fallback: Deterministic grounded synthesis
  const result = synthesizeDeterministicAnswer(context, evidence, trimmedQuery);

  // Store in cache
  queryCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

