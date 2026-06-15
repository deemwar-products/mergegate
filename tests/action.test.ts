import { test, expect, describe, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "mergegate.mjs");
const ENTRY = join(ROOT, "action", "entrypoint.sh");

function sandbox(author: { name: string; email: string }, lintExit: number, commitMsg: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mg-action-"));
  const git = (args: string[]) => spawnSync("git", args, { cwd: dir });
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", author.name]);
  git(["config", "user.email", author.email]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "s", scripts: { build: "echo ok", test: "echo ok", lint: `exit ${lintExit}` },
  }));
  writeFileSync(join(dir, "mergegate.config.json"), JSON.stringify({
    version: 1,
    gates: {
      build: { run: "npm run build", required: true },
      tests: { run: "npm test", required: true },
      checks: { run: "npm run lint", required: false },
    },
    policy: { agent: { requireAll: true }, human: { requireAll: false } },
  }));
  git(["add", "-A"]);
  git(["commit", "-qm", commitMsg]);
  return dir;
}

function runEntrypoint(dir: string, env: Record<string, string>) {
  const out = join(dir, "verdict.md");
  const res = spawnSync("bash", [ENTRY], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, MG_BIN: BIN, MG_COMMENT: "false", MG_OUT: out, MG_BASE: "main", ...env },
  });
  return { res, out };
}

describe("action entrypoint", () => {
  beforeAll(() => {
    // The bundled binary must exist; build it if missing.
    spawnSync("bun", ["build", "./src/cli.ts", "--target=node", `--outfile=${BIN}`], { cwd: ROOT });
  });

  test("agent PR with a red optional check → exit 1 (BLOCKED) and writes verdict", () => {
    const dir = sandbox({ name: "copilot-swe-agent", email: "bot@users.noreply.github.com" }, 1, "feat (spec 1)");
    const { res, out } = runEntrypoint(dir, {});
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("BLOCKED");
    const md = spawnSync("cat", [out], { encoding: "utf8" }).stdout;
    expect(md).toContain("<!-- mergegate -->");
    rmSync(dir, { recursive: true, force: true });
  });

  test("same change as a human → exit 0 (optional check waived)", () => {
    const dir = sandbox({ name: "Muthu", email: "m@example.com" }, 1, "feat (spec 1)");
    const { res } = runEntrypoint(dir, {});
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("clear to merge");
    rmSync(dir, { recursive: true, force: true });
  });

  test("forced agent author input overrides detection", () => {
    const dir = sandbox({ name: "Muthu", email: "m@example.com" }, 1, "feat (spec 1)");
    const { res } = runEntrypoint(dir, { MG_AUTHOR: "copilot-swe-agent <bot@x>" });
    expect(res.status).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
