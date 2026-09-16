import { Project } from "ts-morph";
import { analyzeHookUsage } from "./analyze.js";
import { findDefaultImportIdentifiers, findStyleHookCandidates } from "./discover.js";
import { findSassClassDefinitions, scanSassUsage } from "./sass.js";
import type { HookResult, ScanResult } from "./types.js";

export interface ScanOptions {
  /** Paths to global Sass (indented syntax) files to also scan for unused classes. */
  sassFiles?: string[];
}

export function scan(project: Project, options: ScanOptions = {}): ScanResult {
  const candidates = findStyleHookCandidates(project);
  const results: HookResult[] = [];

  for (const { hookNameNode, isDefaultExport, candidate } of candidates) {
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

    const hookRefRoots = isDefaultExport
      ? findDefaultImportIdentifiers(
          project,
          project.getSourceFileOrThrow(candidate.filePath),
        )
      : [hookNameNode!];

    const usage = analyzeHookUsage(hookRefRoots);

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

  const sassResults = options.sassFiles?.length
    ? options.sassFiles.flatMap((sassFile) =>
        scanSassUsage(findSassClassDefinitions(sassFile), project.getSourceFiles()),
      )
    : undefined;

  return sassResults ? { results, sassResults } : { results };
}
