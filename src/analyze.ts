import { Identifier, Node, SyntaxKind } from "ts-morph";
import type { CallSite, HookStatus } from "./types.js";

export interface UsageAnalysis {
  status: HookStatus;
  callSites: CallSite[];
  usedClassNames: Set<string>;
}

/**
 * Given one or more identifiers that refer to a styles hook (e.g. `useStyles`
 * itself for a named export, or every file's own local name for a default
 * export), finds every place the hook is *called* anywhere in the project
 * (cross-file, cross-package), figures out what local name the returned
 * `classes` object got bound to at each call site, and unions up every
 * class key that's actually accessed off of it — wherever that access
 * happens to live.
 */
export function analyzeHookUsage(hookRefRoots: Identifier[]): UsageAnalysis {
  const callSites: CallSite[] = [];
  const usedClassNames = new Set<string>();
  let sawDynamicAccess = false;
  let sawWholeObjectForwarding = false;

  // For a bare `export default`, every importing file's default-import
  // identifier resolves back to the SAME underlying export symbol — so
  // ts-morph's findReferencesAsNodes() on any ONE of them also surfaces
  // every OTHER file's default-import call site. With multiple roots that
  // means the same call expression gets visited more than once; dedupe by
  // its position so it's only counted/analyzed a single time.
  const seenCallSites = new Set<string>();

  for (const hookNameNode of hookRefRoots) {
    const refs = hookNameNode.findReferencesAsNodes();

    for (const ref of refs) {
      const parent = ref.getParent();
      if (!parent || !Node.isCallExpression(parent)) continue;
      if (parent.getExpression() !== ref) continue; // must be the callee, not e.g. a type reference

      const callSiteKey = `${parent.getSourceFile().getFilePath()}:${parent.getStart()}`;
      if (seenCallSites.has(callSiteKey)) continue;
      seenCallSites.add(callSiteKey);

      const sourceFile = parent.getSourceFile();
      callSites.push({
        filePath: sourceFile.getFilePath(),
        line: parent.getStartLineNumber(),
      });

      const classesIdentifier = resolveClassesIdentifier(parent);
      if (classesIdentifier === "no-classes-destructured") {
        continue; // legitimately uses none of the classes at this call site
      }
      if (!classesIdentifier) {
        // e.g. useStyles() called inline without being bound to a variable —
        // we can't trace what happens to the result.
        sawWholeObjectForwarding = true;
        continue;
      }

      const usage = traceClassesIdentifier(classesIdentifier);
      if (usage.dynamic) sawDynamicAccess = true;
      if (usage.forwardedWhole) sawWholeObjectForwarding = true;
      for (const name of usage.used) usedClassNames.add(name);
    }
  }

  let status: HookStatus;
  if (callSites.length === 0) {
    status = "no-call-sites";
  } else if (sawWholeObjectForwarding) {
    status = "skipped-spread";
  } else if (sawDynamicAccess) {
    status = "skipped-dynamic";
  } else {
    status = "analyzed";
  }

  return { status, callSites, usedClassNames };
}

/**
 * Returns the Identifier that locally holds the `classes` object at this
 * call site, `"no-classes-destructured"` if the call site legitimately never
 * binds `classes` at all (e.g. only destructures `cx`), or `undefined` if we
 * can't figure out the binding well enough to trust it.
 */
function resolveClassesIdentifier(
  call: Node,
): Identifier | "no-classes-destructured" | undefined {
  const decl = call.getParentIfKind(SyntaxKind.VariableDeclaration);
  if (!decl) return undefined;

  const nameNode = decl.getNameNode();

  // const classes = useStyles();
  if (Node.isIdentifier(nameNode)) {
    return nameNode;
  }

  // const { classes } = useStyles();  /  const { classes: c } = useStyles();
  if (Node.isObjectBindingPattern(nameNode)) {
    for (const element of nameNode.getElements()) {
      const propertyName = element.getPropertyNameNode()?.getText() ?? element.getName();
      if (propertyName === "classes") {
        const local = element.getNameNode();
        if (Node.isIdentifier(local)) return local;
        return undefined; // further destructured (`{ classes: { root } }`) — not supported
      }
    }
    return "no-classes-destructured";
  }

  return undefined;
}

function traceClassesIdentifier(classesIdentifier: Identifier): {
  used: Set<string>;
  dynamic: boolean;
  forwardedWhole: boolean;
} {
  const used = new Set<string>();
  let dynamic = false;
  let forwardedWhole = false;

  // A local variable can only be referenced from within its own file's
  // lexical scope. For shorthand-destructured bindings, ts-morph's
  // reference search sometimes widens to the *property declaration* on the
  // source type (e.g. a shared `{ [K in keyof T]: string }` mapped type
  // used by every call site), which would otherwise leak unrelated
  // call sites' usages into this one. Restrict defensively to the same file.
  const ownFile = classesIdentifier.getSourceFile();
  const refs = classesIdentifier
    .findReferencesAsNodes()
    .filter((ref) => ref.getSourceFile() === ownFile);

  for (const ref of refs) {
    if (ref === classesIdentifier) continue; // skip the declaration itself
    const parent = ref.getParent();
    if (!parent) {
      forwardedWhole = true;
      continue;
    }

    if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === ref) {
      used.add(parent.getName());
      continue;
    }

    if (Node.isElementAccessExpression(parent) && parent.getExpression() === ref) {
      const argExpr = parent.getArgumentExpression();
      if (argExpr && Node.isStringLiteral(argExpr)) {
        used.add(argExpr.getLiteralValue());
      } else {
        dynamic = true;
      }
      continue;
    }

    // Used standalone: spread ({...classes}), passed as a whole argument,
    // forwarded as a prop (<Child classes={classes} />), assigned to
    // another variable, etc. We can't verify a subset, so bail out safely.
    forwardedWhole = true;
  }

  return { used, dynamic, forwardedWhole };
}
