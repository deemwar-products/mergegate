import type { Verdict, GateResult } from "./types.ts";

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s: string) => c("32", s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
const cyan = (s: string) => c("36", s);
const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);

function icon(g: GateResult): string {
  if (g.status === "pass") return green("✔");
  if (g.status === "skipped") return dim("•");
  return red("✘");
}

function dur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Render a verdict as a terminal report. */
export function formatReport(v: Verdict): string {
  const lines: string[] = [];
  const classTag = v.authorClass === "agent" ? yellow("agent") : "human";
  const rule = v.appliedRule ? dim(` · policy: ${v.appliedRule}`) : "";
  lines.push(bold("mergegate") + dim(` · guarding ${v.protectedBranch} · author: ${v.author} [${classTag}]`) + rule);
  if (v.behavioralSignal) {
    lines.push(yellow(`  ⓘ gated as agent by commit signal: ${v.behavioralSignal}`));
  }
  if (v.loosenedGates && v.loosenedGates.length > 0) {
    lines.push(yellow(`  ⚠ identity rule "${v.appliedRule}" relaxed ${v.loosenedGates.length} agent gate(s): ${v.loosenedGates.join(", ")}`));
  }
  lines.push("");
  for (const g of v.gates) {
    const req = g.required ? "" : dim(" (optional)");
    lines.push(`  ${icon(g)} ${bold(g.name)}${req}  ${dim(dur(g.durationMs))}`);
    lines.push(`      ${g.status === "pass" ? dim(g.reason) : g.reason}`);
    if (g.status === "fail" && g.output) {
      for (const ol of g.output.split("\n").slice(-6)) {
        lines.push(dim(`      │ ${ol}`));
      }
    }
    // Actionable next step — only for gates that actually block this verdict.
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
  return lines.join("\n");
}

/** Machine-readable verdict for CI / GitHub checks. */
export function formatJson(v: Verdict): string {
  return JSON.stringify(v, null, 2);
}

/** A hidden marker so a CI bot can find + upsert its own comment instead of spamming. */
export const MARKDOWN_MARKER = "<!-- mergegate -->";

function mdIcon(g: GateResult): string {
  if (g.status === "pass") return "✅ pass";
  if (g.status === "skipped") return "➖ skipped";
  return "❌ fail";
}

/** A PR-comment-ready verdict (the GitHub-check surface). */
export function formatMarkdown(v: Verdict): string {
  const lines: string[] = [MARKDOWN_MARKER];
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
  if (v.behavioralSignal) {
    lines.push("");
    lines.push(`> ℹ️ Gated as **agent** by a commit signal: ${v.behavioralSignal}`);
  }
  lines.push("");
  lines.push("| Gate | Status | Detail |");
  lines.push("|---|---|---|");
  for (const g of v.gates) {
    const name = g.required ? g.name : `${g.name} _(optional)_`;
    const detail = (g.reason || "").replace(/\n/g, " ").slice(0, 160);
    lines.push(`| ${name} | ${mdIcon(g)} | ${detail} |`);
  }
  // Actionable next steps — only the gates that actually block this verdict.
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
  return lines.join("\n");
}
