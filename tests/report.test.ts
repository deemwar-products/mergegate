import { test, expect, describe } from "bun:test";
import { formatMarkdown } from "../src/report.ts";
import type { Verdict, GateResult } from "../src/types.ts";

const gr = (name: string, status: GateResult["status"], required: boolean, reason = ""): GateResult => ({
  name, status, required, durationMs: 5, reason,
});

const blocked: Verdict = {
  pass: false,
  authorClass: "agent",
  author: "copilot-swe-agent <bot@users.noreply.github.com>",
  protectedBranch: "main",
  gates: [gr("spec", "fail", true, "no spec ref"), gr("build", "pass", true, "`npm run build` passed"), gr("tests", "fail", true, "`npm test` exited 1")],
  blockedBy: ["spec", "tests"],
};

const passed: Verdict = {
  pass: true,
  authorClass: "human",
  author: "Muthu <m@example.com>",
  protectedBranch: "main",
  gates: [gr("build", "pass", true, "ok"), gr("checks", "fail", false, "lint warned")],
  blockedBy: [],
};

describe("formatMarkdown", () => {
  test("blocked: header marks failure + protected branch", () => {
    const md = formatMarkdown(blocked);
    expect(md).toContain("BLOCKED");
    expect(md).toContain("`main`");
    expect(md).toContain("❌");
  });

  test("blocked: lists the blocking gates", () => {
    const md = formatMarkdown(blocked);
    expect(md).toContain("`spec`");
    expect(md).toContain("`tests`");
  });

  test("blocked: agent note is present", () => {
    expect(formatMarkdown(blocked)).toMatch(/agent-authored/i);
  });

  test("renders a gate table row per gate with status", () => {
    const md = formatMarkdown(blocked);
    expect(md).toContain("| Gate | Status |");
    // one row per gate
    expect(md.match(/\| (spec|build|tests) \|/g)?.length).toBe(3);
  });

  test("pass: header marks success, no agent note", () => {
    const md = formatMarkdown(passed);
    expect(md).toContain("✅");
    expect(md).toMatch(/clear to merge/i);
    expect(md).not.toMatch(/agent-authored/i);
  });

  test("pass: optional failing gate shown but not in blockedBy", () => {
    const md = formatMarkdown(passed);
    expect(md).toContain("checks");
    expect(md).toContain("optional");
  });

  test("carries a mergegate marker for comment upserts", () => {
    expect(formatMarkdown(blocked)).toContain("<!-- mergegate -->");
  });
});
