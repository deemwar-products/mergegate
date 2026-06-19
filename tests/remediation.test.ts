import { test, expect } from "bun:test";
import { remediationFor } from "../src/remediation.ts";
import { DEFAULT_SPEC_PATTERN } from "../src/gates.ts";
import type { GateConfig } from "../src/types.ts";

test("no kind (a passing gate) → no suggestion", () => {
  expect(remediationFor("tests", { run: "npm test" }, null)).toBeUndefined();
  expect(remediationFor("tests", { run: "npm test" }, undefined)).toBeUndefined();
});

test("spec → reference-an-issue hint citing the pattern", () => {
  const r = remediationFor("spec", { builtin: "spec" }, "spec")!;
  expect(r.toLowerCase()).toContain("spec");
  expect(r).toContain(DEFAULT_SPEC_PATTERN); // shows the exact pattern to satisfy
});

test("spec honors a custom pattern", () => {
  const r = remediationFor("spec", { builtin: "spec", pattern: "JIRA-\\d+" }, "spec")!;
  expect(r).toContain("JIRA-\\d+");
});

test("exit → run the command locally, named", () => {
  const r = remediationFor("tests", { run: "npm test" }, "exit")!;
  expect(r).toContain("npm test");
  expect(r.toLowerCase()).toContain("locally");
});

test("timeout → points at timeoutMs", () => {
  const r = remediationFor("build", { run: "make" }, "timeout")!;
  expect(r).toContain("make");
  expect(r).toContain("timeoutMs");
});

test("spawn → points at PATH / install", () => {
  const r = remediationFor("tests", { run: "pytest" }, "spawn")!;
  expect(r).toContain("pytest");
  expect(r.toLowerCase()).toMatch(/path|install/);
});

test("fallback names the gate when there is no run command", () => {
  const r = remediationFor("custom", {} as GateConfig, "exit")!;
  expect(r).toContain("custom");
});

// Footgun guard: gate.run can come from an untrusted PR branch and ends up in a
// bot-posted PR comment. It must be flattened (no newlines) and length-capped.
test("sanitizes an untrusted run command — no newlines, length-capped", () => {
  const evil = "echo pwned\nrm -rf / # " + "A".repeat(400);
  const r = remediationFor("tests", { run: evil }, "exit")!;
  expect(r).not.toContain("\n" + "rm -rf"); // the injected newline is collapsed
  expect(r).not.toContain("rm -rf /\n");
  expect(r.length).toBeLessThan(220); // capped, not the full 400+ chars
  expect(r).toContain("…"); // truncation marker
});

test("is pure — does not mutate its inputs", () => {
  const g: GateConfig = { run: "npm test" };
  const snap = JSON.stringify(g);
  remediationFor("tests", g, "exit");
  expect(JSON.stringify(g)).toBe(snap);
});
