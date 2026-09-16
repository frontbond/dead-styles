import {
  CallExpression,
  Identifier,
  ImportDeclaration,
  Node,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { DefinedClass, StyleHookCandidate } from "./types.js";

/**
 * Recognizes the common CSS-in-JS "define a styles hook" conventions:
 *
 *   const useStyles = makeStyles((theme) => ({ root: {...} }));
 *   const useStyles = tss.create({ root: {...} });
 *   const useStyles = tss.withParams<Props>().create((params) => ({ root: {...} }));
 *   export default makeStyles()({ root: {...} });   // no local name at all
 *
 * In every case the factory call's result IS the hook (calling it later
 * returns the classes). The last form — a bare `export default` with no
 * intermediate variable — is common with tss-react's `tss-react/mui`
 * makeStyles() and needs special handling: there's no local identifier to
 * search for, so call sites have to be found via every file that default-
 * imports this module (see `findDefaultImportIdentifiers`).
 */
export function findStyleHookCandidates(project: Project): {
  hookNameNode?: Identifier;
  isDefaultExport: boolean;
  candidate: StyleHookCandidate;
}[] {
  const found: {
    hookNameNode?: Identifier;
    isDefaultExport: boolean;
    candidate: StyleHookCandidate;
  }[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isDeclarationFile()) continue;

    sourceFile.forEachDescendant((node) => {
      // Case 1: const useStyles = makeStyles(...) / tss.create(...)
      if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();
        if (!initializer || !Node.isCallExpression(initializer)) return;
        const match = matchFactoryCallExpression(initializer);
        if (!match) return;

        const nameNode = node.getNameNode();
        if (!Node.isIdentifier(nameNode)) return; // hook name must be a simple identifier

        pushCandidate({
          hookNameNode: nameNode,
          isDefaultExport: false,
          displayName: nameNode.getText(),
          line: nameNode.getStartLineNumber(),
          sourceFile,
          match,
        });
        return;
      }

      // Case 2: export default makeStyles()({...})  /  export default tss.create(...)
      if (Node.isExportAssignment(node) && !node.isExportEquals()) {
        const expr = unwrapParens(node.getExpression());
        if (!Node.isCallExpression(expr)) return;
        const match = matchFactoryCallExpression(expr);
        if (!match) return;

        pushCandidate({
          hookNameNode: undefined,
          isDefaultExport: true,
          displayName: `default export of ${sourceFile.getBaseNameWithoutExtension()}`,
          line: node.getStartLineNumber(),
          sourceFile,
          match,
        });
      }
    });
  }

  function pushCandidate(args: {
    hookNameNode: Identifier | undefined;
    isDefaultExport: boolean;
    displayName: string;
    line: number;
    sourceFile: SourceFile;
    match: { call: CallExpression; factory: "makeStyles" | "tss.create" };
  }) {
    const stylesObject = resolveStylesObject(args.match.call);
    if (!stylesObject) return;

    const { definedClasses, hasComputedDefinitionKeys } =
      extractTopLevelKeys(stylesObject);

    if (definedClasses.length === 0 && !hasComputedDefinitionKeys) return;

    found.push({
      hookNameNode: args.hookNameNode,
      isDefaultExport: args.isDefaultExport,
      candidate: {
        hookName: args.displayName,
        filePath: args.sourceFile.getFilePath(),
        line: args.line,
        factory: args.match.factory,
        definedClasses,
        hasComputedDefinitionKeys,
      },
    });
  }

  return found;
}

/**
 * Given every file in the project, finds the local identifier each one
 * binds to when it default-imports `definingFile`. A default export has no
 * single shared symbol the way a named export does — every importing file
 * picks its own local name — so each has to be searched individually.
 */
export function findDefaultImportIdentifiers(
  project: Project,
  definingFile: SourceFile,
): Identifier[] {
  const result: Identifier[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isDeclarationFile()) continue;
    if (sourceFile === definingFile) continue;

    for (const importDecl of sourceFile.getImportDeclarations()) {
      if (!isImportOf(importDecl, definingFile)) continue;
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) result.push(defaultImport);
    }
  }

  return result;
}

function isImportOf(importDecl: ImportDeclaration, definingFile: SourceFile): boolean {
  try {
    return importDecl.getModuleSpecifierSourceFile() === definingFile;
  } catch {
    return false;
  }
}

function matchFactoryCallExpression(
  call: CallExpression,
): { call: CallExpression; factory: "makeStyles" | "tss.create" } | undefined {
  const callee = call.getExpression();

  // makeStyles((theme) => ({...}))  — classic MUI v4 / @mui/styles
  if (Node.isIdentifier(callee) && callee.getText() === "makeStyles") {
    return { call, factory: "makeStyles" };
  }

  // makeStyles(options)((theme, params) => ({...}))  /  makeStyles()({...})
  // — tss-react's curried createMakeStyles()/tss-react/mui flavor. The
  // styles argument is on the OUTER call; the inner call is `makeStyles(options)`.
  if (
    Node.isCallExpression(callee) &&
    Node.isIdentifier(callee.getExpression()) &&
    callee.getExpression().getText() === "makeStyles"
  ) {
    return { call, factory: "makeStyles" };
  }

  // tss.create(...)  /  tss.withParams<...>().create(...)
  if (Node.isPropertyAccessExpression(callee) && callee.getName() === "create") {
    return { call, factory: "tss.create" };
  }

  return undefined;
}

function resolveStylesObject(
  call: CallExpression,
): ObjectLiteralExpression | undefined {
  const arg = call.getArguments()[0];
  if (!arg) return undefined;

  if (Node.isObjectLiteralExpression(arg)) return arg;

  if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
    const body = arg.getBody();
    const unwrapped = unwrapParens(body);
    if (Node.isObjectLiteralExpression(unwrapped)) return unwrapped;
    if (Node.isBlock(body)) {
      const returnStatement = body
        .getStatements()
        .find((s) => Node.isReturnStatement(s));
      if (returnStatement && Node.isReturnStatement(returnStatement)) {
        const expr = returnStatement.getExpression();
        const unwrappedReturn = expr ? unwrapParens(expr) : undefined;
        if (unwrappedReturn && Node.isObjectLiteralExpression(unwrappedReturn)) {
          return unwrappedReturn;
        }
      }
    }
  }

  return undefined;
}

function unwrapParens(node: Node): Node {
  let current = node;
  while (Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function extractTopLevelKeys(obj: ObjectLiteralExpression): {
  definedClasses: DefinedClass[];
  hasComputedDefinitionKeys: boolean;
} {
  const definedClasses: DefinedClass[] = [];
  let hasComputedDefinitionKeys = false;

  for (const prop of obj.getProperties()) {
    if (
      Node.isPropertyAssignment(prop) ||
      Node.isShorthandPropertyAssignment(prop) ||
      Node.isMethodDeclaration(prop)
    ) {
      const nameNode = prop.getNameNode();

      if (nameNode.getKind() === SyntaxKind.ComputedPropertyName) {
        hasComputedDefinitionKeys = true;
        continue;
      }

      let name: string | undefined;
      if (Node.isStringLiteral(nameNode)) {
        name = nameNode.getLiteralValue();
      } else {
        name = nameNode.getText();
      }

      if (name) {
        definedClasses.push({
          name,
          line: nameNode.getStartLineNumber(),
          column: nameNode.getStart() - nameNode.getStartLinePos(),
        });
      }
    } else if (Node.isSpreadAssignment(prop)) {
      // Spreading another styles object in — can't know what keys that adds.
      hasComputedDefinitionKeys = true;
    }
  }

  return { definedClasses, hasComputedDefinitionKeys };
}
