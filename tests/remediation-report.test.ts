// Surfacing rules: remediation shows in the report/markdown ONLY for gates that
// actually block the verdict — an optional failing gate must not nag.
import { test, expect } from "bun:test";
import { formatReport, formatMarkdown } from "../src/report.ts";
import type { Verdict, GateResult } from "../src/types.ts";

const g = (name: string, status: GateResult["status"], required: boolean, remediation?: string): GateResult => ({
  name, status, required, durationMs: 5, reason: `${name} ${status}`, remediation,
});

// agent PR: spec + lint both fail; spec blocks, lint is optional-but-failing.
const verdict: Verdict = {
  pass: false,
  authorClass: "agent",
  author: "copilot-swe-agent <bot@users.noreply.github.com>",
  protectedBranch: "main",
  gates: [
    g("spec", "fail", true, "Reference a spec or issue in every commit."),
    g("build", "pass", true),
    g("lint", "fail", false, "Run `npm run lint` locally, fix what it reports, then push."),
  ],
  blockedBy: ["spec"], // only spec blocks; lint failed but isn't required here
};

test("terminal report shows a fix line for the blocking gate", () => {
  const out = formatReport(verdict);
  expect(out).toContain("→ fix:");
  expect(out).toContain("Reference a spec or issue");
});

test("terminal report does NOT show a fix for a non-blocking (optional) failing gate", () => {
  const out = formatReport(verdict);
  expect(out).not.toContain("Run `npm run lint`");
});

test("markdown has a How to fix section listing only blocking gates", () => {
  const md = formatMarkdown(verdict);
  expect(md).toContain("**How to fix**");
  expect(md).toContain("- **spec** —");
  expect(md).toContain("Reference a spec or issue");
  expect(md).not.toContain("- **lint** —"); // optional fail not nagged
});

test("a clean PASS verdict has no How to fix section", () => {
  const ok: Verdict = {
    pass: true, authorClass: "human", author: "Jo <jo@x.com>", protectedBranch: "main",
    gates: [g("build", "pass", true)], blockedBy: [],
  };
  expect(formatMarkdown(ok)).not.toContain("How to fix");
  expect(formatReport(ok)).not.toContain("→ fix:");
});
