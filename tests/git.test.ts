import { test, expect, describe } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { branchCommitMessages } from "../src/git";

/** A throwaway repo whose `main` is the gate's base, with a feature commit and a
 *  synthetic "Merge <head> into <base>" commit on HEAD — exactly what GitHub checks
 *  out for a `pull_request` event. */
function repoWithMergeCommit(): string {
  const dir = mkdtempSync(join(tmpdir(), "mg-git-"));
  const git = (args: string[]) => spawnSync("git", args, { cwd: dir });
  const write = (msg: string) => {
    writeFileSync(join(dir, "f.txt"), msg);
    git(["add", "-A"]);
    git(["commit", "-qm", msg]);
  };
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "t"]);
  git(["config", "user.email", "t@e.co"]);
  write("chore: init (spec 1)"); // base == origin/main

  git(["checkout", "-q", "-b", "feature"]);
  write("feat: storyboard (spec 22750)"); // the only real PR commit

  // Synthetic PR merge commit on a detached ref, leaving `main` (the base) at its
  // tip — exactly as GitHub builds refs/pull/N/merge without moving origin/main.
  git(["checkout", "-q", "-b", "pr-merge", "main"]);
  git(["merge", "--no-ff", "-q", "-m", "Merge feature into main", "feature"]);
  return dir;
}

describe("branchCommitMessages", () => {
  test("excludes the synthetic PR merge commit (no spec ref), keeps real commits", () => {
    const dir = repoWithMergeCommit();
    try {
      const msgs = branchCommitMessages(dir, "main");
      // HEAD is the merge commit; merge-base(main, HEAD) is the base tip, so the
      // raw range is {feat commit, merge commit}. --no-merges must drop the merge.
      expect(msgs).toContain("feat: storyboard (spec 22750)");
      expect(msgs.some((m) => m.startsWith("Merge "))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
