import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findCssClassDefinitions, findScssClassDefinitions } from "../src/cssLike.js";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const globalScssPath = path.join(fixtureDir, "fixtures/monorepo/global.scss");
const globalCssPath = path.join(fixtureDir, "fixtures/monorepo/global.css");

function tempFile(content: string, ext: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "dead-styles-csslike-"));
  const file = path.join(dir, `mini.${ext}`);
  writeFileSync(file, content);
  return file;
}

describe("findScssClassDefinitions", () => {
  const defs = findScssClassDefinitions(globalScssPath);
  const names = defs.map((d) => d.className);

  it("extracts simple top-level class selectors, including multi-line comma lists", () => {
    expect(names).toContain("scssUsedDirect");
    expect(names).toContain("scssUsedViaClsx");
    expect(names).toContain("scssUsedInObjectKey");
    expect(names).toContain("scssDeadClass2");
    expect(names).toContain("scssDeadClass3");
  });

  it("tags every definition with syntax: 'scss'", () => {
    expect(defs.every((d) => d.syntax === "scss")).toBe(true);
  });

  it("ignores $variables", () => {
    expect(names).not.toContain("primary");
  });

  it("ignores selectors nested inside another rule (SCSS nesting, &:hover)", () => {
    expect(names).not.toContain("scssNestedIgnored");
    expect(names).toContain("scssWrapper");
  });

  it("ignores selectors nested inside an @media block", () => {
    expect(names).not.toContain("scssMediaIgnored");
  });

  it("does not mistake an unquoted url(http://...) for a `//` comment, even on a one-line rule", () => {
    expect(names).toContain("scssOneLinerBgImage");
    expect(names).toContain("scssAfterUrl");
  });

  it("strips genuine `//` line comments before a selector", () => {
    // If the leading `// A simple used class` comment weren't stripped,
    // scssUsedDirect's own buffer would never cleanly match and it would be
    // missing from `names` entirely.
    expect(names).toContain("scssUsedDirect");
  });
});

describe("findCssClassDefinitions", () => {
  const defs = findCssClassDefinitions(globalCssPath);
  const names = defs.map((d) => d.className);

  it("extracts simple top-level class selectors, including multi-line comma lists", () => {
    expect(names).toContain("cssUsedDirect");
    expect(names).toContain("cssDeadClass2");
    expect(names).toContain("cssDeadClass3");
  });

  it("tags every definition with syntax: 'css'", () => {
    expect(defs.every((d) => d.syntax === "css")).toBe(true);
  });

  it("ignores selectors nested inside an @media block", () => {
    expect(names).not.toContain("cssMediaIgnored");
  });

  it("handles an unquoted url(http://...) safely even on a one-line rule", () => {
    expect(names).toContain("cssOneLinerBgImage");
    expect(names).toContain("cssAfterUrl");
  });
});

describe("brace-depth safety (quoted strings, both syntaxes)", () => {
  it("does not let braces/commas inside a quoted string value be mistaken for real rule structure", () => {
    const file = tempFile(
      [
        ".foo {",
        '  content: "a, b { not a real rule }";',
        "}",
        "",
        ".bar {",
        "  color: red;",
        "}",
      ].join("\n"),
      "css",
    );
    const names = findCssClassDefinitions(file).map((d) => d.className);
    expect(names).toEqual(["foo", "bar"]);
  });
});
