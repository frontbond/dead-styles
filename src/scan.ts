import { Project } from "ts-morph";
import { analyzeHookUsage } from "./analyze.js";
import { findStyleHookCandidates } from "./discover.js";
import type { HookResult, ScanResult } from "./types.js";

export function scan(project: Project): ScanResult {
  const candidates = findStyleHookCandidates(project);
  const results: HookResult[] = [];

  for (const { hookNameNode, candidate } of candidates) {
    if (candidate.hasComputedDefinitionKeys) {
      results.push({
        hook: candidate,
        status: "skipped-dynamic",
        callSites: [],
        usedClassNames: [],
        deadClasses: [],
      });
      continue;
    }

    const usage = analyzeHookUsage(hookNameNode);

    const deadClasses =
      usage.status === "analyzed" || usage.status === "no-call-sites"
        ? candidate.definedClasses.filter((c) => !usage.usedClassNames.has(c.name))
        : [];

    results.push({
      hook: candidate,
      status: usage.status,
      callSites: usage.callSites,
      usedClassNames: [...usage.usedClassNames],
      deadClasses,
    });
  }

  return { results };
}
