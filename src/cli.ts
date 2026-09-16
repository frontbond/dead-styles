#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { Project } from "ts-morph";
import { Command } from "commander";
import { scan } from "./scan.js";
import { toJson, toMarkdown, toText } from "./format.js";

const program = new Command();

program
  .name("dead-styles")
  .description(
    "Find CSS-in-JS classes (tss-react / MUI makeStyles / JSS) that are defined but never used anywhere in the project — including when the styles hook and its call sites live in different files.",
  )
  .version("0.1.1");

program
  .command("scan")
  .description("Scan a project for dead CSS-in-JS classes")
  .requiredOption("--tsconfig <path>", "Path to tsconfig.json")
  .option("--format <format>", "Output format: text, markdown, json", "text")
  .option("--out <path>", "Write output to a file instead of stdout")
  .option(
    "--fail-on <mode>",
    "When to exit non-zero: dead-styles, never",
    "dead-styles",
  )
  .action((opts) => {
    const project = new Project({ tsConfigFilePath: opts.tsconfig });
    const result = scan(project);

    let output: string;
    switch (opts.format) {
      case "markdown":
        output = toMarkdown(result);
        break;
      case "json":
        output = toJson(result);
        break;
      case "text":
        output = toText(result);
        break;
      default:
        console.error(`Unknown format: ${opts.format}`);
        process.exit(2);
        return;
    }

    if (opts.out) {
      writeFileSync(opts.out, output);
    } else {
      console.log(output);
    }

    const hasDead = result.results.some((r) => r.deadClasses.length > 0);
    if (opts.failOn === "dead-styles" && hasDead) {
      process.exitCode = 1;
    }
  });

program.parse();
