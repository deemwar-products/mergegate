// End-to-end through the real CLI dispatcher: the `summary` command + `check --format
// summary`. Doubles as the dogfood — a real config, real gate execution, real exit codes.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../src/cli.ts";
import { MARKDOWN_MARKER } from "../src/report.ts";

let dir: string;

// capture stdout from main()'s console.log
function run(args: string[]): { code: number; out: string } {
  const orig = console.log;
  let out = "";
  console.log = (...a: unknown[]) => { out += a.join(" ") + "\n"; };
  try {
    const code = main(args);
    return { code, out };
  } finally {
    console.log = orig;
  }
}

function writeConfig(gates: Record<string, unknown>) {
  writeFileSync(join(dir, "mergegate.config.json"), JSON.stringify({ version: 1, protectedBranch: "main", gates }));
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "mg-summary-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// No git repo in `dir` ⇒ no commit messages ⇒ the builtin spec gate fails deterministically.
test("summary: agent change with a failing required gate → BLOCKED, exit 1", () => {
  writeConfig({ spec: { builtin: "spec" }, build: { run: "true" } });
  const { code, out } = run(["summary", "--dir", dir, "--agent"]);
  expect(code).toBe(1);
  expect(out).toContain("agent");
  expect(out).toContain("BLOCKED");
  expect(out).toContain("spec");
  expect(out).toContain("2 gates"); // it's the digest, with counts
});

test("summary --json: structured digest, exit tracks the verdict", () => {
  writeConfig({ spec: { builtin: "spec" }, build: { run: "true" } });
  const { code, out } = run(["summary", "--dir", dir, "--agent", "--json"]);
  expect(code).toBe(1);
  const s = JSON.parse(out);
  expect(s.authorClass).toBe("agent");
  expect(s.total).toBe(2);
  expect(s.passed).toBe(1);
  expect(s.requiredFailed).toBe(1);
  expect(s.pass).toBe(false);
  expect(s.blockedBy).toContain("spec");
});

test("summary --markdown: one-line headline with the upsert marker", () => {
  writeConfig({ spec: { builtin: "spec" }, build: { run: "true" } });
  const { out } = run(["summary", "--dir", dir, "--agent", "--markdown"]);
  expect(out).toContain(MARKDOWN_MARKER);
  expect(out).toContain("BLOCKED");
  expect(out).not.toContain("| Gate | Status | Detail |"); // not the full table
});

test("summary: human change, optional gate fails but doesn't block → PASS exit 0, optionalFailed counted", () => {
  writeConfig({ build: { run: "true" }, lint: { run: "false", required: false } });
  const { code, out } = run(["summary", "--dir", dir, "--human", "--json"]);
  expect(code).toBe(0);
  const s = JSON.parse(out);
  expect(s.authorClass).toBe("human");
  expect(s.pass).toBe(true);
  expect(s.requiredFailed).toBe(0);
  expect(s.optionalFailed).toBe(1);
});

test("check --format summary reaches the same digest renderer", () => {
  writeConfig({ spec: { builtin: "spec" }, build: { run: "true" } });
  const { code, out } = run(["check", "--dir", dir, "--agent", "--format", "summary"]);
  expect(code).toBe(1);
  expect(out).toContain("2 gates");
  expect(out).toContain("BLOCKED");
});

test("summary: a config error exits 2 (same as check)", () => {
  // no config file written
  const { code } = run(["summary", "--dir", dir, "--agent"]);
  expect(code).toBe(2);
});
