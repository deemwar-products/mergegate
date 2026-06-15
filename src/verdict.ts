import type {
  MergegateConfig,
  EvalContext,
  Verdict,
  GateResult,
  AuthorClass,
} from "./types.ts";
import { classifyAuthor } from "./author.ts";
import { runGates } from "./gates.ts";
import { DEFAULT_POLICY } from "./config.ts";

/**
 * Decide whether a gate must pass for this verdict, given the author class and policy.
 * Agent PRs (the core mergegate promise) require EVERY gate. Human PRs honor each
 * gate's own `required` flag unless the human policy also sets requireAll.
 */
export function isGateRequired(
  gate: GateResult,
  authorClass: AuthorClass,
  requireAll: boolean,
): boolean {
  if (requireAll) return true;
  return gate.required;
}

/** Compute a verdict from already-run gate results (pure — no side effects). */
export function computeVerdict(
  results: GateResult[],
  authorClass: AuthorClass,
  author: string,
  protectedBranch: string,
  requireAll: boolean,
): Verdict {
  const blockedBy = results
    .filter((g) => isGateRequired(g, authorClass, requireAll) && g.status !== "pass")
    .map((g) => g.name);
  return {
    pass: blockedBy.length === 0,
    authorClass,
    author,
    protectedBranch,
    gates: results,
    blockedBy,
  };
}

/** End-to-end: classify author, run gates, compute verdict. */
export function evaluate(config: MergegateConfig, ctx: EvalContext): Verdict {
  const policy = config.policy ?? DEFAULT_POLICY;
  const authorClass: AuthorClass =
    ctx.forceClass ?? classifyAuthor(ctx.author, policy.agentAuthors ?? DEFAULT_POLICY.agentAuthors);
  const requireAll =
    authorClass === "agent"
      ? policy.agent?.requireAll ?? true
      : policy.human?.requireAll ?? false;
  const results = runGates(config.gates, ctx);
  return computeVerdict(
    results,
    authorClass,
    ctx.author,
    config.protectedBranch ?? "main",
    requireAll,
  );
}
