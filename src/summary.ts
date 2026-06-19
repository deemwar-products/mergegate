// Consolidated agent-PR gate summary — a high-altitude digest of a Verdict.
//
// `check` prints the full per-gate report; `summary` answers one question in one
// glance: did this (agent or human) PR clear the gate, and by how much? It's the
// surface you put at the TOP of a CI job-summary, a PR-comment headline, or a chat
// ping — counts + a single headline, no per-gate detail dump. It reuses the same
// evaluate() path as `check` (this module is formatters only — no new logic to drift).
import type { Verdict, GateResult, AuthorClass } from "./types.ts";
import { MARKDOWN_MARKER } from "./report.ts";

export interface VerdictSummary {
  author: string;
  authorClass: AuthorClass;
  protectedBranch: string;
  pass: boolean;
  /** Total gates evaluated. */
  total: number;
  passed: number;
  /** All failing gates, required or not. */
  failed: number;
  skipped: number;
  /** Failing gates that actually BLOCK the merge (== blockedBy.length). */
  requiredFailed: number;
  /** Failing gates that did NOT block (optional for this author class). */
  optionalFailed: number;
  blockedBy: string[];
  /** A rendered one-liner, handy for text/markdown surfaces. */
  headline: string;
}

const count = (gates: GateResult[], s: GateResult["status"]) => gates.filter((g) => g.status === s).length;

/** Roll a Verdict up into a flat, countable digest. Pure — never mutates the input. */
export function summarize(v: Verdict): VerdictSummary {
  const failed = count(v.gates, "fail");
  const requiredFailed = v.blockedBy.length;
  const headline = v.pass
    ? `✔ PASS — clear to merge into ${v.protectedBranch}`
    : `✘ BLOCKED — ${v.blockedBy.join(", ")}`;
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
    // an optional gate that failed doesn't block; for agent PRs every gate is
    // required, so this is naturally 0 there. Surfacing it keeps a raw `failed`
    // count from misreading as "blocking" on human PRs.
    optionalFailed: failed - requiredFailed,
    blockedBy: [...v.blockedBy],
    headline,
  };
}

const paint = (on: boolean, code: string, s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);

/** Compact terminal digest: identity line · counts · headline. */
export function formatSummaryText(s: VerdictSummary, useColor: boolean): string {
  const classTag = s.authorClass === "agent" ? paint(useColor, "33", "agent") : "human";
  const dim = (x: string) => paint(useColor, "2", x);
  const counts =
    `${s.total} gates · ${paint(useColor, "32", `${s.passed} ✔`)} · ` +
    `${paint(useColor, "31", `${s.failed} ✘`)} · ${dim(`${s.skipped} skipped`)}` +
    (s.optionalFailed > 0 ? dim(`  (${s.optionalFailed} optional)`) : "");
  const headline = s.pass
    ? paint(useColor, "1;32", s.headline)
    : paint(useColor, "1;31", s.headline);
  return [
    paint(useColor, "1", "mergegate") + dim(` · ${s.protectedBranch} · ${s.author} [`) + classTag + dim("]"),
    `  ${counts}`,
    `  ${headline}`,
  ].join("\n");
}

/** The flat summary object, for dashboards / scripts. */
export function formatSummaryJson(s: VerdictSummary): string {
  return JSON.stringify(s, null, 2);
}

/** A single-line PR-comment headline (carries the upsert marker, NOT the full table). */
export function formatSummaryMarkdown(s: VerdictSummary): string {
  const badge = s.pass ? "✅ PASS" : "❌ BLOCKED";
  const tally = `${s.passed}/${s.total} gates green`;
  const fails = s.pass ? "" : ` · **${s.requiredFailed}/${s.total}** blocking: ${s.blockedBy.map((n) => `\`${n}\``).join(", ")}`;
  return [
    MARKDOWN_MARKER,
    `${badge} — **mergegate** \`${s.protectedBranch}\` · ${s.author} \`[${s.authorClass}]\` — ${tally}${fails}`,
  ].join("\n");
}
