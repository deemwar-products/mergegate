import { spawnSync } from "node:child_process";
import type { GateConfig, GateName, GateResult, EvalContext } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
/** Default builtin:spec pattern — a commit must reference a spec or an issue/ticket. */
export const DEFAULT_SPEC_PATTERN = "(spec[-:# ]?\\d+|#\\d+|[A-Z]{2,}-\\d+)";

function tail(s: string, lines = 20): string {
  const arr = s.replace(/\s+$/, "").split("\n");
  return arr.slice(-lines).join("\n");
}

/** Evaluate the built-in spec gate: every commit on the branch must reference a spec/issue. */
export function evalSpecGate(gate: GateConfig, ctx: EvalContext): { ok: boolean; reason: string } {
  const pattern = gate.pattern ?? DEFAULT_SPEC_PATTERN;
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return { ok: false, reason: `invalid spec pattern: ${pattern}` };
  }
  const msgs = ctx.commitMessages ?? [];
  if (msgs.length === 0) {
    return { ok: false, reason: "no commits found to check for a spec reference" };
  }
  const missing = msgs.filter((m) => !re.test(m));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.length}/${msgs.length} commit(s) lack a spec/issue reference (need /${pattern}/) — e.g. "${missing[0]!.slice(0, 60)}"`,
    };
  }
  return { ok: true, reason: `all ${msgs.length} commit(s) reference a spec/issue` };
}

/** Run a single gate. Pure dispatch over builtin vs shell `run`. */
export function runGate(name: GateName, gate: GateConfig, ctx: EvalContext): GateResult {
  const required = gate.required ?? true;
  const start = Date.now();

  // Built-in spec evaluator.
  if (gate.builtin === "spec" && !gate.run) {
    const { ok, reason } = evalSpecGate(gate, ctx);
    return {
      name,
      status: ok ? "pass" : "fail",
      required,
      durationMs: Date.now() - start,
      reason,
    };
  }

  // Shell command gate.
  const cmd = gate.run!;
  const res = spawnSync(cmd, {
    cwd: ctx.cwd,
    shell: true,
    encoding: "utf8",
    timeout: gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Date.now() - start;
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;

  if (res.error) {
    const timedOut = (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
    return {
      name,
      status: "fail",
      required,
      durationMs,
      reason: timedOut ? `timed out after ${gate.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : `failed to run: ${res.error.message}`,
      output: tail(out),
    };
  }
  const ok = res.status === 0;
  return {
    name,
    status: ok ? "pass" : "fail",
    required,
    durationMs,
    reason: ok ? `\`${cmd}\` passed` : `\`${cmd}\` exited ${res.status}`,
    output: ok ? undefined : tail(out),
  };
}

/** Run all gates in declaration order. */
export function runGates(
  gates: Record<GateName, GateConfig>,
  ctx: EvalContext,
): GateResult[] {
  return Object.entries(gates).map(([name, g]) => runGate(name, g, ctx));
}
