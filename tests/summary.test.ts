import { test, expect } from "bun:test";
import { summarize, formatSummaryText, formatSummaryJson, formatSummaryMarkdown } from "../src/summary.ts";
import { MARKDOWN_MARKER } from "../src/report.ts";
import type { Verdict, GateResult } from "../src/types.ts";

function gate(name: string, status: GateResult["status"], required = true): GateResult {
  return { name, status, required, durationMs: 12, reason: `${name} ${status}` };
}

// An agent PR: 4 gates, spec + tests failing (required) → BLOCKED.
const blocked: Verdict = {
  pass: false,
  authorClass: "agent",
  author: "copilot-swe-agent <copilot@users.noreply.github.com>",
  protectedBranch: "main",
  gates: [gate("spec", "fail"), gate("build", "pass"), gate("tests", "fail"), gate("checks", "skipped")],
  blockedBy: ["spec", "tests"],
};

// A human PR: one optional gate failed but it's not required → PASS.
const passWithOptionalFail: Verdict = {
  pass: true,
  authorClass: "human",
  author: "Devin Smith <devin@example.com>",
  protectedBranch: "main",
  gates: [gate("build", "pass"), gate("tests", "pass"), gate("lint", "fail", false)],
  blockedBy: [],
};

test("summarize counts pass/fail/skipped across all gates", () => {
  const s = summarize(blocked);
  expect(s.total).toBe(4);
  expect(s.passed).toBe(1);
  expect(s.failed).toBe(2);
  expect(s.skipped).toBe(1);
});

test("requiredFailed mirrors blockedBy; optionalFailed counts non-required fails", () => {
  expect(summarize(blocked).requiredFailed).toBe(2);
  expect(summarize(blocked).optionalFailed).toBe(0);

  const s = summarize(passWithOptionalFail);
  expect(s.requiredFailed).toBe(0); // the failing gate is optional → doesn't block
  expect(s.optionalFailed).toBe(1);
  expect(s.failed).toBe(1);
});

test("headline + pass reflect the verdict", () => {
  const b = summarize(blocked);
  expect(b.pass).toBe(false);
  expect(b.headline).toContain("BLOCKED");
  expect(b.headline).toContain("spec");
  expect(b.headline).toContain("tests");

  const p = summarize(passWithOptionalFail);
  expect(p.pass).toBe(true);
  expect(p.headline).toContain("PASS");
});

test("summarize carries author identity through", () => {
  const s = summarize(blocked);
  expect(s.author).toBe(blocked.author);
  expect(s.authorClass).toBe("agent");
  expect(s.protectedBranch).toBe("main");
  expect(s.blockedBy).toEqual(["spec", "tests"]);
});

test("summarize is pure — does not mutate the verdict", () => {
  const snapshot = JSON.stringify(blocked);
  summarize(blocked);
  expect(JSON.stringify(blocked)).toBe(snapshot);
});

test("text summary shows author class, counts, and headline (no per-gate detail dump)", () => {
  const out = formatSummaryText(summarize(blocked), false);
  expect(out).toContain("agent");
  expect(out).toContain("4 gates");
  expect(out).toContain("BLOCKED");
  // it's a digest, not the full report — no captured gate output lines
  expect(out).not.toContain("│");
});

test("json summary round-trips the structured fields", () => {
  const obj = JSON.parse(formatSummaryJson(summarize(blocked)));
  expect(obj.total).toBe(4);
  expect(obj.requiredFailed).toBe(2);
  expect(obj.pass).toBe(false);
  expect(obj.authorClass).toBe("agent");
  expect(obj.blockedBy).toEqual(["spec", "tests"]);
});

test("markdown summary is a one-line headline carrying the upsert marker (not the full table)", () => {
  const md = formatSummaryMarkdown(summarize(blocked));
  expect(md).toContain(MARKDOWN_MARKER);
  expect(md).toContain("BLOCKED");
  expect(md).toContain("2/4"); // failed/total or passed/total digest
  // compact: must NOT render the full markdown gate table
  expect(md).not.toContain("| Gate | Status | Detail |");
});

test("a clean all-pass agent verdict summarizes as PASS with zero failures", () => {
  const clean: Verdict = {
    pass: true, authorClass: "agent", author: "x <x@bot>", protectedBranch: "main",
    gates: [gate("spec", "pass"), gate("tests", "pass")], blockedBy: [],
  };
  const s = summarize(clean);
  expect(s.passed).toBe(2);
  expect(s.failed).toBe(0);
  expect(s.requiredFailed).toBe(0);
  expect(s.headline).toContain("PASS");
});
