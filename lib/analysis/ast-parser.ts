import ts from 'typescript';

export interface ASTImport {
  specifier: string;
  line: number;
  symbols: string[];
  isTypeOnly: boolean;
  kind: 'static' | 'dynamic' | 'require';
}

export interface ASTExport {
  name: string;
  line: number;
  isDefault: boolean;
  isTypeOnly: boolean;
  reExportFrom?: string;
}

export interface ASTSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum';
  line: number;
  isExported: boolean;
}

export interface ParsedSourceFile {
  filePath: string;
  language: string;
  loc: number;
  imports: ASTImport[];
  exports: ASTExport[];
  symbols: ASTSymbol[];
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.ts')) return ts.ScriptKind.TS;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function hasModifier(node: ts.Node, modifierKind: ts.SyntaxKind): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === modifierKind)
  );
}

/**
 * Deterministically parses a TypeScript or JavaScript source file using the official
 * TypeScript compiler API. Extracts exact imports, exports, and declared symbols with 1-based line numbers.
 */
export function parseTypeScriptAST(filePath: string, content: string): ParsedSourceFile {
  const scriptKind = getScriptKind(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind
  );

  const imports: ASTImport[] = [];
  const exports: ASTExport[] = [];
  const symbols: ASTSymbol[] = [];

  const loc = content.split('\n').length;

  function visit(node: ts.Node) {
    // 1. Static Import Declarations (e.g., import { A, B } from './module')
    if (ts.isImportDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
      const isTypeOnly = Boolean(node.importClause?.isTypeOnly);
      const importedSymbols: string[] = [];

      if (node.importClause) {
        if (node.importClause.name) {
          importedSymbols.push(node.importClause.name.text);
        }
        if (node.importClause.namedBindings) {
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            importedSymbols.push(`* as ${node.importClause.namedBindings.name.text}`);
          } else if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const elem of node.importClause.namedBindings.elements) {
              importedSymbols.push(elem.name.text);
            }
          }
        }
      }

      if (specifier) {
        imports.push({
          specifier,
          line,
          symbols: importedSymbols,
          isTypeOnly,
          kind: 'static',
        });
      }
    }

    // 2. Dynamic import() or require()
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';

      if ((isDynamicImport || isRequire) && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          imports.push({
            specifier: firstArg.text,
            line,
            symbols: [],
            isTypeOnly: false,
            kind: isDynamicImport ? 'dynamic' : 'require',
          });
        }
      }
    }

    // 3. Export Declarations (e.g. export { X } from './Y' or export * from './Z')
    if (ts.isExportDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const isTypeOnly = Boolean(node.isTypeOnly);
      const reExportFrom =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : undefined;

      if (node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) {
          for (const elem of node.exportClause.elements) {
            exports.push({
              name: elem.name.text,
              line,
              isDefault: false,
              isTypeOnly,
              reExportFrom,
            });
          }
        } else if (ts.isNamespaceExport(node.exportClause)) {
          exports.push({
            name: `* as ${node.exportClause.name.text}`,
            line,
            isDefault: false,
            isTypeOnly,
            reExportFrom,
          });
        }
      } else if (reExportFrom) {
        // export * from './module'
        exports.push({
          name: '*',
          line,
          isDefault: false,
          isTypeOnly,
          reExportFrom,
        });
      }
    }

    // 4. Export Default Assignments (e.g. export default myFunction)
    if (ts.isExportAssignment(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      exports.push({
        name: 'default',
        line,
        isDefault: true,
        isTypeOnly: false,
      });
    }

    // 5. Declarations (Functions, Classes, Interfaces, Types, Variables, Enums)
    const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
    const isDefaultExport = hasModifier(node, ts.SyntaxKind.DefaultKeyword);

    if (ts.isFunctionDeclaration(node) && node.name) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      symbols.push({
        name: node.name.text,
        kind: 'function',
        line,
        isExported,
      });
      if (isExported) {
        exports.push({
          name: isDefaultExport ? 'default' : node.name.text,
          line,
          isDefault: isDefaultExport,
          isTypeOnly: false,
        });
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      symbols.push({
        name: node.name.text,
        kind: 'class',
        line,
        isExported,
      });
      if (isExported) {
        exports.push({
          name: isDefaultExport ? 'default' : node.name.text,
          line,
          isDefault: isDefaultExport,
          isTypeOnly: false,
        });
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      symbols.push({
        name: node.name.text,
        kind: 'interface',
        line,
        isExported,
      });
      if (isExported) {
        exports.push({
          name: node.name.text,
          line,
          isDefault: false,
          isTypeOnly: true,
        });
      }
    } else if (ts.isTypeAliasDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      symbols.push({
        name: node.name.text,
        kind: 'type',
        line,
        isExported,
      });
      if (isExported) {
        exports.push({
          name: node.name.text,
          line,
          isDefault: false,
          isTypeOnly: true,
        });
      }
    } else if (ts.isEnumDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      symbols.push({
        name: node.name.text,
        kind: 'enum',
        line,
        isExported,
      });
      if (isExported) {
        exports.push({
          name: node.name.text,
          line,
          isDefault: false,
          isTypeOnly: false,
        });
      }
    } else if (ts.isVariableStatement(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          symbols.push({
            name: decl.name.text,
            kind: 'variable',
            line,
            isExported,
          });
          if (isExported) {
            exports.push({
              name: decl.name.text,
              line,
              isDefault: false,
              isTypeOnly: false,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const language = filePath.endsWith('.tsx')
    ? 'TypeScript React'
    : filePath.endsWith('.ts')
    ? 'TypeScript'
    : filePath.endsWith('.jsx')
    ? 'JavaScript React'
    : 'JavaScript';

  return {
    filePath,
    language,
    loc,
    imports,
    exports,
    symbols,
  };
}

/**
 * Deterministically parses non-JS/TS languages (Python, Go, Rust) using line-aware pattern extractors.
 */
export function parseOtherSourceAST(filePath: string, content: string): ParsedSourceFile {
  const lines = content.split('\n');
  const imports: ASTImport[] = [];
  const exports: ASTExport[] = [];
  const symbols: ASTSymbol[] = [];

  const lower = filePath.toLowerCase();
  const isPython = lower.endsWith('.py');
  const isGo = lower.endsWith('.go');
  const isRust = lower.endsWith('.rs');

  const language = isPython ? 'Python' : isGo ? 'Go' : isRust ? 'Rust' : 'Other';

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();

    if (isPython) {
      // from module import something
      const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)$/);
      if (fromMatch) {
        imports.push({
          specifier: fromMatch[1],
          line: lineNum,
          symbols: fromMatch[2].split(',').map((s) => s.trim()),
          isTypeOnly: false,
          kind: 'static',
        });
      } else {
        const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_., ]+)$/);
        if (importMatch) {
          imports.push({
            specifier: importMatch[1].trim(),
            line: lineNum,
            symbols: [],
            isTypeOnly: false,
            kind: 'static',
          });
        }
      }

      // def / class
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
      if (defMatch) {
        symbols.push({
          name: defMatch[1],
          kind: 'function',
          line: lineNum,
          isExported: !defMatch[1].startsWith('_'),
        });
      }
      const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          line: lineNum,
          isExported: !classMatch[1].startsWith('_'),
        });
      }
    } else if (isGo) {
      const goImportMatch = trimmed.match(/^import\s+"([^"]+)"/);
      if (goImportMatch) {
        imports.push({
          specifier: goImportMatch[1],
          line: lineNum,
          symbols: [],
          isTypeOnly: false,
          kind: 'static',
        });
      }

      const goFuncMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
      if (goFuncMatch) {
        const name = goFuncMatch[1];
        const isExported = name.charAt(0) === name.charAt(0).toUpperCase();
        symbols.push({
          name,
          kind: 'function',
          line: lineNum,
          isExported,
        });
        if (isExported) {
          exports.push({ name, line: lineNum, isDefault: false, isTypeOnly: false });
        }
      }
    } else if (isRust) {
      const rustUseMatch = trimmed.match(/^use\s+([^;]+);/);
      if (rustUseMatch) {
        imports.push({
          specifier: rustUseMatch[1],
          line: lineNum,
          symbols: [],
          isTypeOnly: false,
          kind: 'static',
        });
      }

      const rustFnMatch = trimmed.match(/^(?:pub\s+)?fn\s+([a-zA-Z0-9_]+)/);
      if (rustFnMatch) {
        const name = rustFnMatch[1];
        const isExported = trimmed.startsWith('pub');
        symbols.push({
          name,
          kind: 'function',
          line: lineNum,
          isExported,
        });
        if (isExported) {
          exports.push({ name, line: lineNum, isDefault: false, isTypeOnly: false });
        }
      }
    }
  });

  return {
    filePath,
    language,
    loc: lines.length,
    imports,
    exports,
    symbols,
  };
}

/**
 * Universal AST parser dispatcher based on file extension
 */
export function parseSourceFileAST(filePath: string, content: string): ParsedSourceFile {
  const lower = filePath.toLowerCase();
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return parseTypeScriptAST(filePath, content);
  }

  return parseOtherSourceAST(filePath, content);
}

