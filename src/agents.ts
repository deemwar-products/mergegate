// The built-in registry of known coding agents.
//
// This is the single source of truth for "who is an autonomous agent". The flat
// `DEFAULT_AGENT_AUTHORS` pattern list (consumed by the classifier and config) is
// DERIVED from it, so adding an agent is a one-entry PR — the contribution loop.
//
// SAFETY RULE (read before adding an entry): mergegate's whole promise is to gate
// agents WITHOUT blocking humans. So every pattern must anchor to an identity a human
// cannot accidentally own — a GitHub App `[bot]` login or a vendor noreply/email
// domain — NEVER a bare first name. "devin", "claude", "cursor", "codex" are real
// human names; matching them bare would block a contributor named Devin. Anchor instead
// (`devin-ai-integration`, `noreply@anthropic.com`, `@cursor.com`, `chatgpt-codex`).
// The `tests/agents.test.ts` canary enforces this — humans named like agents stay human.

import { classifyAuthor } from "./author.ts";

export interface AgentEntry {
  /** Stable kebab-case key — unique, used in `agents` output and community PRs. */
  id: string;
  /** Human-readable display name. */
  label: string;
  /** Case-insensitive regex patterns matched against "<name> <email>". Anchored to
   *  bot-login / noreply-domain forms (see SAFETY RULE above). */
  match: string[];
  /** Optional homepage, for provenance in `--json` / the README. */
  url?: string;
}

export const AGENTS: AgentEntry[] = [
  { id: "copilot-swe-agent", label: "GitHub Copilot coding agent",
    match: ["copilot-swe-agent", "copilot\\[bot\\]"], url: "https://github.com/features/copilot" },
  { id: "cursor", label: "Cursor Agent",
    match: ["cursoragent", "@cursor\\.com"], url: "https://cursor.com" },
  { id: "devin", label: "Devin (Cognition)",
    match: ["devin-ai-integration", "devin\\[bot\\]"], url: "https://devin.ai" },
  { id: "claude-code", label: "Claude Code",
    match: ["noreply@anthropic\\.com", "claude\\[bot\\]"], url: "https://claude.com/claude-code" },
  { id: "codex", label: "OpenAI Codex",
    match: ["chatgpt-codex", "codex\\[bot\\]"], url: "https://openai.com/codex" },
  { id: "dependabot", label: "Dependabot",
    match: ["dependabot\\[bot\\]", "dependabot"], url: "https://github.com/dependabot" },
  { id: "github-actions", label: "GitHub Actions bot",
    match: ["github-actions\\[bot\\]", "github-actions", "41898282\\+github-actions"], url: "https://docs.github.com/actions" },
  { id: "renovate", label: "Renovate bot",
    match: ["renovate\\[bot\\]", "renovate-bot"], url: "https://github.com/renovatebot/renovate" },
  { id: "jules", label: "Jules (Google)",
    match: ["google-labs-jules", "jules\\[bot\\]"], url: "https://jules.google" },
  { id: "sweep", label: "Sweep",
    match: ["sweep-ai\\[bot\\]", "sweep\\[bot\\]"], url: "https://sweep.dev" },
  { id: "aider", label: "Aider",
    match: ["aider\\[bot\\]"], url: "https://aider.chat" },
  { id: "deemwar-agent", label: "deemwar fleet agent",
    match: ["agents@deemwar\\.com"], url: "https://deemwar.com" },
  // Generic catch-all: GitHub Apps / bot identities always end in "[bot]" — a suffix
  // a human account cannot register. Kept LAST so specific entries label first.
  { id: "generic-bot", label: "Generic [bot] account",
    match: ["\\[bot\\]"] },
];

/** Single source of truth: the flat pattern list the policy + classifier consume. */
export const DEFAULT_AGENT_AUTHORS: string[] = AGENTS.flatMap((a) => a.match);

/** Which registry entry (if any) classifies this "<name> <email>" as an agent.
 *  Reuses the production classifier, so `agents` can never disagree with the gate. */
export function matchAgent(author: string): AgentEntry | null {
  for (const a of AGENTS) {
    if (classifyAuthor(author, a.match) === "agent") return a;
  }
  return null;
}

/** Like matchAgent, but also reports the specific pattern that fired — for the
 *  `agents --author` / `agents check` auditor ("why was this flagged?"). */
export function explainMatch(author: string): { entry: AgentEntry; pattern: string } | null {
  for (const a of AGENTS) {
    for (const p of a.match) {
      if (classifyAuthor(author, [p]) === "agent") return { entry: a, pattern: p };
    }
  }
  return null;
}
