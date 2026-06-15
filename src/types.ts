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

export interface PolicyConfig {
  /** Substring/regex patterns matched against "<name> <email>" to classify an author as an agent. */
  agentAuthors?: string[];
  /** Agent-authored changes: require every gate to pass (the core mergegate promise). Default true. */
  agent?: { requireAll?: boolean };
  /** Human-authored changes: honor each gate's own `required` flag. Default requireAll false. */
  human?: { requireAll?: boolean };
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
}

export interface Verdict {
  pass: boolean;
  authorClass: AuthorClass;
  author: string;
  protectedBranch: string;
  gates: GateResult[];
  /** Names of required gates that did not pass. */
  blockedBy: GateName[];
}

/** Context the engine needs to evaluate a changeset. */
export interface EvalContext {
  cwd: string;
  /** "<name> <email>" of the change author. */
  author: string;
  /** Commit subjects on the branch (for builtin:spec). */
  commitMessages: string[];
  /** Optional override of author class (e.g. forced via --agent). */
  forceClass?: AuthorClass;
}
