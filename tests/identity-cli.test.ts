// End-to-end: an identity rule that relaxes an agent's gates warns on stderr, and
// --strict turns that into a hard error (exit 2). Drives the real CLI dispatcher.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../src/cli.ts";

let dir: string;

function run(args: string[]): { code: number; out: string; err: string } {
  const ol = console.log, oe = console.error;
  let out = "", err = "";
  console.log = (...a: unknown[]) => { out += a.join(" ") + "\n"; };
  console.error = (...a: unknown[]) => { err += a.join(" ") + "\n"; };
  try {
    return { code: main(args), out, err };
  } finally {
    console.log = ol; console.error = oe;
  }
}

// dependabot is an agent; a rule relaxes it to only need `tests` → spec is loosened.
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mg-identity-"));
  writeFileSync(join(dir, "mergegate.config.json"), JSON.stringify({
    version: 1,
    protectedBranch: "main",
    gates: { spec: { builtin: "spec" }, tests: { run: "true" } },
    policy: {
      agentAuthors: ["dependabot"],
      identities: [{ match: "dependabot", label: "bumps", requireGates: ["tests"] }],
    },
  }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("a relaxed agent gate WARNS on stderr but still runs (exit reflects the verdict)", () => {
  const { code, err } = run(["check", "--dir", dir, "--author", "dependabot[bot] <dependabot@github.com>"]);
  expect(err).toContain("relaxed");
  expect(err).toContain("spec");           // names the dropped gate
  expect(code).not.toBe(2);                // warn-only: not the strict hard error
});

test("--strict makes a relaxed agent gate a hard error (exit 2)", () => {
  const { code, err } = run(["check", "--dir", dir, "--strict", "--author", "dependabot[bot] <dependabot@github.com>"]);
  expect(code).toBe(2);
  expect(err).toContain("--strict");
});

test("no warning when the author matches no relaxing rule", () => {
  const { err } = run(["check", "--dir", dir, "--author", "copilot-swe-agent <x@users.noreply.github.com>"]);
  expect(err).not.toContain("relaxed");
});

test("the verdict report shows the applied policy rule", () => {
  const { out } = run(["check", "--dir", dir, "--format", "json", "--author", "dependabot[bot] <dependabot@github.com>"]);
  const v = JSON.parse(out);
  expect(v.appliedRule).toBe("bumps");
  expect(v.loosenedGates).toContain("spec");
});
