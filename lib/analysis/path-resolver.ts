export interface TsConfigOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

export interface ResolvedImportTarget {
  specifier: string;
  isExternal: boolean;
  resolvedPath: string | null;
  externalPackage: string | null;
}

/**
 * Normalizes a relative path string by resolving '.' and '..' segments.
 */
function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(part);
    }
  }

  return stack.join('/');
}

/**
 * Checks potential extensions and index files against the repository file set.
 */
function probeCandidateInFileSet(candidate: string, allFiles: Set<string>): string | null {
  const normalized = normalizePath(candidate);

  // Exact file match
  if (allFiles.has(normalized)) {
    return normalized;
  }

  const extensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
  ];

  for (const ext of extensions) {
    const trial = normalizePath(normalized + ext);
    if (allFiles.has(trial)) {
      return trial;
    }
  }

  return null;
}

/**
 * Safely parses tsconfig.json or jsconfig.json content to extract compilerOptions.
 */
export function parseTsConfig(content: string | null): TsConfigOptions {
  if (!content) return {};

  try {
    // Strip single line comments and trailing commas for tolerant parsing
    const cleaned = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/,\s*([}\]])/g, '$1');

    const parsed = JSON.parse(cleaned);
    const opts = parsed.compilerOptions || {};
    return {
      baseUrl: opts.baseUrl || undefined,
      paths: opts.paths || undefined,
    };
  } catch (_) {
    return {};
  }
}

/**
 * Resolves an import specifier to either an internal repository file path or an external package.
 */
export function resolveImportSpecifier(params: {
  specifier: string;
  importingFilePath: string;
  allRepoFiles: Set<string>;
  tsconfig?: TsConfigOptions;
}): ResolvedImportTarget {
  const { specifier, importingFilePath, allRepoFiles, tsconfig } = params;

  // 1. Relative import (./something or ../something)
  if (specifier.startsWith('.')) {
    const lastSlash = importingFilePath.lastIndexOf('/');
    const dir = lastSlash !== -1 ? importingFilePath.substring(0, lastSlash) : '';
    const rawTarget = dir ? `${dir}/${specifier}` : specifier;

    const matched = probeCandidateInFileSet(rawTarget, allRepoFiles);
    return {
      specifier,
      isExternal: false,
      resolvedPath: matched || normalizePath(rawTarget),
      externalPackage: null,
    };
  }

  // 2. Path Aliases from tsconfig (e.g., @/* or ~/*)
  if (tsconfig?.paths) {
    for (const [pattern, targets] of Object.entries(tsconfig.paths)) {
      const prefix = pattern.replace(/\*$/, '');
      if (specifier.startsWith(prefix)) {
        const remainder = specifier.substring(prefix.length);
        for (const targetPattern of targets) {
          const targetPrefix = targetPattern.replace(/\*$/, '');
          const candidate = (tsconfig.baseUrl ? `${tsconfig.baseUrl}/` : '') + targetPrefix + remainder;
          const matched = probeCandidateInFileSet(candidate, allRepoFiles);
          if (matched) {
            return {
              specifier,
              isExternal: false,
              resolvedPath: matched,
              externalPackage: null,
            };
          }
        }
      }
    }
  }

  // 3. Common convention alias: @/ -> root or src/
  if (specifier.startsWith('@/')) {
    const remainder = specifier.substring(2);
    // Try candidate directly from root
    let matched = probeCandidateInFileSet(remainder, allRepoFiles);
    if (!matched) {
      // Try src/ prefix
      matched = probeCandidateInFileSet(`src/${remainder}`, allRepoFiles);
    }

    return {
      specifier,
      isExternal: false,
      resolvedPath: matched || normalizePath(remainder),
      externalPackage: null,
    };
  }

  // 4. Common convention alias: ~/ -> root or src/
  if (specifier.startsWith('~/')) {
    const remainder = specifier.substring(2);
    let matched = probeCandidateInFileSet(remainder, allRepoFiles);
    if (!matched) {
      matched = probeCandidateInFileSet(`src/${remainder}`, allRepoFiles);
    }

    return {
      specifier,
      isExternal: false,
      resolvedPath: matched || normalizePath(remainder),
      externalPackage: null,
    };
  }

  // 5. External package (npm / standard library / pip / crate)
  let pkgName = specifier;
  if (specifier.startsWith('@')) {
    // Scoped package e.g. @supabase/ssr or @prisma/client
    const parts = specifier.split('/');
    pkgName = parts.slice(0, 2).join('/');
  } else {
    // Standard package e.g. react or lodash/get
    pkgName = specifier.split('/')[0];
  }

  return {
    specifier,
    isExternal: true,
    resolvedPath: null,
    externalPackage: pkgName,
  };
}

