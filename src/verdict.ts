import type {
  MergegateConfig,
  EvalContext,
  Verdict,
  GateResult,
  AuthorClass,
  IdentityRule,
} from "./types.ts";
import { classifyAuthor, matchIdentity } from "./author.ts";
import { detectAgentSignal } from "./behavior.ts";
import { runGates } from "./gates.ts";
import { DEFAULT_POLICY } from "./config.ts";

/**
 * Decide whether a gate must pass, given the class default (requireAll) and an optional
 * identity rule that overrides it. Agent PRs default to EVERY gate (the core promise);
 * an identity rule can pin an explicit allow-list (requireGates) or flip requireAll.
 */
export function isGateRequiredBy(
  gate: GateResult,
  requireAll: boolean,
  rule: IdentityRule | null | undefined,
): boolean {
  if (rule?.requireGates) return rule.requireGates.includes(gate.name);
  if (rule && rule.requireAll !== undefined) return rule.requireAll || !!gate.required;
  return requireAll || !!gate.required;
}

/** A readable name for an applied rule — its label, else its first match pattern. */
function ruleLabel(rule: IdentityRule): string {
  return rule.label ?? (Array.isArray(rule.match) ? rule.match[0]! : rule.match);
}

/** Compute a verdict from already-run gate results (pure — no side effects). The
 *  optional `rule` tunes which gates are required for this identity. */
export function computeVerdict(
  results: GateResult[],
  authorClass: AuthorClass,
  author: string,
  protectedBranch: string,
  requireAll: boolean,
  rule?: IdentityRule | null,
  behavioralSignal?: string,
): Verdict {
  const required = (g: GateResult) => isGateRequiredBy(g, requireAll, rule);
  const blockedBy = results.filter((g) => required(g) && g.status !== "pass").map((g) => g.name);

  let appliedRule: string | undefined;
  let loosenedGates: string[] | undefined;
  if (rule) {
    appliedRule = ruleLabel(rule);
    if (authorClass === "agent") {
      // Safety signal: gates the agent default would require but this rule dropped.
      const dropped = results
        .filter((g) => (requireAll || !!g.required) && !required(g))
        .map((g) => g.name);
      if (dropped.length > 0) loosenedGates = dropped;
    }
  }

  return {
    pass: blockedBy.length === 0,
    authorClass,
    author,
    protectedBranch,
    gates: results,
    blockedBy,
    appliedRule,
    loosenedGates,
    behavioralSignal,
  };
}

/** End-to-end: classify author, run gates, compute verdict. */
export function evaluate(config: MergegateConfig, ctx: EvalContext): Verdict {
  const policy = config.policy ?? DEFAULT_POLICY;
  let authorClass: AuthorClass =
    ctx.forceClass ?? classifyAuthor(ctx.author, policy.agentAuthors ?? DEFAULT_POLICY.agentAuthors);

  // Behavioral fallback: an identity that looks human can still carry an agent
  // `Co-Authored-By:` trailer (a human running Claude Code / Copilot locally). Only
  // escalates human → agent — never the reverse — and only when not explicitly forced.
  let behavioralSignal: string | undefined;
  if (authorClass === "human" && ctx.forceClass === undefined && (policy.behavioralSignals ?? true)) {
    const sig = detectAgentSignal(ctx.commitTexts ?? []);
    if (sig) {
      authorClass = "agent";
      behavioralSignal = `${sig.entry.label} · ${sig.evidence}`;
    }
  }

  const requireAll =
    authorClass === "agent"
      ? policy.agent?.requireAll ?? true
      : policy.human?.requireAll ?? false;
  // Identity rules tune gate-requirements within the class — they never re-classify.
  const rule = matchIdentity(ctx.author, policy.identities);
  const results = runGates(config.gates, ctx);
  return computeVerdict(
    results,
    authorClass,
    ctx.author,
    config.protectedBranch ?? "main",
    requireAll,
    rule,
    behavioralSignal,
  );
}
