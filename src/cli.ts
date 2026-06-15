import { resolve } from "node:path";
import { loadConfig, ConfigError } from "./config.ts";
import { evaluate } from "./verdict.ts";
import { formatReport, formatJson } from "./report.ts";
import { isGitRepo, headAuthor, branchCommitMessages } from "./git.ts";
import { cmdInit } from "./commands/init.ts";
import { cmdInstallHook } from "./commands/hook.ts";
import type { AuthorClass, EvalContext } from "./types.ts";

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
  init                  Scaffold mergegate.config.json + a GitHub Actions workflow.
  install-hook          Install a git pre-push hook that blocks pushing the protected branch
                        unless the gate is green.
  version               Print version.
  help                  Show this help.

OPTIONS (check / gate)
  --dir <path>          Repo directory (default: cwd).
  --base <ref>          Base ref to diff against (default: config protectedBranch).
  --author "<a>"        Override the change author ("Name <email>").
  --agent | --human     Force the author class instead of auto-detecting.
  --json                Emit the verdict as JSON.

Docs: https://github.com/deemwar/mergegate`;

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
  if (isGitRepo(dir)) {
    commitMessages = branchCommitMessages(dir, base);
  } else {
    commitMessages = [];
  }
  let forceClass: AuthorClass | undefined;
  if (flags.agent) forceClass = "agent";
  if (flags.human) forceClass = "human";
  return { cwd: dir, author, commitMessages, forceClass };
}

function runCheck(args: string[]): number {
  const { flags } = parseFlags(args);
  const dir = resolve(typeof flags.dir === "string" ? flags.dir : ".");
  let config;
  try {
    config = loadConfig(dir);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`mergegate: ${e.message}`);
      return 2;
    }
    throw e;
  }
  if (flags["print-branch"]) {
    console.log(config.protectedBranch ?? "main");
    return 0;
  }
  const base = typeof flags.base === "string" ? flags.base : config.protectedBranch ?? "main";
  const ctx = buildContext(dir, flags, base);
  const verdict = evaluate(config, ctx);

  if (flags.json) {
    console.log(formatJson(verdict));
  } else {
    console.log(formatReport(verdict));
  }
  return verdict.pass ? 0 : 1;
}

export function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "check":
    case "gate":
      return runCheck(rest);
    case "init":
      return cmdInit(rest);
    case "install-hook":
      return cmdInstallHook(rest);
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
