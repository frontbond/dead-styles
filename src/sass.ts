import { readFileSync } from "node:fs";
import type { SourceFile } from "ts-morph";

export interface SassClassDefinition {
  className: string;
  filePath: string;
  line: number;
}

export interface SassClassResult extends SassClassDefinition {
  used: boolean;
}

// Matches a top-level (unindented) simple class selector line in Sass's
// indented syntax, optionally several comma-separated: `.foo` or
// `.foo, .bar`. Deliberately narrow — nested selectors (`&.stopped`),
// compound selectors (`.a.b`), tag/id selectors, and anything wrapped in an
// `@media`/`@supports` block all fall outside this and are ignored, since
// none of those are themselves a *definition* of a standalone class.
const CLASS_LINE_RE = /^\.[A-Za-z_-][\w-]*(\s*,\s*\.[A-Za-z_-][\w-]*)*$/;

/**
 * Extracts every top-level class selector defined in a Sass (indented
 * syntax) file — the classes that could, in principle, be applied to an
 * element. Only zero-indentation lines count as definitions; anything
 * indented is nested inside some other rule (a pseudo-class, a modifier
 * selector like `.root-blazing .foo`, etc.) and is a reference, not a
 * definition.
 */
export function findSassClassDefinitions(sassFilePath: string): SassClassDefinition[] {
  const text = readFileSync(sassFilePath, "utf8");
  const lines = text.split(/\r?\n/);
  const definitions: SassClassDefinition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indentation = raw.match(/^[ \t]*/)?.[0].length ?? 0;
    if (indentation !== 0) continue;

    const withoutComment = raw.replace(/\/\/.*$/, "").trim();
    if (!withoutComment || !CLASS_LINE_RE.test(withoutComment)) continue;

    for (const part of withoutComment.split(",")) {
      const className = part.trim().slice(1); // drop the leading "."
      if (className) {
        definitions.push({ className, filePath: sassFilePath, line: i + 1 });
      }
    }
  }

  return definitions;
}

/**
 * Checks every definition against the literal text of every JS/TS/JSX
 * source file in the project. This is intentionally a plain token scan, not
 * an AST-aware one — a global Sass class can be applied as a bare string
 * (`className="foo"`), through `clsx`/`classnames`/`cx`, as an object key
 * (`{ foo: isActive }`), or inside a template literal, and a single
 * tokenization pass over each file's raw text catches all of those at once.
 *
 * The known blind spot: a class name assembled dynamically at runtime
 * (`'textStyles' + variant`) won't be seen as a literal token anywhere and
 * will be reported as unused even though it may be applied. That's a
 * one-directional risk (false "unused", never a false "dead" for something
 * genuinely applied via a static literal), so it's a safe default — but
 * worth knowing about before trusting a large dead-class list blindly.
 */
export function scanSassUsage(
  definitions: SassClassDefinition[],
  sourceFiles: SourceFile[],
): SassClassResult[] {
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
