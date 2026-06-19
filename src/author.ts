import type { AuthorClass, IdentityRule } from "./types.ts";

/** Does any of `patterns` match the author string? (case-insensitive regex, with an
 *  invalid-regex-as-literal-substring fallback — the shared matching rule.) */
function anyMatch(author: string, patterns: string[]): boolean {
  const hay = author.toLowerCase();
  for (const p of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(p, "i");
    } catch {
      if (hay.includes(p.toLowerCase())) return true;
      continue;
    }
    if (re.test(author)) return true;
  }
  return false;
}

/**
 * Classify a change author as "agent" or "human" by matching "<name> <email>"
 * against the policy's agent-author patterns (case-insensitive regex).
 */
export function classifyAuthor(author: string, patterns: string[]): AuthorClass {
  return anyMatch(author, patterns) ? "agent" : "human";
}

/** The FIRST identity rule (in array order) whose pattern(s) match the author, or null.
 *  Pure; tolerates an empty/undefined rule list. */
export function matchIdentity(author: string, rules: IdentityRule[] | undefined): IdentityRule | null {
  for (const r of rules ?? []) {
    const pats = Array.isArray(r.match) ? r.match : [r.match];
    if (anyMatch(author, pats)) return r;
  }
  return null;
}
