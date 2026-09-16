import { fileURLToPath } from "node:url";
import path from "node:path";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import type { HookResult } from "../src/types.js";

const fixtureTsconfig = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/monorepo/tsconfig.json",
);

function runScan() {
  const project = new Project({ tsConfigFilePath: fixtureTsconfig });
  return scan(project);
}

function byHookName(results: HookResult[], name: string): HookResult {
  const found = results.find((r) => r.hook.hookName === name);
  if (!found) throw new Error(`No result for hook ${name}`);
  return found;
}

describe("dead-styles scan (real monorepo fixture)", () => {
  const result = runScan();

  it("finds every style hook in the monorepo", () => {
    const names = result.results.map((r) => r.hook.hookName).sort();
    expect(names).toEqual(
      [
        "useCardStyles",
        "useComputedDefStyles",
        "useDynamicStyles",
        "useLegacyStyles",
        "useSpreadyStyles",
        "useToolbarStyles",
        "useIconVariants",
        "default export of DefaultExport.styles",
      ].sort(),
    );
  });

  it("aggregates usage of `useCardStyles` ACROSS packages/ui/Card.tsx and packages/app/ExtraCardUsage.tsx, so header/body/footer all count as used and only unusedLabel is dead", () => {
    const r = byHookName(result.results, "useCardStyles");
    expect(r.status).toBe("analyzed");
    expect(r.callSites.length).toBe(2);
    expect(r.usedClassNames.sort()).toEqual(["body", "footer", "header"]);
    expect(r.deadClasses.map((c) => c.name)).toEqual(["unusedLabel"]);
  });

  it("a same-file-only, non-destructured makeStyles hook (useToolbarStyles) still works: `icon` is genuinely dead", () => {
    const r = byHookName(result.results, "useToolbarStyles");
    expect(r.status).toBe("analyzed");
    expect(r.deadClasses.map((c) => c.name)).toEqual(["icon"]);
  });

  it("a hook that is exported but never called anywhere reports no-call-sites and every class as dead", () => {
    const r = byHookName(result.results, "useLegacyStyles");
    expect(r.status).toBe("no-call-sites");
    expect(r.deadClasses.map((c) => c.name).sort()).toEqual(["label", "wrapper"]);
  });

  it("when `classes` is forwarded whole as a prop, the hook is skipped rather than false-flagging `b` as dead", () => {
    const r = byHookName(result.results, "useSpreadyStyles");
    expect(r.status).toBe("skipped-spread");
    expect(r.deadClasses).toEqual([]);
  });

  it("when a class is accessed via a computed/dynamic key, the hook is skipped rather than guessing", () => {
    const r = byHookName(result.results, "useDynamicStyles");
    expect(r.status).toBe("skipped-dynamic");
    expect(r.deadClasses).toEqual([]);
  });

  it("when the styles object itself has a computed property key, the hook is skipped", () => {
    const r = byHookName(result.results, "useComputedDefStyles");
    expect(r.status).toBe("skipped-dynamic");
    expect(r.deadClasses).toEqual([]);
  });

  it("resolves a bare `export default makeStyles()({...})` (no local name) via every importing file's own default-import binding, aggregating across packages", () => {
    const r = result.results.find(
      (x) => x.hook.filePath.endsWith("DefaultExport.styles.ts"),
    );
    if (!r) throw new Error("No result for DefaultExport.styles.ts");
    expect(r.status).toBe("analyzed");
    expect(r.callSites.length).toBe(2);
    expect(r.usedClassNames.sort()).toEqual(["title", "wrapper"]);
    expect(r.deadClasses.map((c) => c.name)).toEqual(["hint"]);
  });

  it("does not let four sibling components in the SAME file, each destructuring their own `classes`, leak into each other (real production bug)", () => {
    const r = byHookName(result.results, "useIconVariants");
    expect(r.status).toBe("analyzed");
    expect(r.callSites.length).toBe(4);
    expect(r.usedClassNames.sort()).toEqual(["active", "completed", "error", "inactive"]);
    expect(r.deadClasses).toEqual([]);
  });
});
