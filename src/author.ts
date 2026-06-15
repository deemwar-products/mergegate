import type { AuthorClass } from "./types.ts";

/**
 * Classify a change author as "agent" or "human" by matching "<name> <email>"
 * against the policy's agent-author patterns (case-insensitive regex).
 */
export function classifyAuthor(author: string, patterns: string[]): AuthorClass {
  const hay = author.toLowerCase();
  for (const p of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(p, "i");
    } catch {
      // Treat an invalid regex as a literal substring.
      if (hay.includes(p.toLowerCase())) return "agent";
      continue;
    }
    if (re.test(author)) return "agent";
  }
  return "human";
}
