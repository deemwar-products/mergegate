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
 *
 * `--no-merges` is deliberate: a `pull_request` checkout is a synthetic "Merge <head>
 * into <base>" commit that carries no spec/issue reference, and feature branches that
 * merge `main` back in accrue integration merges too. Those aren't authored work, so
 * gating them (e.g. the spec gate) would false-positive on every Action-driven PR.
 */
export function branchCommitMessages(cwd: string, base: string): string[] {
  const merge = git(["merge-base", base, "HEAD"], cwd);
  if (merge) {
    const out = git(["log", `${merge}..HEAD`, "--no-merges", "--pretty=%s"], cwd);
    // A non-empty incoming range is the set of commits this branch introduces.
    if (out !== null && out.length > 0) return out.split("\n");
    // Empty range = on/at the base branch (no divergence). For local ergonomics,
    // fall back to the last commit so `check` still inspects real work.
  }
  const last = git(["log", "-1", "--pretty=%s"], cwd);
  return last ? [last] : [];
}

/**
 * Like {@link branchCommitMessages}, but each entry is the FULL message (subject + body)
 * — needed for behavioral classification, since agent attribution trailers
 * (`Co-Authored-By: …`) live in the body the subject-only form drops. Commits are
 * NUL-separated (`-z`) because a body is itself multi-line. Same range + fallback logic.
 */
export function branchCommitTexts(cwd: string, base: string): string[] {
  const split = (out: string | null): string[] =>
    out ? out.split("\0").map((s) => s.trim()).filter((s) => s.length > 0) : [];
  const merge = git(["merge-base", base, "HEAD"], cwd);
  if (merge) {
    const out = git(["log", `${merge}..HEAD`, "--no-merges", "-z", "--pretty=%B"], cwd);
    const texts = split(out);
    if (texts.length > 0) return texts;
  }
  return split(git(["log", "-1", "-z", "--pretty=%B"], cwd));
}

export function currentBranch(cwd: string): string | null {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

/** Unique "<name> <email>" authors of the last `n` commits, most-recent first.
 *  Powers `mergegate agents check` — auditing who has authored here against the registry. */
export function recentAuthors(cwd: string, n: number): string[] {
  const out = git(["log", `-${n}`, "--pretty=%an <%ae>"], cwd);
  if (!out) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of out.split("\n")) {
    if (line && !seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  }
  return result;
}
