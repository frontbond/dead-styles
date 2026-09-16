import type { SourceFile } from "ts-morph";
import type { GlobalClassDefinition, GlobalClassResult } from "./types.js";

/**
 * Checks every global-stylesheet class definition (from Sass indented
 * syntax, SCSS, or plain CSS — see sass.ts / cssLike.ts) against the
 * literal text of every JS/TS/JSX source file in the project. This is
 * intentionally a plain token scan, not an AST-aware one — a global class
 * can be applied as a bare string (`className="foo"`), through
 * `clsx`/`classnames`/`cx`, as an object key (`{ foo: isActive }`), or
 * inside a template literal, and a single tokenization pass over each
 * file's raw text catches all of those at once, regardless of which
 * stylesheet syntax defined the class.
 *
 * The known blind spot: a class name assembled dynamically at runtime
 * (`'textStyles' + variant`) won't be seen as a literal token anywhere and
 * will be reported as unused even though it may be applied. That's a
 * one-directional risk (false "unused", never a false "dead" for something
 * genuinely applied via a static literal), so it's a safe default — but
 * worth knowing about before trusting a large dead-class list blindly.
 */
export function scanGlobalClassUsage(
  definitions: GlobalClassDefinition[],
  sourceFiles: SourceFile[],
): GlobalClassResult[] {
  const usedTokens = new Set<string>();
  const tokenRe = /[A-Za-z_][\w-]*/g;

  for (const sourceFile of sourceFiles) {
    if (sourceFile.isDeclarationFile()) continue;
    const text = sourceFile.getFullText();
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(text))) {
      usedTokens.add(match[0]);
    }
  }

  return definitions.map((def) => ({ ...def, used: usedTokens.has(def.className) }));
}
