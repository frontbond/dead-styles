import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { scanGlobalClassUsage } from "../src/globalClassUsage.js";
import { findSassClassDefinitions } from "../src/sass.js";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const globalSassPath = path.join(fixtureDir, "fixtures/monorepo/global.sass");

describe("findSassClassDefinitions", () => {
  it("extracts top-level class selectors, including comma-separated ones on one line", () => {
    const defs = findSassClassDefinitions(globalSassPath);
    const names = defs.map((d) => d.className);
    expect(names).toContain("usedDirect");
    expect(names).toContain("deadClass2");
    expect(names).toContain("deadClass3");
  });

  it("ignores $variables, comments, and nested/modifier selectors", () => {
    const defs = findSassClassDefinitions(globalSassPath);
    const names = defs.map((d) => d.className);
    expect(names).not.toContain("blue90"); // it's a $variable, not a class
    expect(names.some((n) => n.includes("stopped"))).toBe(false); // &.stopped is nested
  });

  it("still captures a wrapper class that itself contains nested overrides (.root-blazing)", () => {
    const defs = findSassClassDefinitions(globalSassPath);
    expect(defs.map((d) => d.className)).toContain("root-blazing");
  });

  it("handles a fresh minimal file with just comma-separated selectors and a trailing comment", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dead-styles-sass-"));
    const file = path.join(dir, "mini.sass");
    writeFileSync(
      file,
      [".a, .b // trailing comment", "  color: red", "", ".c", "  color: blue"].join("\n"),
    );
    const defs = findSassClassDefinitions(file);
    expect(defs.map((d) => d.className)).toEqual(["a", "b", "c"]);
  });
});

describe("scanGlobalClassUsage (real monorepo fixture, sass)", () => {
  it("finds classes used as a bare string, via clsx(), and as a clsx object key — and correctly flags the rest as dead", () => {
    const project = new Project({
      tsConfigFilePath: path.join(fixtureDir, "fixtures/monorepo/tsconfig.json"),
    });
    const definitions = findSassClassDefinitions(globalSassPath);
    const results = scanGlobalClassUsage(definitions, project.getSourceFiles());

    const byName = (name: string) => {
      const found = results.find((r) => r.className === name);
      if (!found) throw new Error(`No result for class ${name}`);
      return found;
    };

    expect(byName("usedDirect").used).toBe(true);
    expect(byName("usedViaClsx").used).toBe(true);
    expect(byName("usedInObjectKey").used).toBe(true);

    expect(byName("deadClass").used).toBe(false);
    expect(byName("deadClass2").used).toBe(false);
    expect(byName("deadClass3").used).toBe(false);
  });

  it("does not confuse a class name with a similarly-prefixed one (word-boundary safety)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dead-styles-sass-"));
    const sassFile = path.join(dir, "mini.sass");
    writeFileSync(sassFile, [".textStyle", "  color: red", "", ".textStyle1", "  color: blue"].join("\n"));

    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/consumer.tsx", `const el = <div className="textStyle1" />;`);

    const definitions = findSassClassDefinitions(sassFile);
    const results = scanGlobalClassUsage(definitions, project.getSourceFiles());

    expect(results.find((r) => r.className === "textStyle1")?.used).toBe(true);
    expect(results.find((r) => r.className === "textStyle")?.used).toBe(false);
  });
});
