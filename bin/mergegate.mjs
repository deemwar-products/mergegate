#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/cli.ts
import { resolve as resolve4 } from "node:path";

// src/config.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

// src/agents.ts
var AGENTS = [
  {
    id: "copilot-swe-agent",
    label: "GitHub Copilot coding agent",
    match: ["copilot-swe-agent", "copilot\\[bot\\]"],
    url: "https://github.com/features/copilot"
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    match: ["cursoragent", "@cursor\\.com"],
    url: "https://cursor.com"
  },
  {
    id: "devin",
    label: "Devin (Cognition)",
    match: ["devin-ai-integration", "devin\\[bot\\]"],
    url: "https://devin.ai"
  },
  {
    id: "claude-code",
    label: "Claude Code",
    match: ["noreply@anthropic\\.com", "claude\\[bot\\]"],
    url: "https://claude.com/claude-code"
  },
  {
    id: "codex",
    label: "OpenAI Codex",
    match: ["chatgpt-codex", "codex\\[bot\\]"],
    url: "https://openai.com/codex"
  },
  {
    id: "dependabot",
    label: "Dependabot",
    match: ["dependabot\\[bot\\]", "dependabot"],
    url: "https://github.com/dependabot"
  },
  {
    id: "github-actions",
    label: "GitHub Actions bot",
    match: ["github-actions\\[bot\\]", "github-actions", "41898282\\+github-actions"],
    url: "https://docs.github.com/actions"
  },
  {
    id: "renovate",
    label: "Renovate bot",
    match: ["renovate\\[bot\\]", "renovate-bot"],
    url: "https://github.com/renovatebot/renovate"
  },
  {
    id: "jules",
    label: "Jules (Google)",
    match: ["google-labs-jules", "jules\\[bot\\]"],
    url: "https://jules.google"
  },
  {
    id: "sweep",
    label: "Sweep",
    match: ["sweep-ai\\[bot\\]", "sweep\\[bot\\]"],
    url: "https://sweep.dev"
  },
  {
    id: "aider",
    label: "Aider",
    match: ["aider\\[bot\\]"],
    url: "https://aider.chat"
  },
  {
    id: "deemwar-agent",
    label: "deemwar fleet agent",
    match: ["agents@deemwar\\.com"],
    url: "https://deemwar.com"
  },
  {
    id: "generic-bot",
    label: "Generic [bot] account",
    match: ["\\[bot\\]"]
  }
];
var DEFAULT_AGENT_AUTHORS = AGENTS.flatMap((a) => a.match);
function explainMatch(author) {
  for (const a of AGENTS) {
    for (const p of a.match) {
      if (classifyAuthor(author, [p]) === "agent")
        return { entry: a, pattern: p };
    }
  }
  return null;
}

// src/config.ts
var CONFIG_FILENAMES = ["mergegate.config.json", ".mergegate.json"];
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

// src/gates.ts
import { spawnSync } from "node:child_process";

// src/remediation.ts
function safeCmd(gate) {
  const raw = (gate.run ?? "").replace(/\s+/g, " ").trim();
  if (!raw)
    return "the gate command";
  return raw.length > 120 ? raw.slice(0, 119) + "…" : raw;
}
function remediationFor(name, gate, kind) {
  if (!kind)
    return;
  switch (kind) {
    case "spec": {
      const pattern = gate.pattern ?? DEFAULT_SPEC_PATTERN;
      return `Reference a spec or issue in every commit — e.g. \`fix: … (spec 12)\` or \`#12\`. Each commit subject must match /${pattern}/.`;
    }
    case "timeout":
      return `\`${safeCmd(gate)}\` timed out — make it faster or raise this gate's \`timeoutMs\`.`;
    case "spawn":
      return `\`${safeCmd(gate)}\` couldn't start — check it's installed and on your PATH.`;
    case "exit":
      return gate.run ? `Run \`${safeCmd(gate)}\` locally, fix what it reports, then push.` : `Resolve the "${name}" gate locally, then re-run mergegate.`;
  }
}

// src/gates.ts
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
      reason,
      remediation: remediationFor(name, gate, ok2 ? null : "spec")
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
    const kind = timedOut ? "timeout" : "spawn";
    return {
      name,
      status: "fail",
      required,
      durationMs,
      reason: timedOut ? `timed out after ${gate.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : `failed to run: ${res.error.message}`,
      output: tail(out),
      remediation: remediationFor(name, gate, kind)
    };
  }
  const ok = res.status === 0;
  return {
    name,
    status: ok ? "pass" : "fail",
    required,
    durationMs,
    reason: ok ? `\`${cmd}\` passed` : `\`${cmd}\` exited ${res.status}`,
    output: ok ? undefined : tail(out),
    remediation: remediationFor(name, gate, ok ? null : "exit")
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
var cyan = (s) => c("36", s);
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
    if (g.remediation && v.blockedBy.includes(g.name)) {
      lines.push(cyan(`      → fix: ${g.remediation}`));
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
var MARKDOWN_MARKER = "<!-- mergegate -->";
function mdIcon(g) {
  if (g.status === "pass")
    return "✅ pass";
  if (g.status === "skipped")
    return "➖ skipped";
  return "❌ fail";
}
function formatMarkdown(v) {
  const lines = [MARKDOWN_MARKER];
  const classTag = `\`[${v.authorClass}]\``;
  if (v.pass) {
    lines.push(`## ✅ mergegate — clear to merge into \`${v.protectedBranch}\``);
  } else {
    lines.push(`## ❌ mergegate — BLOCKED from \`${v.protectedBranch}\``);
    lines.push("");
    lines.push(`**${v.blockedBy.length} required gate(s) not green:** ${v.blockedBy.map((n) => `\`${n}\``).join(", ")}`);
  }
  lines.push("");
  lines.push(`**Author:** ${v.author} ${classTag}`);
  lines.push("");
  lines.push("| Gate | Status | Detail |");
  lines.push("|---|---|---|");
  for (const g of v.gates) {
    const name = g.required ? g.name : `${g.name} _(optional)_`;
    const detail = (g.reason || "").replace(/\n/g, " ").slice(0, 160);
    lines.push(`| ${name} | ${mdIcon(g)} | ${detail} |`);
  }
  const fixes = v.gates.filter((g) => g.remediation && v.blockedBy.includes(g.name));
  if (fixes.length > 0) {
    lines.push("");
    lines.push("**How to fix**");
    for (const g of fixes) {
      lines.push(`- **${g.name}** — ${g.remediation}`);
    }
  }
  lines.push("");
  if (!v.pass && v.authorClass === "agent") {
    lines.push("> ⚠️ Agent-authored change → **all gates required**. Fix the items above and re-run the gate.");
  } else if (v.pass) {
    lines.push("> Provably done — spec · build · tests · checks.");
  }
  return lines.join(`
`);
}

// src/summary.ts
var count = (gates, s) => gates.filter((g) => g.status === s).length;
function summarize(v) {
  const failed = count(v.gates, "fail");
  const requiredFailed = v.blockedBy.length;
  const headline = v.pass ? `✔ PASS — clear to merge into ${v.protectedBranch}` : `✘ BLOCKED — ${v.blockedBy.join(", ")}`;
  return {
    author: v.author,
    authorClass: v.authorClass,
    protectedBranch: v.protectedBranch,
    pass: v.pass,
    total: v.gates.length,
    passed: count(v.gates, "pass"),
    failed,
    skipped: count(v.gates, "skipped"),
    requiredFailed,
    optionalFailed: failed - requiredFailed,
    blockedBy: [...v.blockedBy],
    headline
  };
}
var paint = (on, code, s) => on ? `\x1B[${code}m${s}\x1B[0m` : s;
function formatSummaryText(s, useColor2) {
  const classTag = s.authorClass === "agent" ? paint(useColor2, "33", "agent") : "human";
  const dim2 = (x) => paint(useColor2, "2", x);
  const counts = `${s.total} gates · ${paint(useColor2, "32", `${s.passed} ✔`)} · ` + `${paint(useColor2, "31", `${s.failed} ✘`)} · ${dim2(`${s.skipped} skipped`)}` + (s.optionalFailed > 0 ? dim2(`  (${s.optionalFailed} optional)`) : "");
  const headline = s.pass ? paint(useColor2, "1;32", s.headline) : paint(useColor2, "1;31", s.headline);
  return [
    paint(useColor2, "1", "mergegate") + dim2(` · ${s.protectedBranch} · ${s.author} [`) + classTag + dim2("]"),
    `  ${counts}`,
    `  ${headline}`
  ].join(`
`);
}
function formatSummaryJson(s) {
  return JSON.stringify(s, null, 2);
}
function formatSummaryMarkdown(s) {
  const badge = s.pass ? "✅ PASS" : "❌ BLOCKED";
  const tally = `${s.passed}/${s.total} gates green`;
  const fails = s.pass ? "" : ` · **${s.requiredFailed}/${s.total}** blocking: ${s.blockedBy.map((n) => `\`${n}\``).join(", ")}`;
  return [
    MARKDOWN_MARKER,
    `${badge} — **mergegate** \`${s.protectedBranch}\` · ${s.author} \`[${s.authorClass}]\` — ${tally}${fails}`
  ].join(`
`);
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
function recentAuthors(cwd, n) {
  const out = git(["log", `-${n}`, "--pretty=%an <%ae>"], cwd);
  if (!out)
    return [];
  const seen = new Set;
  const result = [];
  for (const line of out.split(`
`)) {
    if (line && !seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  }
  return result;
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
permissions:
  contents: read
  pull-requests: write # so mergegate can post the verdict as a PR comment
jobs:
  mergegate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # mergegate needs branch history for the spec gate
      # One line. Auto-detects the agent author and holds it to every gate.
      - uses: deemwar/mergegate@v0
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
  case "\${remote_ref}" in
    refs/heads/"\${protected}")
      echo "mergegate: running the merge gate before pushing to \${protected} ..." >&2
      if ! ${runner} gate; then
        echo "mergegate: BLOCKED push to \${protected} -- gate not green (override: MERGEGATE_SKIP=1)." >&2
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

// src/commands/agents.ts
import { resolve as resolve3 } from "node:path";
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
var useColorDefault = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
var paint2 = (on, code, s) => on ? `\x1B[${code}m${s}\x1B[0m` : s;
var dim2 = (on, s) => paint2(on, "2", s);
var yellow2 = (on, s) => paint2(on, "33", s);
var green2 = (on, s) => paint2(on, "32", s);
function probeAuthor(author) {
  const hit = explainMatch(author);
  if (hit)
    return { cls: "agent", entry: hit.entry, pattern: hit.pattern };
  return { cls: "human", entry: null, pattern: null };
}
function formatAgentsList(useColor2) {
  const idW = Math.max(2, ...AGENTS.map((a) => a.id.length));
  const labelW = Math.max(5, ...AGENTS.map((a) => a.label.length));
  const lines = [];
  lines.push(`mergegate · ${AGENTS.length} known coding agents detected out of the box`);
  lines.push("");
  lines.push(dim2(useColor2, `  ${"ID".padEnd(idW)}  ${"LABEL".padEnd(labelW)}  PATTERNS`));
  for (const a of AGENTS) {
    lines.push(`  ${a.id.padEnd(idW)}  ${a.label.padEnd(labelW)}  ${dim2(useColor2, a.match.join(", "))}`);
  }
  lines.push("");
  lines.push(dim2(useColor2, "  Add yours (one entry, anchored to a [bot] login or noreply domain):"));
  lines.push(dim2(useColor2, "  https://github.com/deemwar/mergegate  → edit src/agents.ts"));
  return lines.join(`
`);
}
function formatProbe(author, useColor2) {
  const { cls, entry, pattern } = probeAuthor(author);
  if (cls === "agent") {
    return `${yellow2(useColor2, "agent")}  ✔ ${entry.label} (${entry.id}) — matched ${dim2(useColor2, `/${pattern}/`)}`;
  }
  return `${green2(useColor2, "human")}  — no known agent matched ${dim2(useColor2, `"${author}"`)}`;
}
function runCheck(flags, useColor2) {
  const dir = resolve3(typeof flags.dir === "string" ? flags.dir : ".");
  const limit = typeof flags.limit === "string" ? Math.max(1, parseInt(flags.limit, 10) || 20) : 20;
  if (!isGitRepo(dir)) {
    console.error(`mergegate: ${dir} is not a git repo — \`agents check\` audits commit authors.`);
    return 2;
  }
  const authors = recentAuthors(dir, limit);
  const probed = authors.map((a) => ({ author: a, ...probeAuthor(a) }));
  if (flags.json) {
    console.log(JSON.stringify(probed.map((p) => ({ author: p.author, cls: p.cls, agent: p.entry })), null, 2));
    return 0;
  }
  const agents = probed.filter((p) => p.cls === "agent");
  console.log(`mergegate · audited ${authors.length} recent author(s) in ${dir}
`);
  for (const p of probed) {
    const tag = p.cls === "agent" ? yellow2(useColor2, "agent") : green2(useColor2, "human");
    const why = p.entry ? dim2(useColor2, `  → ${p.entry.id} /${p.pattern}/`) : "";
    console.log(`  ${tag}  ${p.author}${why}`);
  }
  console.log(`
${agents.length} of ${authors.length} would be gated as agents. ` + dim2(useColor2, "Named like an agent but listed human? Your contributors are safe."));
  return 0;
}
function cmdAgents(args) {
  const { _, flags } = parseFlags(args);
  const useColor2 = useColorDefault();
  if (_[0] === "check")
    return runCheck(flags, useColor2);
  if (typeof flags.author === "string") {
    const { cls, entry } = probeAuthor(flags.author);
    if (flags.json) {
      console.log(JSON.stringify({ author: flags.author, cls, agent: entry }, null, 2));
    } else {
      console.log(formatProbe(flags.author, useColor2));
    }
    return 0;
  }
  if (flags.json) {
    console.log(JSON.stringify(AGENTS, null, 2));
    return 0;
  }
  console.log(formatAgentsList(useColor2));
  return 0;
}

// src/cli.ts
var VERSION = "0.1.0";
function parseFlags2(args) {
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
  version               Print version.
  help                  Show this help.

OPTIONS (check / gate)
  --dir <path>          Repo directory (default: cwd).
  --base <ref>          Base ref to diff against (default: config protectedBranch).
  --author "<a>"        Override the change author ("Name <email>").
  --agent | --human     Force the author class instead of auto-detecting.
  --format <fmt>        Output format: text (default) | json | markdown | summary.
  --json                Shorthand for --format json.

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
var useColorDefault2 = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
function buildVerdict(dir, flags) {
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
function runCheck2(args) {
  const { flags } = parseFlags2(args);
  const dir = resolve4(typeof flags.dir === "string" ? flags.dir : ".");
  if (flags["print-branch"]) {
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
  if ("code" in r)
    return r.code;
  const { verdict } = r;
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
      console.log(formatSummaryText(summarize(verdict), useColorDefault2()));
      break;
    default:
      console.log(formatReport(verdict));
  }
  return verdict.pass ? 0 : 1;
}
function runSummary(args) {
  const { flags } = parseFlags2(args);
  const dir = resolve4(typeof flags.dir === "string" ? flags.dir : ".");
  const r = buildVerdict(dir, flags);
  if ("code" in r)
    return r.code;
  const s = summarize(r.verdict);
  const markdown = flags.markdown || flags.md || flags.format === "markdown" || flags.format === "md";
  if (flags.json) {
    console.log(formatSummaryJson(s));
  } else if (markdown) {
    console.log(formatSummaryMarkdown(s));
  } else {
    console.log(formatSummaryText(s, useColorDefault2()));
  }
  return r.verdict.pass ? 0 : 1;
}
function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "check":
    case "gate":
      return runCheck2(rest);
    case "summary":
      return runSummary(rest);
    case "init":
      return cmdInit(rest);
    case "install-hook":
      return cmdInstallHook(rest);
    case "agents":
      return cmdAgents(rest);
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
