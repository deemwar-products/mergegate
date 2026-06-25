import { test, expect, describe, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
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
  // Gate commands are plain shell (echo / exit), NOT `npm run …`: mergegate's own
  // action runs `bun test` in a context where `npm` is not on PATH, so an
  // npm-dependent fixture failed CI even though the scenario under test is purely
  // identity policy (required gates pass; the optional check's exit drives the
  // agent-blocks / human-waives split). Shell builtins are always present. (#24881)
  writeFileSync(join(dir, "mergegate.config.json"), JSON.stringify({
    version: 1,
    gates: {
      build: { run: "echo ok", required: true },
      tests: { run: "echo ok", required: true },
      checks: { run: `exit ${lintExit}`, required: false },
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
    // The bundled binary must exist; build it the SAME way `npm run build` does —
    // with the shebang banner — so the test never clobbers the committed bin.
    spawnSync(
      "bun",
      ["build", "./src/cli.ts", "--target=node", `--outfile=${BIN}`, "--banner", "#!/usr/bin/env node"],
      { cwd: ROOT },
    );
  });

  test("bundled bin keeps its shebang (it's the package `bin` entry)", () => {
    const first = spawnSync("head", ["-1", BIN], { encoding: "utf8" }).stdout.trim();
    expect(first).toBe("#!/usr/bin/env node");
  });

  test("agent PR with a red optional check → exit 1 (BLOCKED) and writes verdict", () => {
    const dir = sandbox({ name: "copilot-swe-agent", email: "bot@users.noreply.github.com" }, 1, "feat (spec 1)");
    const { res, out } = runEntrypoint(dir, {});
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("BLOCKED");
    const md = spawnSync("cat", [out], { encoding: "utf8" }).stdout;
    expect(md).toContain("<!-- mergegate -->");
    rmSync(dir, { recursive: true, force: true });
  }, 20000);

  test("same change as a human → exit 0 (optional check waived)", () => {
    const dir = sandbox({ name: "Jordan Lee", email: "jordan@example.com" }, 1, "feat (spec 1)");
    const { res } = runEntrypoint(dir, {});
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("clear to merge");
    rmSync(dir, { recursive: true, force: true });
  }, 20000);

  test("forced agent author input overrides detection", () => {
    const dir = sandbox({ name: "Jordan Lee", email: "jordan@example.com" }, 1, "feat (spec 1)");
    const { res } = runEntrypoint(dir, { MG_AUTHOR: "copilot-swe-agent <bot@x>" });
    expect(res.status).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  }, 20000);

  test("config error (empty verdict) does NOT post a PR comment", () => {
    // No mergegate.config.json → the gate exits 2 with nothing on stdout (the error
    // goes to stderr), so MG_OUT is empty. The comment upsert must be skipped, or a
    // public PR gets an empty "mergegate" comment that looks broken.
    const dir = mkdtempSync(join(tmpdir(), "mg-action-cfg-"));
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    // Stub `gh` on PATH that records every invocation — if it's ever called, the guard failed.
    const bindir = join(dir, "bin");
    mkdirSync(bindir);
    const ghLog = join(dir, "gh-calls.log");
    writeFileSync(join(bindir, "gh"), `#!/usr/bin/env bash\necho "$@" >> "${ghLog}"\n`, { mode: 0o755 });
    const out = join(dir, "verdict.md");
    const res = spawnSync("bash", [ENTRY], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bindir}:${process.env.PATH}`,
        MG_BIN: BIN, MG_BASE: "main", MG_OUT: out,
        MG_COMMENT: "true", GH_TOKEN: "x", MG_PR: "1", GITHUB_REPOSITORY: "o/r",
      },
    });
    expect(res.status).toBe(2);
    expect(existsSync(ghLog)).toBe(false); // gh never invoked → no comment attempted
    rmSync(dir, { recursive: true, force: true });
  }, 20000);
});
