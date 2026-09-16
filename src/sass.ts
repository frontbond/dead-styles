import { readFileSync } from "node:fs";
import type { GlobalClassDefinition } from "./types.js";

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
export function findSassClassDefinitions(sassFilePath: string): GlobalClassDefinition[] {
  const text = readFileSync(sassFilePath, "utf8");
  const lines = text.split(/\r?\n/);
  const definitions: GlobalClassDefinition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indentation = raw.match(/^[ \t]*/)?.[0].length ?? 0;
    if (indentation !== 0) continue;

    const withoutComment = raw.replace(/\/\/.*$/, "").trim();
    if (!withoutComment || !CLASS_LINE_RE.test(withoutComment)) continue;

    for (const part of withoutComment.split(",")) {
      const className = part.trim().slice(1); // drop the leading "."
      if (className) {
        definitions.push({ className, filePath: sassFilePath, line: i + 1, syntax: "sass" });
      }
    }
  }

  return definitions;
}
