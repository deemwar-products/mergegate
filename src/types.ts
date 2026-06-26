// mergegate core domain types.

/** The four governance pillars every agent PR must clear. */
export type GateName = "spec" | "build" | "tests" | "checks" | (string & {});

export type GateStatus = "pass" | "fail" | "skipped";

/** A single gate definition from config. */
export interface GateConfig {
  description?: string;
  /** Shell command; the gate passes when it exits 0. */
  run?: string;
  /** Use a built-in evaluator instead of (or alongside) a shell command. */
  builtin?: "spec";
  /** Whether this gate is required for human-authored changes. Agent PRs require all gates. */
  required?: boolean;
  /** builtin:spec — regex every commit on the branch must match (proof of a spec/issue ref). */
  pattern?: string;
  /** Working timeout in ms for a `run` command. */
  timeoutMs?: number;
}

/** A per-identity override: tune WHICH gates a specific author must pass, keyed on
 *  the author string. It only adjusts gate-requirements within a class — it never
 *  re-classifies (agent stays agent). First matching rule (in array order) wins. */
export interface IdentityRule {
  /** Case-insensitive regex(es) matched against "<name> <email>" (like agentAuthors). */
  match: string | string[];
  /** Shown in the verdict so an applied rule (and any shadowing) is visible. */
  label?: string;
  /** Require every gate for this identity. Mutually exclusive with requireGates. */
  requireAll?: boolean;
  /** The explicit allow-list: ONLY these gates are required for this identity (most
   *  granular). e.g. Dependabot → ["tests", "build"] (no spec). */
  requireGates?: string[];
}

export interface PolicyConfig {
  /** Substring/regex patterns matched against "<name> <email>" to classify an author as an agent.
   *  Setting this REPLACES the built-in registry (the 13 public agents) — use only to fully
   *  redefine detection. To ADD your org's own fleet identities without losing the defaults,
   *  use `extraAgentAuthors` instead. */
  agentAuthors?: string[];
  /** Extra agent-author patterns MERGED onto the defaults (or onto `agentAuthors` if set).
   *  The right knob for "teach mergegate my fleet's commit identity" — e.g. ["bot@acme\\.dev"]. */
  extraAgentAuthors?: string[];
  /** Agent-authored changes: require every gate to pass (the core mergegate promise). Default true. */
  agent?: { requireAll?: boolean };
  /** Human-authored changes: honor each gate's own `required` flag. Default requireAll false. */
  human?: { requireAll?: boolean };
  /** Granular, identity-aware overrides applied on top of the class default. */
  identities?: IdentityRule[];
  /** Also classify by commit-message signal: when the author identity looks human but a
   *  commit carries an agent `Co-Authored-By:` trailer (someone ran Claude Code / Copilot
   *  locally), treat the change as agent. Reuses the registry; never re-classifies an
   *  agent as human. Default true; set false to gate purely on the author identity. */
  behavioralSignals?: boolean;
}

export interface MergegateConfig {
  version: number;
  /** The protected branch this gate guards. */
  protectedBranch?: string;
  gates: Record<GateName, GateConfig>;
  policy?: PolicyConfig;
}

export type AuthorClass = "agent" | "human";

export interface GateResult {
  name: GateName;
  status: GateStatus;
  required: boolean;
  durationMs: number;
  /** Short human-readable reason, especially on fail/skip. */
  reason: string;
  /** Tail of captured stdout/stderr for failed `run` gates. */
  output?: string;
  /** One actionable fix hint, set when the gate fails (see remediation.ts). */
  remediation?: string;
}

export interface Verdict {
  pass: boolean;
  authorClass: AuthorClass;
  author: string;
  protectedBranch: string;
  gates: GateResult[];
  /** Names of required gates that did not pass. */
  blockedBy: GateName[];
  /** Label (or pattern) of the identity rule that tuned this verdict's requirements, if any. */
  appliedRule?: string;
  /** For an AGENT author: gates that the agent default would require but the applied
   *  identity rule dropped — the safety signal (the gate was relaxed for an agent). */
  loosenedGates?: GateName[];
  /** Set when classification came from a commit-message signal rather than the author
   *  identity — names the agent + the trailer that fired (e.g. "Claude Code · Co-authored-by:
   *  Claude <noreply@anthropic.com>"). Surfaced so a maintainer sees WHY a human-looking
   *  author was gated as an agent. */
  behavioralSignal?: string;
}

/** Context the engine needs to evaluate a changeset. */
export interface EvalContext {
  cwd: string;
  /** "<name> <email>" of the change author. */
  author: string;
  /** Commit subjects on the branch (for builtin:spec). */
  commitMessages: string[];
  /** Full commit messages (subject + body) on the branch — carries the agent attribution
   *  trailers the subject omits (for behavioral classification). Optional: absent in unit
   *  contexts that only exercise identity/gates. */
  commitTexts?: string[];
  /** Optional override of author class (e.g. forced via --agent). */
  forceClass?: AuthorClass;
}
