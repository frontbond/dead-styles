import {
  CallExpression,
  Identifier,
  Node,
  ObjectLiteralExpression,
  Project,
  SyntaxKind,
  VariableDeclaration,
} from "ts-morph";
import type { DefinedClass, StyleHookCandidate } from "./types.js";

/**
 * Recognizes the two common CSS-in-JS "define a styles hook" conventions:
 *
 *   const useStyles = makeStyles((theme) => ({ root: {...} }));
 *   const useStyles = tss.create({ root: {...} });
 *   const useStyles = tss.withParams<Props>().create((params) => ({ root: {...} }));
 *
 * In every case the variable is bound directly to the factory call's result,
 * and that result IS the hook (calling it later returns the classes).
 */
export function findStyleHookCandidates(project: Project): {
  hookNameNode: Identifier;
  candidate: StyleHookCandidate;
}[] {
  const found: { hookNameNode: Identifier; candidate: StyleHookCandidate }[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isDeclarationFile()) continue;

    sourceFile.forEachDescendant((node) => {
      if (!Node.isVariableDeclaration(node)) return;

      const match = matchFactoryCall(node);
      if (!match) return;

      const nameNode = node.getNameNode();
      if (!Node.isIdentifier(nameNode)) return; // hook name must be a simple identifier

      const stylesObject = resolveStylesObject(match.call);
      if (!stylesObject) return;

      const { definedClasses, hasComputedDefinitionKeys } =
        extractTopLevelKeys(stylesObject);

      if (definedClasses.length === 0 && !hasComputedDefinitionKeys) return;

      found.push({
        hookNameNode: nameNode,
        candidate: {
          hookName: nameNode.getText(),
          filePath: sourceFile.getFilePath(),
          line: nameNode.getStartLineNumber(),
          factory: match.factory,
          definedClasses,
          hasComputedDefinitionKeys,
        },
      });
    });
  }

  return found;
}

function matchFactoryCall(
  decl: VariableDeclaration,
): { call: CallExpression; factory: "makeStyles" | "tss.create" } | undefined {
  const initializer = decl.getInitializer();
  if (!initializer || !Node.isCallExpression(initializer)) return undefined;

  const callee = initializer.getExpression();

  // const useStyles = makeStyles((theme) => ({...}))  — classic MUI v4 / @mui/styles
  if (Node.isIdentifier(callee) && callee.getText() === "makeStyles") {
    return { call: initializer, factory: "makeStyles" };
  }

  // const useStyles = makeStyles(options)((theme, params) => ({...}))
  // — tss-react's curried createMakeStyles() flavor. The styles argument is
  // on the OUTER call (`initializer`); the inner call is just `makeStyles(options)`.
  if (
    Node.isCallExpression(callee) &&
    Node.isIdentifier(callee.getExpression()) &&
    callee.getExpression().getText() === "makeStyles"
  ) {
    return { call: initializer, factory: "makeStyles" };
  }

  // const useStyles = tss.create(...)  /  tss.withParams<...>().create(...)
  if (Node.isPropertyAccessExpression(callee) && callee.getName() === "create") {
    return { call: initializer, factory: "tss.create" };
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
