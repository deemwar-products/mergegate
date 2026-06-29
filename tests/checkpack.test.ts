import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCheckpack, loadCheckpack, CheckpackError } from "../src/checkpack.ts";
import { mergeChecks, CHECKS } from "../src/checks.ts";
import { cmdChecks } from "../src/commands/checks.ts";

function capture(fn: () => number): { code: number; out: string; err: string } {
  const logs: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(" ")); };
  try {
    return { code: fn(), out: logs.join("\n"), err: errs.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

/** A repo dir with a minimal config and, optionally, a checkpack file. */
function dirWith(pack?: object, packName = "mergegate.checks.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "mg-pack-"));
  tmpDirs.push(dir);
  writeFileSync(
    join(dir, "mergegate.config.json"),
    JSON.stringify({ version: 1, protectedBranch: "main", gates: { spec: { builtin: "spec", required: true } } }, null, 2) + "\n",
  );
  if (pack) writeFileSync(join(dir, packName), JSON.stringify(pack, null, 2) + "\n");
  return dir;
}

const LICENSE_CHECK = {
  id: "license-header",
  label: "SPDX license header present",
  why: "Every source file at AcmeCorp must carry the SPDX header; an agent scaffolding a new file forgets it.",
  gate: { run: "grep -rL 'SPDX-License-Identifier' src/ && exit 1 || exit 0", required: true },
};

describe("parseCheckpack validation", () => {
  test("accepts a well-formed pack and fills defaults (gateName→id, category→custom)", () => {
    const e = parseCheckpack({ checks: [LICENSE_CHECK] })[0]!;
    expect(e.id).toBe("license-header");
    expect(e.gateName).toBe("license-header"); // defaulted from id
    expect(e.category).toBe("custom"); // defaulted when omitted
    expect(e.gate.run).toContain("SPDX");
  });

  test("honors an explicit category and gateName", () => {
    const e = parseCheckpack({ checks: [{ ...LICENSE_CHECK, category: "node", gateName: "license" }] })[0]!;
    expect(e.category).toBe("node");
    expect(e.gateName).toBe("license");
  });

  test.each([
    [{}, "checks"],
    [{ checks: {} }, "must be an array"],
    [{ checks: [{ id: "Bad_ID", gate: { run: "true" } }] }, "kebab-case"],
    [{ checks: [{ id: "no-gate" }] }, "gate"],
    [{ checks: [{ id: "empty-gate", gate: {} }] }, "run"],
    [{ checks: [{ id: "bad-cat", category: "elixir", gate: { run: "true" } }] }, "category"],
    [{ checks: [{ id: "dup", gate: { run: "true" } }, { id: "dup", gate: { run: "true" } }] }, "duplicate"],
  ])("rejects %o", (raw, needle) => {
    expect(() => parseCheckpack(raw)).toThrow(CheckpackError);
    expect(() => parseCheckpack(raw)).toThrow(needle as string);
  });
});

describe("mergeChecks overlay", () => {
  test("a new id is appended; built-ins are preserved", () => {
    const { entries, customIds } = mergeChecks(parseCheckpack({ checks: [LICENSE_CHECK] }));
    expect(entries.length).toBe(CHECKS.length + 1);
    expect(customIds.has("license-header")).toBe(true);
    expect(entries.find((c) => c.id === "no-private-keys")).toBeDefined(); // built-in intact
  });

  test("a custom entry that reuses a built-in id REPLACES it (no duplicate)", () => {
    const override = { id: "no-aws-keys", gate: { run: "echo stricter && exit 1" }, category: "hygiene" };
    const { entries, customIds } = mergeChecks(parseCheckpack({ checks: [override] }));
    expect(entries.filter((c) => c.id === "no-aws-keys")).toHaveLength(1);
    expect(entries.find((c) => c.id === "no-aws-keys")!.gate.run).toContain("stricter");
    expect(customIds.has("no-aws-keys")).toBe(true);
    expect(entries.length).toBe(CHECKS.length); // replaced, not added
  });
});

describe("loadCheckpack discovery", () => {
  test("auto-discovers mergegate.checks.json beside the config", () => {
    const dir = dirWith({ checks: [LICENSE_CHECK] });
    const { checks, source } = loadCheckpack(dir);
    expect(checks).toHaveLength(1);
    expect(source).toContain("mergegate.checks.json");
  });

  test("no pack present → empty, source null (a pack is optional)", () => {
    const dir = dirWith();
    expect(loadCheckpack(dir)).toEqual({ checks: [], source: null });
  });

  test("an explicit --pack path that doesn't exist is an error, not a silent skip", () => {
    expect(() => loadCheckpack(dirWith(), join(tmpdir(), "nope.json"))).toThrow(CheckpackError);
  });
});

describe("checks command with a checkpack", () => {
  test("list surfaces the custom check tagged (custom)", () => {
    const dir = dirWith({ checks: [LICENSE_CHECK] });
    const { code, out } = capture(() => cmdChecks(["--dir", dir]));
    expect(code).toBe(0);
    expect(out).toContain("license-header");
    expect(out).toContain("(custom)");
    expect(out).toContain("no-private-keys"); // built-ins still listed
  });

  test("show resolves a custom id; add drops its gate into the config", () => {
    const dir = dirWith({ checks: [LICENSE_CHECK] });
    expect(capture(() => cmdChecks(["show", "license-header", "--dir", dir])).code).toBe(0);
    const { code } = capture(() => cmdChecks(["add", "license-header", "--dir", dir]));
    expect(code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, "mergegate.config.json"), "utf8"));
    expect(cfg.gates["license-header"].run).toBe(LICENSE_CHECK.gate.run);
  });

  test("--pack <path> loads a pack from an explicit location", () => {
    const dir = dirWith();
    const packPath = join(dir, "team-checks.json");
    writeFileSync(packPath, JSON.stringify({ checks: [LICENSE_CHECK] }) + "\n");
    const { code, out } = capture(() => cmdChecks(["--dir", dir, "--pack", packPath]));
    expect(code).toBe(0);
    expect(out).toContain("license-header");
  });

  test("a malformed pack fails the command with exit 2", () => {
    const dir = dirWith({ checks: [{ id: "Bad_ID", gate: { run: "true" } }] });
    const { code, err } = capture(() => cmdChecks(["--dir", dir]));
    expect(code).toBe(2);
    expect(err).toContain("kebab-case");
  });
});
