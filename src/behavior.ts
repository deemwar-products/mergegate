// Behavioral agent detection — the signal the identity string alone misses.
//
// The registry (src/agents.ts) classifies by WHO authored the commit: the "<name>
// <email>" on HEAD. That catches an agent that commits under its own bot identity.
// It MISSES the increasingly common case where a human runs Claude Code / Copilot /
// Cursor locally and commits under THEIR OWN name+email — the authorship line says
// "human", so the lax human policy applies, and an unreviewed agent diff slips onto
// the protected branch. That is exactly the leak mergegate exists to stop.
//
// But those agents leave an unmistakable fingerprint in the commit MESSAGE: a
// `Co-Authored-By:` trailer naming the tool (e.g. `Co-Authored-By: Claude
// <noreply@anthropic.com>`). This module reads that behavioral signal.
//
// DESIGN RULE: do NOT invent a second pattern list. The co-author identity is run
// through the SAME registry (`matchAgent`) that powers authorship detection — so the
// anchored, human-safe patterns (and the `tests/agents.test.ts` canary that keeps a
// human named "Claude" human) govern this surface for free. A check only fires when a
// trailer names an identity the registry already recognizes as an agent.

import { matchAgent, type AgentEntry } from "./agents.ts";

// `Co-authored-by:` is the Git-native trailer agents append (case-insensitive in the
// wild). Capture the rest of the line — the "<name> <email>" of the co-author.
const COAUTHOR_RE = /^[ \t]*Co-authored-by:[ \t]*(.+?)[ \t]*$/gim;

export interface BehaviorSignal {
  /** The registry entry the co-author matched — its label names the agent in the verdict. */
  entry: AgentEntry;
  /** The trailer line that fired, normalized — shown as the verdict's evidence. */
  evidence: string;
}

/**
 * Scan full commit messages (subject + body) for a `Co-Authored-By:` trailer whose
 * identity the agent registry recognizes. Returns the first match, or null.
 *
 * Pure and dependency-free: the caller supplies the commit texts (see
 * `branchCommitTexts` in git.ts), so this is trivially testable.
 */
export function detectAgentSignal(commitTexts: string[]): BehaviorSignal | null {
  for (const text of commitTexts) {
    // matchAll needs the regex re-evaluated per text; the literal is stateless between
    // loops because we never reuse a stale lastIndex (fresh matchAll each iteration).
    for (const m of text.matchAll(COAUTHOR_RE)) {
      const coauthor = m[1]!.trim();
      const entry = matchAgent(coauthor);
      if (entry) return { entry, evidence: `Co-authored-by: ${coauthor}` };
    }
  }
  return null;
}
