import { resolve } from "node:path";
import { loadConfig, ConfigError } from "./config.ts";
import { evaluate } from "./verdict.ts";
import { formatReport, formatJson, formatMarkdown } from "./report.ts";
import { summarize, formatSummaryText, formatSummaryJson, formatSummaryMarkdown } from "./summary.ts";
import { isGitRepo, headAuthor, branchCommitMessages, branchCommitTexts } from "./git.ts";
import { cmdInit } from "./commands/init.ts";
import { cmdInstallHook } from "./commands/hook.ts";
import { cmdAgents } from "./commands/agents.ts";
import { cmdChecks } from "./commands/checks.ts";
import type { AuthorClass, EvalContext, Verdict, MergegateConfig } from "./types.ts";

const VERSION = "0.1.0";

function parseFlags(args: string[]): { _: string[]; flags: Record<string, string | boolean> } {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

const HELP = `mergegate — block any autonomous-agent PR from touching main until it
provably passes spec + build + tests + checks.

USAGE
  mergegate <command> [options]

COMMANDS
  check                 Run every gate against the current change and print a verdict.
                        Exit 0 = clear to merge, 1 = BLOCKED, 2 = config/usage error.
  gate                  Alias of check, tuned for CI (always prints, machine-friendly).
  summary               Consolidated one-glance gate digest: author class + pass/fail/skip
                        counts + a single headline — for a CI job-summary or PR-comment
                        header. \`--json\` / \`--markdown\` switch the rendering. Same exit
                        codes as check (0 clear · 1 BLOCKED · 2 error). Also: check --format summary.
  init                  Scaffold mergegate.config.json + a GitHub Actions workflow.
  install-hook          Install a git pre-push hook that blocks pushing the protected branch
                        unless the gate is green.
  agents                List the coding agents mergegate detects out of the box.
                        \`--author "<name> <email>"\` probes one author; \`agents check\` audits
                        your repo's recent authors (proves the gate won't block a human); --json.
  checks                Browse the curated library of pre-built checks for common agent-PR
                        failure modes. \`checks show <id>\` prints the gate snippet; \`checks add
                        <id>\` appends it into mergegate.config.json. \`--stack node|go|rust|python\`.
                        Org-defined checks in a checkpack (mergegate.checks.json, or \`--pack
                        <path>\`) show up here too, tagged (custom), and add the same way.
  version               Print version.
  help                  Show this help.

OPTIONS (check / gate)
  --dir <path>          Repo directory (default: cwd).
  --base <ref>          Base ref to diff against (default: config protectedBranch).
  --author "<a>"        Override the change author ("Name <email>").
  --agent | --human     Force the author class instead of auto-detecting.
  --strict              Fail (exit 2) if an identity policy rule relaxed any required
                        gate for an agent author (CI guard). Without it, that only warns.
  --format <fmt>        Output format: text (default) | json | markdown | summary.
  --json                Shorthand for --format json.

Docs: https://github.com/deemwar-products/mergegate`;

function buildContext(dir: string, flags: Record<string, string | boolean>, base: string): EvalContext {
  let author: string;
  let commitMessages: string[];
  if (typeof flags.author === "string") {
    author = flags.author;
  } else if (isGitRepo(dir)) {
    author = headAuthor(dir);
  } else {
    author = "unknown <unknown>";
  }
  let commitTexts: string[];
  if (isGitRepo(dir)) {
    commitMessages = branchCommitMessages(dir, base);
    commitTexts = branchCommitTexts(dir, base);
  } else {
    commitMessages = [];
    commitTexts = [];
  }
  let forceClass: AuthorClass | undefined;
  if (flags.agent) forceClass = "agent";
  if (flags.human) forceClass = "human";
  return { cwd: dir, author, commitMessages, commitTexts, forceClass };
}

const useColorDefault = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** Safety guard: an identity rule that relaxed a gate for an AGENT author always warns
 *  on stderr; under `--strict` it's a hard error (exit 2) so CI can forbid loosening. */
function strictGuard(v: Verdict, flags: Record<string, string | boolean>): number | null {
  if (!v.loosenedGates || v.loosenedGates.length === 0) return null;
  console.error(
    `mergegate: identity rule "${v.appliedRule}" relaxed ${v.loosenedGates.length} gate(s) for an agent author: ${v.loosenedGates.join(", ")}`,
  );
  if (flags.strict) {
    console.error(`mergegate: --strict — refusing to run with a loosened agent gate.`);
    return 2;
  }
  return null;
}

/** Shared path for `check` and `summary`: load config, build context, evaluate.
 *  Returns a non-zero exit code on a config error instead of a verdict. */
type VerdictOrCode = { code: number } | { config: MergegateConfig; verdict: Verdict };
function buildVerdict(dir: string, flags: Record<string, string | boolean>): VerdictOrCode {
  let config;
  try {
    config = loadConfig(dir);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`mergegate: ${e.message}`);
      return { code: 2 };
    }
    throw e;
  }
  const base = typeof flags.base === "string" ? flags.base : config.protectedBranch ?? "main";
  const ctx = buildContext(dir, flags, base);
  return { config, verdict: evaluate(config, ctx) };
}

function runCheck(args: string[]): number {
  const { flags } = parseFlags(args);
  const dir = resolve(typeof flags.dir === "string" ? flags.dir : ".");
  if (flags["print-branch"]) {
    // Light path: only the configured branch is needed — don't run the gates.
    try {
      const config = loadConfig(dir);
      console.log(config.protectedBranch ?? "main");
      return 0;
    } catch (e) {
      if (e instanceof ConfigError) {
        console.error(`mergegate: ${e.message}`);
        return 2;
      }
      throw e;
    }
  }
  const r = buildVerdict(dir, flags);
  if ("code" in r) return r.code;
  const { verdict } = r;

  const guard = strictGuard(verdict, flags);
  if (guard !== null) return guard;

  const format = flags.json ? "json" : typeof flags.format === "string" ? flags.format : "text";
  switch (format) {
    case "json":
      console.log(formatJson(verdict));
      break;
    case "markdown":
    case "md":
      console.log(formatMarkdown(verdict));
      break;
    case "summary":
      // The consolidated digest, also reachable as its own `summary` command.
      console.log(formatSummaryText(summarize(verdict), useColorDefault()));
      break;
    default:
      console.log(formatReport(verdict));
  }
  return verdict.pass ? 0 : 1;
}

/** `mergegate summary` — the consolidated agent-PR gate digest: author class +
 *  pass/fail/skip counts + a one-line headline, for a CI job-summary header or a
 *  PR-comment headline. Same evaluate() path as `check`; `--json` / `--markdown`
 *  switch the digest's rendering. Exit code tracks the verdict (0 clear · 1 blocked
 *  · 2 config error) so it can gate in CI exactly like `check`. */
function runSummary(args: string[]): number {
  const { flags } = parseFlags(args);
  const dir = resolve(typeof flags.dir === "string" ? flags.dir : ".");
  const r = buildVerdict(dir, flags);
  if ("code" in r) return r.code;
  const guard = strictGuard(r.verdict, flags);
  if (guard !== null) return guard;
  const s = summarize(r.verdict);
  const markdown = flags.markdown || flags.md || flags.format === "markdown" || flags.format === "md";
  if (flags.json) {
    console.log(formatSummaryJson(s));
  } else if (markdown) {
    console.log(formatSummaryMarkdown(s));
  } else {
    console.log(formatSummaryText(s, useColorDefault()));
  }
  return r.verdict.pass ? 0 : 1;
}

export function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "check":
    case "gate":
      return runCheck(rest);
    case "summary":
      return runSummary(rest);
    case "init":
      return cmdInit(rest);
    case "install-hook":
      return cmdInstallHook(rest);
    case "agents":
      return cmdAgents(rest);
    case "checks":
      return cmdChecks(rest);
    case "version":
    case "--version":
    case "-v":
      console.log(`mergegate ${VERSION}`);
      return 0;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      return cmd === undefined ? 1 : 0;
    default:
      console.error(`mergegate: unknown command "${cmd}". Run \`mergegate help\`.`);
      return 2;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
