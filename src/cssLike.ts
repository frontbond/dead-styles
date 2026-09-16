import { readFileSync } from "node:fs";
import type { GlobalClassDefinition } from "./types.js";

// A bare, simple class selector: `.foo`. Deliberately narrow, same
// philosophy as the Sass indented-syntax parser — a compound selector
// (`.a.b`), a descendant selector (`.a .b`), a tag/id selector, an
// attribute selector, or anything with SCSS interpolation (`.icon-#{$x}`)
// is a reference at best, never a plain "here's a standalone class" you
// can safely say is unused if never seen. Those are skipped, not guessed.
const SIMPLE_CLASS_RE = /^\.[A-Za-z_-][\w-]*$/;

function countNewlines(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}

function stripComments(text: string, allowLineComments: boolean): string {
  // Block comments: always safe to strip, in both CSS and SCSS. Replace
  // with just the newlines the comment itself contained, so every
  // subsequent line number stays correct.
  let out = text.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(countNewlines(m)));
  if (allowLineComments) {
    // SCSS `//` line comments. Skip anything preceded by `:` so a
    // `url(http://...)` / `url(https://...)` isn't eaten as a comment.
    // Known remaining blind spot: an *unquoted*, protocol-relative
    // `url(//cdn.example.com/...)` has no `:` before its `//` and will
    // still be mis-treated as a comment start — rare in practice, and
    // fixable by quoting the url, which is good practice anyway.
    out = out.replace(/(?<!:)\/\/[^\n]*/g, "");
  }
  return out;
}

function emitDefinitions(
  bufferText: string,
  bufferStart: number,
  fullText: string,
  syntax: "css" | "scss",
  filePath: string,
  out: GlobalClassDefinition[],
): void {
  const trimmed = bufferText.trim();
  if (!trimmed) return;

  const leadingWs = bufferText.length - bufferText.trimStart().length;
  const contentStart = bufferStart + leadingWs;
  const line = countNewlines(fullText.slice(0, contentStart)) + 1;

  for (const part of trimmed.split(",")) {
    const candidate = part.trim();
    if (SIMPLE_CLASS_RE.test(candidate)) {
      out.push({ className: candidate.slice(1), filePath, line, syntax });
    }
  }
}

/**
 * Extracts every top-level simple class selector from a brace-delimited
 * stylesheet (plain CSS or SCSS). "Top-level" here means not nested inside
 * any `{ }` block at all — a selector block directly at brace-depth 0 is a
 * definition, while anything inside another block (SCSS nesting like
 * `&:hover { ... }` or `.foo .bar { ... }`, or an `@media`/`@supports`/
 * `@keyframes`/`@font-face` block) is a reference or an unrelated at-rule,
 * not a standalone class definition, and is ignored — the brace-syntax
 * equivalent of "only unindented lines count" in the Sass indented-syntax
 * parser. `@media`/`@keyframes`/etc. blocks are excluded automatically:
 * their own selector text never starts with `.`, so it never matches
 * `SIMPLE_CLASS_RE` in the first place.
 *
 * Handles multi-line comma-separated selectors (`.foo,\n.bar {`), strips
 * block comments always and `//` line comments for SCSS only (guarding
 * against `url(http://...)`), and ignores braces/semicolons/commas that
 * appear inside quoted strings (e.g. `content: "a, b";`).
 */
function findBraceStyleClassDefinitions(
  filePath: string,
  syntax: "css" | "scss",
): GlobalClassDefinition[] {
  const raw = readFileSync(filePath, "utf8");
  const text = stripComments(raw, syntax === "scss");

  const definitions: GlobalClassDefinition[] = [];
  let depth = 0;
  let buffer = "";
  let bufferStart = 0;
  let inString: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === inString && text[i - 1] !== "\\") inString = null;
      buffer += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      buffer += ch;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        emitDefinitions(buffer, bufferStart, text, syntax, filePath, definitions);
      }
      depth++;
      buffer = "";
      bufferStart = i + 1;
      continue;
    }

    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      buffer = "";
      bufferStart = i + 1;
      continue;
    }

    if (ch === ";" && depth === 0) {
      // A top-level statement that isn't a rule block at all (e.g. an
      // SCSS `$variable: value;`) — discard it rather than letting it leak
      // into the next selector's buffer.
      buffer = "";
      bufferStart = i + 1;
      continue;
    }

    buffer += ch;
  }

  return definitions;
}

export function findCssClassDefinitions(filePath: string): GlobalClassDefinition[] {
  return findBraceStyleClassDefinitions(filePath, "css");
}

export function findScssClassDefinitions(filePath: string): GlobalClassDefinition[] {
  return findBraceStyleClassDefinitions(filePath, "scss");
}
