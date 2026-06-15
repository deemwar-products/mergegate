import { spawnSync } from "node:child_process";

function git(args: string[], cwd: string): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0 || r.error) return null;
  return r.stdout.trim();
}

export function isGitRepo(cwd: string): boolean {
  return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}

/** The author of HEAD as "<name> <email>". */
export function headAuthor(cwd: string): string {
  const name = git(["log", "-1", "--pretty=%an"], cwd) ?? "unknown";
  const email = git(["log", "-1", "--pretty=%ae"], cwd) ?? "unknown";
  return `${name} <${email}>`;
}

/**
 * Commit subjects on the current branch that are not yet on `base`.
 * Falls back to the last commit if the base ref can't be resolved (e.g. fresh repo).
 */
export function branchCommitMessages(cwd: string, base: string): string[] {
  const merge = git(["merge-base", base, "HEAD"], cwd);
  if (merge) {
    const out = git(["log", `${merge}..HEAD`, "--pretty=%s"], cwd);
    // A non-empty incoming range is the set of commits this branch introduces.
    if (out !== null && out.length > 0) return out.split("\n");
    // Empty range = on/at the base branch (no divergence). For local ergonomics,
    // fall back to the last commit so `check` still inspects real work.
  }
  const last = git(["log", "-1", "--pretty=%s"], cwd);
  return last ? [last] : [];
}

export function currentBranch(cwd: string): string | null {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}
