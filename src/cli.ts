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
    "Find CSS-in-JS classes (tss-react / MUI makeStyles / JSS) that are defined but never used anywhere in the project, and (with --sass/--scss/--css) global stylesheet classes that are never applied anywhere.",
  )
  .version("0.1.7");

const collectPath = (value: string, previous: string[] | undefined) => [
  ...(previous ?? []),
  value,
];

program
  .command("scan")
  .description("Scan a project for dead CSS-in-JS classes")
  .requiredOption("--tsconfig <path>", "Path to tsconfig.json")
  .option(
    "--sass <path>",
    "Path to a global Sass (indented syntax) file to also scan for unused classes (repeatable)",
    collectPath,
  )
  .option(
    "--scss <path>",
    "Path to a global SCSS (brace syntax) file to also scan for unused classes (repeatable)",
    collectPath,
  )
  .option(
    "--css <path>",
    "Path to a global plain CSS file to also scan for unused classes (repeatable)",
    collectPath,
  )
  .option("--format <format>", "Output format: text, markdown, json", "text")
  .option("--out <path>", "Write output to a file instead of stdout")
  .option(
    "--fail-on <mode>",
    "When to exit non-zero: dead-styles, never",
    "dead-styles",
  )
  .action((opts) => {
    const project = new Project({ tsConfigFilePath: opts.tsconfig });
    const result = scan(project, {
      sassFiles: opts.sass,
      scssFiles: opts.scss,
      cssFiles: opts.css,
    });

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

    const hasDead =
      result.results.some((r) => r.deadClasses.length > 0) ||
      (result.globalClassResults?.some((r) => !r.used) ?? false);
    if (opts.failOn === "dead-styles" && hasDead) {
      process.exitCode = 1;
    }
  });

program.parse();
