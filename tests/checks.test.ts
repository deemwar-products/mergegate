import { test, expect, describe, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseConfig } from "../src/config.ts";
import {
  CHECKS,
  CHECK_CATEGORIES,
  findCheck,
  checksByCategory,
  type CheckEntry,
} from "../src/checks.ts";

describe("checks registry", () => {
  test("ids are unique", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every entry is fully populated and runnable", () => {
    for (const c of CHECKS) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.why.length).toBeGreaterThan(0);
      expect(c.gateName.length).toBeGreaterThan(0);
      // A gate must be evaluable: a shell command or a builtin.
      expect(Boolean(c.gate.run) || Boolean(c.gate.builtin)).toBe(true);
      expect(CHECK_CATEGORIES).toContain(c.category);
    }
  });

  test("every check's gate is a valid mergegate gate (parseConfig accepts it)", () => {
    // The whole point of the library: a check drops into a config unchanged.
    for (const c of CHECKS) {
      const cfg = parseConfig({ gates: { [c.gateName]: c.gate } }, `check:${c.id}`);
      expect(cfg.gates[c.gateName]).toBeDefined();
    }
  });

  test("findCheck resolves a known id and rejects an unknown one", () => {
    expect(findCheck("no-conflict-markers")?.label).toContain("conflict");
    expect(findCheck("does-not-exist")).toBeUndefined();
  });

  test("checksByCategory filters; undefined returns all", () => {
    expect(checksByCategory()).toHaveLength(CHECKS.length);
    const hygiene = checksByCategory("hygiene");
    expect(hygiene.length).toBeGreaterThan(0);
    expect(hygiene.every((c: CheckEntry) => c.category === "hygiene")).toBe(true);
  });

  test("ships at least the agent-smell hygiene checks and all four stacks", () => {
    for (const cat of CHECK_CATEGORIES) {
      expect(checksByCategory(cat).length).toBeGreaterThan(0);
    }
    for (const id of ["no-conflict-markers", "no-private-keys", "no-focused-tests-js"]) {
      expect(findCheck(id)).toBeDefined();
    }
  });

  test("grep-style hygiene checks use the print-then-fail idiom (offending lines surface)", () => {
    // `... && exit 1 || exit 0` makes git grep print matches AND fail the gate.
    const greps = CHECKS.filter((c) => c.gate.run?.startsWith("git grep"));
    expect(greps.length).toBeGreaterThan(0);
    for (const c of greps) {
      expect(c.gate.run).toContain("&& exit 1 || exit 0");
    }
  });
});

// Execute the grep-style gates for real against known-dirty / known-clean fixtures.
// This is the test that would have caught the non-portable `\b` (a pattern that simply
// never matches passes the gate silently — invisible to a structural assertion).
describe("grep gate commands actually fire", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

  function runGateIn(run: string, files: Record<string, string>): number {
    const dir = mkdtempSync(join(tmpdir(), "mg-grep-"));
    dirs.push(dir);
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["config", "user.email", "t@e.com"], { cwd: dir });
    spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-qm", "x"], { cwd: dir });
    return spawnSync(run, { cwd: dir, shell: true }).status ?? -1;
  }

  // [check id, dirty fixture that MUST trip it, clean fixture that MUST NOT]
  const cases: Array<[string, Record<string, string>, Record<string, string>]> = [
    ["no-conflict-markers", { "a.txt": "ok\n<<<<<<< HEAD\nx\n" }, { "a.txt": "all good\n" }],
    ["no-focused-tests-js", { "a.test.js": "describe.only('x', () => {})\n" }, { "a.test.js": "describe('x', () => {})\n" }],
    ["no-breakpoint-py", { "a.py": "import pdb\nx = 1\n" }, { "a.py": "x = 1\n" }],
    ["no-aws-keys", { "a.txt": "key=AKIAIOSFODNN7EXAMPLE\n" }, { "a.txt": "key=redacted\n" }],
  ];

  for (const [id, dirty, clean] of cases) {
    test(`${id}: fails dirty, passes clean`, () => {
      const run = findCheck(id)!.gate.run!;
      expect(runGateIn(run, dirty)).not.toBe(0);  // dirty → gate fails
      expect(runGateIn(run, clean)).toBe(0);       // clean → gate passes
    });
  }
});
