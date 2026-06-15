#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/cli.ts
import { resolve as resolve3 } from "node:path";

// src/config.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
var CONFIG_FILENAMES = ["mergegate.config.json", ".mergegate.json"];
var DEFAULT_AGENT_AUTHORS = [
  "\\[bot\\]",
  "copilot-swe-agent",
  "github-actions",
  "dependabot",
  "claude",
  "codex",
  "cursor",
  "devin",
  "noreply@anthropic\\.com",
  "agents@"
];
var DEFAULT_POLICY = {
  agentAuthors: DEFAULT_AGENT_AUTHORS,
  agent: { requireAll: true },
  human: { requireAll: false }
};

class ConfigError extends Error {
}
function findConfigPath(dir) {
  for (const name of CONFIG_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p))
      return p;
  }
  return null;
}
function parseConfig(raw, source = "config") {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${source}: expected a JSON object`);
  }
  const obj = raw;
  if (typeof obj.gates !== "object" || obj.gates === null || Array.isArray(obj.gates)) {
    throw new ConfigError(`${source}: "gates" must be an object with at least one gate`);
  }
  const gateNames = Object.keys(obj.gates);
  if (gateNames.length === 0) {
    throw new ConfigError(`${source}: define at least one gate`);
  }
  for (const [name, g] of Object.entries(obj.gates)) {
    if (typeof g !== "object" || g === null) {
      throw new ConfigError(`${source}: gate "${name}" must be an object`);
    }
    const gate = g;
    if (!gate.run && !gate.builtin) {
      throw new ConfigError(`${source}: gate "${name}" needs a "run" command or a "builtin"`);
    }
    if (gate.builtin && gate.builtin !== "spec") {
      throw new ConfigError(`${source}: gate "${name}" has unknown builtin "${gate.builtin}"`);
    }
  }
  const policyIn = obj.policy ?? {};
  const policy = {
    agentAuthors: policyIn.agentAuthors ?? DEFAULT_POLICY.agentAuthors,
    agent: { requireAll: policyIn.agent?.requireAll ?? DEFAULT_POLICY.agent.requireAll },
    human: { requireAll: policyIn.human?.requireAll ?? DEFAULT_POLICY.human.requireAll }
  };
  return {
    version: typeof obj.version === "number" ? obj.version : 1,
    protectedBranch: typeof obj.protectedBranch === "string" ? obj.protectedBranch : "main",
    gates: obj.gates,
    policy
  };
}
function loadConfig(dir) {
  const path = findConfigPath(dir);
  if (!path) {
    throw new ConfigError(`no mergegate config found in ${dir} (looked for ${CONFIG_FILENAMES.join(", ")}). Run \`mergegate init\`.`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`${path}: invalid JSON — ${e.message}`);
  }
  return parseConfig(raw, path);
}

// src/author.ts
function classifyAuthor(author, patterns) {
  const hay = author.toLowerCase();
  for (const p of patterns) {
    let re;
    try {
      re = new RegExp(p, "i");
    } catch {
      if (hay.includes(p.toLowerCase()))
        return "agent";
      continue;
    }
    if (re.test(author))
      return "agent";
  }
  return "human";
}

// src/gates.ts
import { spawnSync } from "node:child_process";
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
var DEFAULT_SPEC_PATTERN = "(spec[-:# ]?\\d+|#\\d+|[A-Z]{2,}-\\d+)";
function tail(s, lines = 20) {
  const arr = s.replace(/\s+$/, "").split(`
`);
  return arr.slice(-lines).join(`
`);
}
function evalSpecGate(gate, ctx) {
  const pattern = gate.pattern ?? DEFAULT_SPEC_PATTERN;
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    return { ok: false, reason: `invalid spec pattern: ${pattern}` };
  }
  const msgs = ctx.commitMessages ?? [];
  if (msgs.length === 0) {
    return { ok: false, reason: "no commits found to check for a spec reference" };
  }
  const missing = msgs.filter((m) => !re.test(m));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.length}/${msgs.length} commit(s) lack a spec/issue reference (need /${pattern}/) — e.g. "${missing[0].slice(0, 60)}"`
    };
  }
  return { ok: true, reason: `all ${msgs.length} commit(s) reference a spec/issue` };
}
function runGate(name, gate, ctx) {
  const required = gate.required ?? true;
  const start = Date.now();
  if (gate.builtin === "spec" && !gate.run) {
    const { ok: ok2, reason } = evalSpecGate(gate, ctx);
    return {
      name,
      status: ok2 ? "pass" : "fail",
      required,
      durationMs: Date.now() - start,
      reason
    };
  }
  const cmd = gate.run;
  const res = spawnSync(cmd, {
    cwd: ctx.cwd,
    shell: true,
    encoding: "utf8",
    timeout: gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  });
  const durationMs = Date.now() - start;
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.error) {
    const timedOut = res.error.code === "ETIMEDOUT";
    return {
      name,
      status: "fail",
      required,
      durationMs,
      reason: timedOut ? `timed out after ${gate.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : `failed to run: ${res.error.message}`,
      output: tail(out)
    };
  }
  const ok = res.status === 0;
  return {
    name,
    status: ok ? "pass" : "fail",
    required,
    durationMs,
    reason: ok ? `\`${cmd}\` passed` : `\`${cmd}\` exited ${res.status}`,
    output: ok ? undefined : tail(out)
  };
}
function runGates(gates, ctx) {
  return Object.entries(gates).map(([name, g]) => runGate(name, g, ctx));
}

// src/verdict.ts
function isGateRequired(gate, authorClass, requireAll) {
  if (requireAll)
    return true;
  return gate.required;
}
function computeVerdict(results, authorClass, author, protectedBranch, requireAll) {
  const blockedBy = results.filter((g) => isGateRequired(g, authorClass, requireAll) && g.status !== "pass").map((g) => g.name);
  return {
    pass: blockedBy.length === 0,
    authorClass,
    author,
    protectedBranch,
    gates: results,
    blockedBy
  };
}
function evaluate(config, ctx) {
  const policy = config.policy ?? DEFAULT_POLICY;
  const authorClass = ctx.forceClass ?? classifyAuthor(ctx.author, policy.agentAuthors ?? DEFAULT_POLICY.agentAuthors);
  const requireAll = authorClass === "agent" ? policy.agent?.requireAll ?? true : policy.human?.requireAll ?? false;
  const results = runGates(config.gates, ctx);
  return computeVerdict(results, authorClass, ctx.author, config.protectedBranch ?? "main", requireAll);
}

// src/report.ts
var useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
var c = (code, s) => useColor ? `\x1B[${code}m${s}\x1B[0m` : s;
var green = (s) => c("32", s);
var red = (s) => c("31", s);
var yellow = (s) => c("33", s);
var dim = (s) => c("2", s);
var bold = (s) => c("1", s);
function icon(g) {
  if (g.status === "pass")
    return green("✔");
  if (g.status === "skipped")
    return dim("•");
  return red("✘");
}
function dur(ms) {
  if (ms < 1000)
    return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatReport(v) {
  const lines = [];
  const classTag = v.authorClass === "agent" ? yellow("agent") : "human";
  lines.push(bold("mergegate") + dim(` · guarding ${v.protectedBranch} · author: ${v.author} [${classTag}]`));
  lines.push("");
  for (const g of v.gates) {
    const req = g.required ? "" : dim(" (optional)");
    lines.push(`  ${icon(g)} ${bold(g.name)}${req}  ${dim(dur(g.durationMs))}`);
    lines.push(`      ${g.status === "pass" ? dim(g.reason) : g.reason}`);
    if (g.status === "fail" && g.output) {
      for (const ol of g.output.split(`
`).slice(-6)) {
        lines.push(dim(`      │ ${ol}`));
      }
    }
  }
  lines.push("");
  if (v.pass) {
    lines.push(green(bold("✔ PASS")) + dim(` — clear to merge into ${v.protectedBranch}.`));
  } else {
    lines.push(red(bold("✘ BLOCKED")) + ` — ${v.blockedBy.length} required gate(s) not green: ${v.blockedBy.join(", ")}`);
    if (v.authorClass === "agent") {
      lines.push(dim(`  agent-authored change → all gates required. Fix the above, then re-run \`mergegate check\`.`));
    }
  }
  return lines.join(`
`);
}
function formatJson(v) {
  return JSON.stringify(v, null, 2);
}

// src/git.ts
import { spawnSync as spawnSync2 } from "node:child_process";
function git(args, cwd) {
  const r = spawnSync2("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0 || r.error)
    return null;
  return r.stdout.trim();
}
function isGitRepo(cwd) {
  return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}
function headAuthor(cwd) {
  const name = git(["log", "-1", "--pretty=%an"], cwd) ?? "unknown";
  const email = git(["log", "-1", "--pretty=%ae"], cwd) ?? "unknown";
  return `${name} <${email}>`;
}
function branchCommitMessages(cwd, base) {
  const merge = git(["merge-base", base, "HEAD"], cwd);
  if (merge) {
    const out = git(["log", `${merge}..HEAD`, "--pretty=%s"], cwd);
    if (out !== null && out.length > 0)
      return out.split(`
`);
  }
  const last = git(["log", "-1", "--pretty=%s"], cwd);
  return last ? [last] : [];
}

// src/commands/init.ts
import { writeFileSync, existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2 } from "node:fs";
import { resolve, join as join2 } from "node:path";
function detectStack(dir) {
  const has = (f) => existsSync2(join2(dir, f));
  if (has("package.json")) {
    let scripts = {};
    try {
      scripts = JSON.parse(readFileSync2(join2(dir, "package.json"), "utf8")).scripts ?? {};
    } catch {}
    const runner = has("bun.lockb") || has("bun.lock") ? "bun run" : has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm run";
    return {
      build: scripts.build ? `${runner} build` : "echo 'no build step' ",
      tests: scripts.test ? runner === "npm run" ? "npm test" : `${runner} test` : "echo 'no tests configured — add one' && exit 1",
      checks: scripts.lint ? `${runner} lint` : scripts.typecheck ? `${runner} typecheck` : "echo 'no checks configured'"
    };
  }
  if (has("Cargo.toml"))
    return { build: "cargo build --locked", tests: "cargo test", checks: "cargo clippy -- -D warnings" };
  if (has("go.mod"))
    return { build: "go build ./...", tests: "go test ./...", checks: "go vet ./..." };
  if (has("pyproject.toml") || has("requirements.txt"))
    return { build: "echo 'no build step'", tests: "pytest -q", checks: "ruff check ." };
  return { build: "echo 'set your build command'", tests: "echo 'set your test command' && exit 1", checks: "echo 'set your checks command'" };
}
function defaultConfig(stack) {
  return {
    $schema: "https://github.com/deemwar/mergegate/schema.json",
    version: 1,
    protectedBranch: "main",
    gates: {
      spec: {
        description: "Every commit must reference a spec or issue (proof the work was specified).",
        builtin: "spec",
        required: true
      },
      build: { description: "The project builds.", run: stack.build, required: true },
      tests: { description: "The test suite passes.", run: stack.tests, required: true },
      checks: { description: "Lint / typecheck / static analysis.", run: stack.checks, required: false }
    },
    policy: {
      _comment: "Agent-authored changes must pass EVERY gate. Human changes honor each gate's `required`.",
      agent: { requireAll: true },
      human: { requireAll: false }
    }
  };
}
var WORKFLOW = `name: mergegate
# Block any PR — especially autonomous-agent PRs — from merging until the gate is green.
on:
  pull_request:
    branches: [main]
jobs:
  mergegate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # mergegate needs branch history for the spec gate
      - uses: oven-sh/setup-bun@v2
      - name: Run the merge gate
        run: bunx mergegate gate --base origin/main --author "\${{ github.event.pull_request.user.login }}"
`;
function cmdInit(args) {
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = resolve(dirArg ?? ".");
  const force = args.includes("--force");
  const configPath = join2(dir, "mergegate.config.json");
  if (existsSync2(configPath) && !force) {
    console.error(`mergegate: ${configPath} already exists. Use --force to overwrite.`);
    return 2;
  }
  const stack = detectStack(dir);
  writeFileSync(configPath, JSON.stringify(defaultConfig(stack), null, 2) + `
`);
  console.log(`✔ wrote mergegate.config.json (detected: build=\`${stack.build}\`, tests=\`${stack.tests}\`)`);
  if (!args.includes("--no-workflow")) {
    const wfDir = join2(dir, ".github", "workflows");
    mkdirSync(wfDir, { recursive: true });
    const wfPath = join2(wfDir, "mergegate.yml");
    if (!existsSync2(wfPath) || force) {
      writeFileSync(wfPath, WORKFLOW);
      console.log("✔ wrote .github/workflows/mergegate.yml (PR gate on main)");
    }
  }
  console.log(`
Next:`);
  console.log("  1. Review mergegate.config.json — wire build/tests/checks to your real commands.");
  console.log("  2. `mergegate check` locally to see the verdict.");
  console.log("  3. `mergegate install-hook` to block pushes to main that aren't green.");
  return 0;
}

// src/commands/hook.ts
import { writeFileSync as writeFileSync2, existsSync as existsSync3, chmodSync, mkdirSync as mkdirSync2 } from "node:fs";
import { resolve as resolve2, join as join3 } from "node:path";
import { spawnSync as spawnSync3 } from "node:child_process";
function hookScript(runner) {
  return `#!/usr/bin/env bash
# Installed by \`mergegate install-hook\`. Blocks a push to the protected branch
# unless the merge gate is green. Bypass once (emergency only): MERGEGATE_SKIP=1 git push
set -euo pipefail

if [ "\${MERGEGATE_SKIP:-}" = "1" ]; then
  echo "mergegate: skipped via MERGEGATE_SKIP=1" >&2
  exit 0
fi

protected="$(${runner} gate --print-branch 2>/dev/null || echo main)"

while read -r local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/"$protected")
      echo "mergegate: running the merge gate before pushing to $protected…" >&2
      if ! ${runner} gate; then
        echo "mergegate: ✘ push to $protected BLOCKED — gate not green (override: MERGEGATE_SKIP=1)." >&2
        exit 1
      fi
      ;;
  esac
done
exit 0
`;
}
function detectRunner(dir) {
  if (existsSync3(join3(dir, "node_modules", ".bin", "mergegate")))
    return "./node_modules/.bin/mergegate";
  const which = spawnSync3("which", ["mergegate"], { encoding: "utf8" });
  if (which.status === 0)
    return "mergegate";
  return "bunx mergegate";
}
function cmdInstallHook(args) {
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = resolve2(dirArg ?? ".");
  const gitDir = join3(dir, ".git");
  if (!existsSync3(gitDir)) {
    console.error(`mergegate: ${dir} is not a git repository (no .git).`);
    return 2;
  }
  const hooksDir = join3(gitDir, "hooks");
  mkdirSync2(hooksDir, { recursive: true });
  const hookPath = join3(hooksDir, "pre-push");
  if (existsSync3(hookPath) && !args.includes("--force")) {
    console.error(`mergegate: ${hookPath} already exists. Use --force to overwrite.`);
    return 2;
  }
  writeFileSync2(hookPath, hookScript(detectRunner(dir)));
  chmodSync(hookPath, 493);
  console.log(`✔ installed pre-push hook at .git/hooks/pre-push`);
  console.log("  pushes to the protected branch now run the merge gate first.");
  console.log("  emergency bypass: MERGEGATE_SKIP=1 git push");
  return 0;
}

// src/cli.ts
var VERSION = "0.1.0";
function parseFlags(args) {
  const _ = [];
  const flags = {};
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
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
var HELP = `mergegate — block any autonomous-agent PR from touching main until it
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
function buildContext(dir, flags, base) {
  let author;
  let commitMessages;
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
  let forceClass;
  if (flags.agent)
    forceClass = "agent";
  if (flags.human)
    forceClass = "human";
  return { cwd: dir, author, commitMessages, forceClass };
}
function runCheck(args) {
  const { flags } = parseFlags(args);
  const dir = resolve3(typeof flags.dir === "string" ? flags.dir : ".");
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
function main(argv) {
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
if (__require.main == __require.module) {
  process.exit(main(process.argv.slice(2)));
}
export {
  main
};
