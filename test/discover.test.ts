import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { findStyleHookCandidates } from "../src/discover.js";

function candidatesFor(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/virtual.ts", source);
  return findStyleHookCandidates(project);
}

describe("findStyleHookCandidates", () => {
  it("captures a plain object literal passed to makeStyles", () => {
    const found = candidatesFor(`
      const useStyles = makeStyles({ root: {}, icon: {} });
    `);
    expect(found).toHaveLength(1);
    expect(found[0].candidate.factory).toBe("makeStyles");
    expect(found[0].candidate.definedClasses.map((c) => c.name)).toEqual(["root", "icon"]);
  });

  it("captures a theme-function passed to makeStyles with a block body", () => {
    const found = candidatesFor(`
      const useStyles = makeStyles((theme) => {
        return { root: { color: theme.color } };
      });
    `);
    expect(found).toHaveLength(1);
    expect(found[0].candidate.definedClasses.map((c) => c.name)).toEqual(["root"]);
  });

  it("captures tss.create(...) with a plain object", () => {
    const found = candidatesFor(`
      const useStyles = tss.create({ a: {}, b: {} });
    `);
    expect(found).toHaveLength(1);
    expect(found[0].candidate.factory).toBe("tss.create");
    expect(found[0].candidate.definedClasses.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("captures tss.withParams<T>().create(...) chains via the trailing .create", () => {
    const found = candidatesFor(`
      const useStyles = tss.withParams<{ x: number }>().create((params) => ({ a: {} }));
    `);
    expect(found).toHaveLength(1);
    expect(found[0].candidate.definedClasses.map((c) => c.name)).toEqual(["a"]);
  });

  it("captures tss-react's curried makeStyles(options)(fn) flavor", () => {
    const found = candidatesFor(`
      const useStyles = makeStyles({ name: "Foo" })((theme, params, classes) => ({
        root: { color: theme.color },
        icon: {},
      }));
    `);
    expect(found).toHaveLength(1);
    expect(found[0].candidate.factory).toBe("makeStyles");
    expect(found[0].candidate.definedClasses.map((c) => c.name)).toEqual(["root", "icon"]);
  });

  it("ignores unrelated function calls", () => {
    const found = candidatesFor(`
      const notAHook = someOtherFactory({ a: {} });
    `);
    expect(found).toHaveLength(0);
  });

  it("flags computed property keys and still records the plain ones", () => {
    const found = candidatesFor(`
      const key = "dyn";
      const useStyles = tss.create({ [key]: {}, plain: {} });
    `);
    expect(found).toHaveLength(1);
    expect(found[0].candidate.hasComputedDefinitionKeys).toBe(true);
    expect(found[0].candidate.definedClasses.map((c) => c.name)).toEqual(["plain"]);
  });
});
