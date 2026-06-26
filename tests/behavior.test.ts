import { test, expect, describe } from "bun:test";
import { detectAgentSignal } from "../src/behavior.ts";
import { evaluate } from "../src/verdict.ts";
import { parseConfig } from "../src/config.ts";
import type { EvalContext } from "../src/types.ts";

// A real Claude Code commit message: a human wrote it, but the tool stamps a trailer.
const CLAUDE_TRAILER = `fix: tidy the parser

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

describe("detectAgentSignal — commit-trailer detection", () => {
  test("fires on a Claude Code Co-Authored-By trailer", () => {
    const sig = detectAgentSignal([CLAUDE_TRAILER]);
    expect(sig).not.toBeNull();
    expect(sig!.entry.id).toBe("claude-code");
    expect(sig!.evidence).toContain("noreply@anthropic.com");
  });

  test("fires on a generic [bot] co-author", () => {
    const sig = detectAgentSignal(["chore: bump\n\nCo-authored-by: some-tool[bot] <x@y.z>"]);
    expect(sig).not.toBeNull();
  });

  test("is case-insensitive on the trailer key", () => {
    expect(detectAgentSignal(["x\n\nco-authored-by: Claude <noreply@anthropic.com>"])).not.toBeNull();
  });

  // SAFETY CANARY — the whole promise is "gate agents without blocking humans". A
  // human co-author must NOT trip the signal, and a mere mention (not a trailer) must not.
  test("a human co-author does NOT fire", () => {
    expect(detectAgentSignal(["feat: pair work\n\nCo-authored-by: Jordan Lee <jordan@example.com>"])).toBeNull();
  });

  test("merely mentioning an agent in prose does NOT fire (only the trailer counts)", () => {
    expect(detectAgentSignal(["refactor: port the logic claude suggested to TS"])).toBeNull();
    expect(detectAgentSignal(["docs: note that noreply@anthropic.com is the bot address"])).toBeNull();
  });

  test("empty input is null", () => {
    expect(detectAgentSignal([])).toBeNull();
  });
});

describe("evaluate — behavioral escalation human → agent", () => {
  const config = parseConfig({
    gates: {
      build: { run: "exit 0" },
      checks: { run: "exit 1", required: false }, // optional: only blocks an AGENT
    },
  });
  const HUMAN = "Jordan Lee <jordan@example.com>";
  const base = (over: Partial<EvalContext> = {}): EvalContext => ({
    cwd: process.cwd(), author: HUMAN, commitMessages: ["fix: tidy the parser"], ...over,
  });

  test("human author + agent trailer → gated as agent (optional check now blocks)", () => {
    const v = evaluate(config, base({ commitTexts: [CLAUDE_TRAILER] }));
    expect(v.authorClass).toBe("agent");
    expect(v.behavioralSignal).toContain("Claude Code");
    expect(v.pass).toBe(false);
    expect(v.blockedBy).toContain("checks");
  });

  test("human author + ordinary commit → stays human (optional check ignored)", () => {
    const v = evaluate(config, base({ commitTexts: ["fix: tidy the parser"] }));
    expect(v.authorClass).toBe("human");
    expect(v.behavioralSignal).toBeUndefined();
    expect(v.pass).toBe(true);
  });

  test("forceClass:human wins even with an agent trailer present", () => {
    const v = evaluate(config, base({ commitTexts: [CLAUDE_TRAILER], forceClass: "human" }));
    expect(v.authorClass).toBe("human");
    expect(v.behavioralSignal).toBeUndefined();
    expect(v.pass).toBe(true);
  });

  test("policy.behavioralSignals:false opts out of trailer classification", () => {
    const off = parseConfig({
      gates: { build: { run: "exit 0" }, checks: { run: "exit 1", required: false } },
      policy: { behavioralSignals: false },
    });
    const v = evaluate(off, base({ commitTexts: [CLAUDE_TRAILER] }));
    expect(v.authorClass).toBe("human");
    expect(v.pass).toBe(true);
  });

  test("an already-agent author is unaffected (no behavioral downgrade path)", () => {
    const v = evaluate(config, base({ author: "devin-ai-integration[bot] <bot@devin.ai>", commitTexts: ["plain"] }));
    expect(v.authorClass).toBe("agent");
    expect(v.behavioralSignal).toBeUndefined();
  });
});
