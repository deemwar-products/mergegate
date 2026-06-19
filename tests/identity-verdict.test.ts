// Identity rules tune gate-requirements within a class — they never re-classify,
// and a rule that LOOSENS an agent's gates is surfaced (the safety signal).
import { test, expect } from "bun:test";
import { evaluate } from "../src/verdict.ts";
import type { MergegateConfig, EvalContext } from "../src/types.ts";

// four no-op gates (all "pass") so we test REQUIREMENT logic, not gate execution.
const cfg = (identities: unknown[]): MergegateConfig => ({
  version: 1,
  protectedBranch: "main",
  gates: {
    spec: { run: "true", required: true },
    build: { run: "true", required: true },
    tests: { run: "true", required: true },
    checks: { run: "true", required: false },
  },
  policy: {
    agentAuthors: ["dependabot", "copilot-swe-agent"],
    agent: { requireAll: true },
    human: { requireAll: false },
    identities: identities as never,
  },
});

const ctx = (author: string): EvalContext => ({ cwd: "/tmp", author, commitMessages: ["x"], forceClass: undefined });

test("a requireGates rule narrows which gates are required for that identity", () => {
  const v = evaluate(cfg([{ match: "dependabot", label: "bumps", requireGates: ["tests", "build"] }]),
    ctx("dependabot[bot] <dependabot@github.com>"));
  expect(v.authorClass).toBe("agent");        // classification UNCHANGED
  expect(v.appliedRule).toBe("bumps");
  // spec + checks are no longer required for dependabot → loosened (vs agent-default all)
  expect(v.loosenedGates?.sort()).toEqual(["checks", "spec"]);
});

test("an identity rule does NOT re-classify — an agent stays an agent", () => {
  // a rule could try to relax, but the author is still classified agent by agentAuthors
  const v = evaluate(cfg([{ match: "dependabot", label: "x", requireAll: false }]),
    ctx("dependabot[bot] <dependabot@github.com>"));
  expect(v.authorClass).toBe("agent");
});

test("no matching rule → today's class default (agent → all gates required), no appliedRule", () => {
  const v = evaluate(cfg([{ match: "renovate", requireGates: ["tests"] }]),
    ctx("copilot-swe-agent <copilot@users.noreply.github.com>"));
  expect(v.appliedRule).toBeUndefined();
  expect(v.loosenedGates ?? []).toEqual([]);
});

test("a non-loosening rule (requireAll:true) reports no loosened gates", () => {
  const v = evaluate(cfg([{ match: "copilot", label: "strict-bot", requireAll: true }]),
    ctx("copilot-swe-agent <copilot@users.noreply.github.com>"));
  expect(v.appliedRule).toBe("strict-bot");
  expect(v.loosenedGates ?? []).toEqual([]);
});

test("loosened gates are only flagged for AGENT authors, not humans", () => {
  // a human already honors per-gate required; relaxing isn't a safety regression
  const v = evaluate(cfg([{ match: "jane", label: "trusted", requireGates: ["tests"] }]),
    ctx("Jane Dev <jane@example.com>"));
  expect(v.authorClass).toBe("human");
  expect(v.loosenedGates ?? []).toEqual([]);
});
