import type { Verdict, GateResult } from "./types.ts";

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s: string) => c("32", s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
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
  lines.push(bold("mergegate") + dim(` · guarding ${v.protectedBranch} · author: ${v.author} [${classTag}]`));
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
