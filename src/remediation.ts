// Actionable remediation hints — when a gate FAILS, tell the author how to fix it.
//
// Derived from the gate's CONFIG plus a typed fail-kind discriminator that runGate
// already knows at the point of failure (so we never re-parse `reason` strings). Pure
// and unit-tested; runGate composes the sentence and stores it on the failing
// GateResult, and the report layer shows it ONLY for gates that actually block.
import type { GateName, GateConfig } from "./types.ts";
import { DEFAULT_SPEC_PATTERN } from "./gates.ts";

/** Why a gate failed — enough to choose the right fix, with no string-matching. */
export type FailKind = "spec" | "exit" | "timeout" | "spawn";

/** A gate's `run` command can come from an untrusted PR branch and lands in a
 *  bot-posted PR comment — flatten newlines and cap length before echoing it. */
function safeCmd(gate: GateConfig): string {
  const raw = (gate.run ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "the gate command";
  return raw.length > 120 ? raw.slice(0, 119) + "…" : raw;
}

/** One actionable line for a FAILED gate, or undefined when the gate didn't fail. */
export function remediationFor(
  name: GateName,
  gate: GateConfig,
  kind: FailKind | null | undefined,
): string | undefined {
  if (!kind) return undefined;
  switch (kind) {
    case "spec": {
      const pattern = gate.pattern ?? DEFAULT_SPEC_PATTERN;
      return `Reference a spec or issue in every commit — e.g. \`fix: … (spec 12)\` or \`#12\`. Each commit subject must match /${pattern}/.`;
    }
    case "timeout":
      return `\`${safeCmd(gate)}\` timed out — make it faster or raise this gate's \`timeoutMs\`.`;
    case "spawn":
      return `\`${safeCmd(gate)}\` couldn't start — check it's installed and on your PATH.`;
    case "exit":
      return gate.run
        ? `Run \`${safeCmd(gate)}\` locally, fix what it reports, then push.`
        : `Resolve the "${name}" gate locally, then re-run mergegate.`;
  }
}
