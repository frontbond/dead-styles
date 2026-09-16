import { Project } from "ts-morph";
import { analyzeHookUsage } from "./analyze.js";
import { findDefaultImportIdentifiers, findStyleHookCandidates } from "./discover.js";
import { findCssClassDefinitions, findScssClassDefinitions } from "./cssLike.js";
import { scanGlobalClassUsage } from "./globalClassUsage.js";
import { findSassClassDefinitions } from "./sass.js";
import type { GlobalClassDefinition, HookResult, ScanResult } from "./types.js";

export interface ScanOptions {
  /** Paths to global Sass (indented syntax) files to also scan for unused classes. */
  sassFiles?: string[];
  /** Paths to global SCSS (brace syntax) files to also scan for unused classes. */
  scssFiles?: string[];
  /** Paths to global plain CSS files to also scan for unused classes. */
  cssFiles?: string[];
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

  const globalClassDefinitions: GlobalClassDefinition[] = [
    ...(options.sassFiles ?? []).flatMap((f) => findSassClassDefinitions(f)),
    ...(options.scssFiles ?? []).flatMap((f) => findScssClassDefinitions(f)),
    ...(options.cssFiles ?? []).flatMap((f) => findCssClassDefinitions(f)),
  ];

  const globalClassResults = globalClassDefinitions.length
    ? scanGlobalClassUsage(globalClassDefinitions, project.getSourceFiles())
    : undefined;

  return globalClassResults ? { results, globalClassResults } : { results };
}
