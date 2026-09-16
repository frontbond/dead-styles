import type { HookResult, ScanResult } from "./types.js";

function relOrAbs(filePath: string, cwd: string): string {
  return filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;
}

export function toText(result: ScanResult, cwd = process.cwd()): string {
  const lines: string[] = [];
  const withDead = result.results.filter((r) => r.deadClasses.length > 0);
  const skipped = result.results.filter(
    (r) => r.status === "skipped-dynamic" || r.status === "skipped-spread",
  );

  if (withDead.length === 0) {
    lines.push("No dead CSS-in-JS classes found.");
  } else {
    for (const r of withDead) {
      lines.push(
        `${relOrAbs(r.hook.filePath, cwd)}:${r.hook.line} ${r.hook.hookName} (${r.callSites.length} call site${r.callSites.length === 1 ? "" : "s"})`,
      );
      for (const c of r.deadClasses) {
        lines.push(`  - ${c.name} (defined at line ${c.line})`);
      }
    }
  }

  if (skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped (could not verify safely): ${skipped.length}`);
    for (const r of skipped) {
      lines.push(
        `  - ${relOrAbs(r.hook.filePath, cwd)}:${r.hook.line} ${r.hook.hookName} — ${describeSkipReason(r)}`,
      );
    }
  }

  if (result.sassResults) {
    const deadSass = result.sassResults.filter((c) => !c.used);
    lines.push("");
    if (deadSass.length === 0) {
      lines.push("No unused global Sass classes found.");
    } else {
      lines.push(`Unused global Sass classes: ${deadSass.length}`);
      for (const c of deadSass) {
        lines.push(`  - ${relOrAbs(c.filePath, cwd)}:${c.line} .${c.className}`);
      }
    }
  }

  return lines.join("\n");
}

export function toMarkdown(result: ScanResult, cwd = process.cwd()): string {
  const lines: string[] = ["# dead-styles report", ""];
  const withDead = result.results.filter((r) => r.deadClasses.length > 0);
  const skipped = result.results.filter(
    (r) => r.status === "skipped-dynamic" || r.status === "skipped-spread",
  );
  const analyzedCount = result.results.filter((r) => r.status === "analyzed").length;

  lines.push(
    `Analyzed **${result.results.length}** style hook${result.results.length === 1 ? "" : "s"} ` +
      `(${analyzedCount} fully verified, ${skipped.length} skipped).`,
  );
  lines.push("");

  if (withDead.length === 0) {
    lines.push("✅ No dead CSS-in-JS classes found.");
  } else {
    lines.push(`Found dead classes in **${withDead.length}** style hook${withDead.length === 1 ? "" : "s"}:`);
    lines.push("");
    for (const r of withDead) {
      lines.push(
        `### \`${r.hook.hookName}\` — ${relOrAbs(r.hook.filePath, cwd)}:${r.hook.line}`,
      );
      lines.push("");
      lines.push(`Called from ${r.callSites.length} site${r.callSites.length === 1 ? "" : "s"}.`);
      lines.push("");
      for (const c of r.deadClasses) {
        lines.push(`- \`${c.name}\` (line ${c.line})`);
      }
      lines.push("");
    }
  }

  if (skipped.length > 0) {
    lines.push("<details><summary>Skipped hooks (could not verify safely)</summary>");
    lines.push("");
    for (const r of skipped) {
      lines.push(
        `- \`${r.hook.hookName}\` — ${relOrAbs(r.hook.filePath, cwd)}:${r.hook.line} — ${describeSkipReason(r)}`,
      );
    }
    lines.push("");
    lines.push("</details>");
  }

  if (result.sassResults) {
    const deadSass = result.sassResults.filter((c) => !c.used);
    lines.push("");
    if (deadSass.length === 0) {
      lines.push("✅ No unused global Sass classes found.");
    } else {
      lines.push(`Found **${deadSass.length}** unused global Sass class${deadSass.length === 1 ? "" : "es"}:`);
      lines.push("");
      for (const c of deadSass) {
        lines.push(`- \`.${c.className}\` — ${relOrAbs(c.filePath, cwd)}:${c.line}`);
      }
    }
  }

  return lines.join("\n");
}

export function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

function describeSkipReason(r: HookResult): string {
  if (r.status === "skipped-dynamic") {
    return "computed/dynamic class key access (`classes[expr]` or a computed key in the definition) — can't verify statically";
  }
  if (r.status === "skipped-spread") {
    return "the `classes` object is forwarded whole (spread, passed as a prop, or assigned elsewhere) — can't verify which keys are actually used";
  }
  return "unknown";
}
