import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cmdChecks,
  formatChecksList,
  formatCheckDetail,
} from "../src/commands/checks.ts";
import { CHECKS, findCheck, checksByCategory } from "../src/checks.ts";

function capture(fn: () => number): { code: number; out: string; err: string } {
  const logs: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(" ")); };
  try {
    const code = fn();
    return { code, out: logs.join("\n"), err: errs.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

const tmpDirs: string[] = [];
function freshConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mg-checks-"));
  tmpDirs.push(dir);
  writeFileSync(
    join(dir, "mergegate.config.json"),
    JSON.stringify({ version: 1, protectedBranch: "main", gates: { spec: { builtin: "spec", required: true } } }, null, 2) + "\n",
  );
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("checks list / show formatting", () => {
  test("list shows every id and the contribution hints, no ANSI when color off", () => {
    const out = formatChecksList(CHECKS, false);
    for (const c of CHECKS) expect(out).toContain(c.id);
    expect(out).toContain("checks add");
    expect(out).not.toContain("\x1b["); // no ANSI escape when color is off
  });

  test("detail prints the gate snippet as valid pasteable JSON", () => {
    const c = findCheck("no-private-keys")!;
    const out = formatCheckDetail(c, false);
    expect(out).toContain(c.why);
    // The snippet (indented) must parse back to the gate under its gateName.
    const jsonText = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1).replace(/^ {2}/gm, "");
    const parsed = JSON.parse(jsonText);
    expect(parsed[c.gateName].run).toBe(c.gate.run);
  });
});

describe("checks command dispatch", () => {
  test("`checks --stack go` lists only go checks", () => {
    const { code, out } = capture(() => cmdChecks(["--stack", "go"]));
    expect(code).toBe(0);
    for (const c of checksByCategory("go")) expect(out).toContain(c.id);
    expect(out).not.toContain("no-private-keys"); // a hygiene check, filtered out
  });

  test("`checks --stack bogus` errors with exit 2", () => {
    const { code, err } = capture(() => cmdChecks(["--stack", "bogus"]));
    expect(code).toBe(2);
    expect(err).toContain("unknown category");
  });

  test("`checks --json` emits the filtered array", () => {
    const { code, out } = capture(() => cmdChecks(["--json", "--stack", "rust"]));
    expect(code).toBe(0);
    const arr = JSON.parse(out);
    expect(arr.every((c: { category: string }) => c.category === "rust")).toBe(true);
  });

  test("`checks show <id>` returns the entry; unknown id → exit 2", () => {
    expect(capture(() => cmdChecks(["show", "gofmt"])).code).toBe(0);
    expect(capture(() => cmdChecks(["show", "nope"])).code).toBe(2);
    expect(capture(() => cmdChecks(["show"])).code).toBe(2);
  });
});

describe("checks add", () => {
  test("appends the gate to the config and is idempotent", () => {
    const dir = freshConfigDir();
    const first = capture(() => cmdChecks(["add", "no-conflict-markers", "--dir", dir]));
    expect(first.code).toBe(0);
    let cfg = JSON.parse(readFileSync(join(dir, "mergegate.config.json"), "utf8"));
    expect(cfg.gates["no-conflict-markers"].run).toBe(findCheck("no-conflict-markers")!.gate.run);

    // Re-adding the same check changes nothing.
    const second = capture(() => cmdChecks(["add", "no-conflict-markers", "--dir", dir]));
    expect(second.out.toLowerCase()).toContain("skipped");
    cfg = JSON.parse(readFileSync(join(dir, "mergegate.config.json"), "utf8"));
    expect(Object.keys(cfg.gates).filter((k) => k.startsWith("no-conflict-markers"))).toHaveLength(1);
  });

  test("collision on a shared gateName suffixes instead of clobbering", () => {
    const dir = freshConfigDir();
    // 'eslint' and 'prettier-check' both suggest different keys, but two checks that
    // suggest the SAME key (e.g. node lint vs python lint) must not overwrite.
    capture(() => cmdChecks(["add", "eslint", "--dir", dir])); // → gate "lint"
    capture(() => cmdChecks(["add", "ruff", "--dir", dir]));   // also suggests "lint"
    const cfg = JSON.parse(readFileSync(join(dir, "mergegate.config.json"), "utf8"));
    expect(cfg.gates["lint"]).toBeDefined();
    expect(cfg.gates["lint-2"]).toBeDefined();
  });

  test("unknown id → exit 2; missing config → exit 2; no id → exit 2", () => {
    const dir = freshConfigDir();
    expect(capture(() => cmdChecks(["add", "nope", "--dir", dir])).code).toBe(2);
    expect(capture(() => cmdChecks(["add", "--dir", dir])).code).toBe(2);
    const emptyDir = mkdtempSync(join(tmpdir(), "mg-noconfig-"));
    tmpDirs.push(emptyDir);
    expect(capture(() => cmdChecks(["add", "gofmt", "--dir", emptyDir])).code).toBe(2);
  });
});
