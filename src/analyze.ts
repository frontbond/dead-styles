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
  // The hook's own export gets spread into a DIFFERENT makeStyles()/
  // tss.create() call's styles object elsewhere (`{ ...thisHook }`), rather
  // than being called. That merged, re-wrapped hook can genuinely make any
  // of this hook's classes reachable through a call site we have no way to
  // follow (it's not calling *this* hook at all) — so once we see this, we
  // can't trust a "dead" verdict for any class here, regardless of what the
  // real call sites (if any) show.
  let sawSpreadOfHookItself = false;

  // For a bare `export default`, every importing file's default-import
  // identifier resolves back to the SAME underlying export symbol — so
  // ts-morph's findReferencesAsNodes() on any ONE of them also surfaces
  // every OTHER file's default-import call site. With multiple roots that
  // means the same call expression gets visited more than once; dedupe by
  // its position so it's only counted/analyzed a single time.
  const seenCallSites = new Set<string>();
  // Some codebases re-alias the imported hook before calling it at all
  // (`import styles from "./styles"; const useStyles = styles; ...;
  // useStyles()`). A root that's only ever used to declare a plain-identifier
  // alias has to have ITS calls followed too — so this is a worklist, not a
  // single pass, and each alias identifier is only ever queued once.
  const seenRoots = new Set<string>();
  const queue: Identifier[] = [...hookRefRoots];

  while (queue.length > 0) {
    const hookNameNode = queue.shift()!;
    const rootKey = `${hookNameNode.getSourceFile().getFilePath()}:${hookNameNode.getStart()}`;
    if (seenRoots.has(rootKey)) continue;
    seenRoots.add(rootKey);

    const refs = hookNameNode.findReferencesAsNodes();

    for (const ref of refs) {
      const parent = ref.getParent();
      if (!parent) continue;

      if (Node.isCallExpression(parent) && parent.getExpression() === ref) {
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
        continue;
      }

      // A plain re-alias: `const useStyles = styles;` (NOT destructured,
      // NOT called yet) — follow the new local name too.
      if (
        Node.isVariableDeclaration(parent) &&
        parent.getInitializer() === ref &&
        Node.isIdentifier(parent.getNameNode())
      ) {
        queue.push(parent.getNameNode() as Identifier);
        continue;
      }

      // `{ ...thisHook }` — the hook itself (not its call result) is being
      // spread into some other object literal, most likely a styles object
      // for a brand-new makeStyles()/tss.create() call being assembled
      // elsewhere.
      if (Node.isSpreadAssignment(parent) && parent.getExpression() === ref) {
        sawSpreadOfHookItself = true;
      }
    }
  }

  let status: HookStatus;
  if (sawSpreadOfHookItself) {
    status = "skipped-merged";
  } else if (callSites.length === 0) {
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

  // A local variable can only be referenced from within its own lexical
  // scope. For shorthand-destructured bindings, ts-morph's reference search
  // sometimes widens to the *property declaration* on the source type (e.g.
  // a shared `{ [K in keyof T]: string }` mapped type used by every call
  // site), which would otherwise leak OTHER call sites' usages into this
  // one — including ones in the very same file (e.g. four sibling
  // components in one file, each with their own `const { classes } =
  // useStyles()`). Restrict defensively to the innermost function scope
  // that actually contains this declaration, by text range, rather than
  // trusting the language service's symbol resolution here.
  const scope = getEnclosingScope(classesIdentifier);
  const scopeFile = scope.getSourceFile();
  const scopeStart = scope.getStart();
  const scopeEnd = scope.getEnd();
  // Position offsets are per-file, so a range check alone is meaningless
  // across files — a ref in some OTHER file can easily have a start/end
  // that numerically falls inside this file's scope range. Same-file
  // identity must be checked first.
  const refs = classesIdentifier
    .findReferencesAsNodes()
    .filter(
      (ref) =>
        ref.getSourceFile() === scopeFile &&
        ref.getStart() >= scopeStart &&
        ref.getEnd() <= scopeEnd,
    );

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

/**
 * The nearest enclosing function-like node (component body, hook body,
 * plain function, etc.), or the whole file for a module-scope declaration.
 * Used as a text-range bounding box so a local variable's usages can't leak
 * into a sibling scope that happens to declare a same-named binding.
 */
function getEnclosingScope(node: Node): Node {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isFunctionExpression(current) ||
      Node.isArrowFunction(current) ||
      Node.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.getParent();
  }
  return node.getSourceFile();
}
