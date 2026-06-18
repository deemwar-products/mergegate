import { test, expect, describe } from "bun:test";
import { evaluate, computeVerdict } from "../src/verdict.ts";
import { parseConfig } from "../src/config.ts";
import type { EvalContext, GateResult } from "../src/types.ts";

const HUMAN = "Jordan Lee <jordan@example.com>";
const AGENT = "copilot-swe-agent <bot@users.noreply.github.com>";

function ctx(author: string, msgs: string[] = ["feat (spec 1)"]): EvalContext {
  return { cwd: process.cwd(), author, commitMessages: msgs };
}

describe("computeVerdict policy", () => {
  const gr = (name: string, status: GateResult["status"], required: boolean): GateResult => ({
    name, status, required, durationMs: 1, reason: "",
  });

  test("agent: optional failing gate still blocks (requireAll)", () => {
    const v = computeVerdict(
      [gr("build", "pass", true), gr("checks", "fail", false)],
      "agent", AGENT, "main", true,
    );
    expect(v.pass).toBe(false);
    expect(v.blockedBy).toEqual(["checks"]);
  });

  test("human: optional failing gate does not block", () => {
    const v = computeVerdict(
      [gr("build", "pass", true), gr("checks", "fail", false)],
      "human", HUMAN, "main", false,
    );
    expect(v.pass).toBe(true);
    expect(v.blockedBy).toEqual([]);
  });

  test("human: required failing gate blocks", () => {
    const v = computeVerdict(
      [gr("tests", "fail", true)],
      "human", HUMAN, "main", false,
    );
    expect(v.pass).toBe(false);
    expect(v.blockedBy).toEqual(["tests"]);
  });
});

describe("evaluate end-to-end", () => {
  const config = parseConfig({
    gates: {
      spec: { builtin: "spec" },
      build: { run: "exit 0" },
      tests: { run: "exit 0" },
      checks: { run: "exit 1", required: false },
    },
  });

  test("agent PR with a failing optional check is BLOCKED", () => {
    const v = evaluate(config, ctx(AGENT));
    expect(v.authorClass).toBe("agent");
    expect(v.pass).toBe(false);
    expect(v.blockedBy).toContain("checks");
  });

  test("same change from a human passes (optional check ignored)", () => {
    const v = evaluate(config, ctx(HUMAN));
    expect(v.authorClass).toBe("human");
    expect(v.pass).toBe(true);
  });

  test("agent PR missing a spec ref is BLOCKED on spec", () => {
    const v = evaluate(config, ctx(AGENT, ["just some wip"]));
    expect(v.pass).toBe(false);
    expect(v.blockedBy).toContain("spec");
  });

  test("forceClass overrides detection", () => {
    const v = evaluate(config, { ...ctx(HUMAN), forceClass: "agent" });
    expect(v.authorClass).toBe("agent");
    expect(v.pass).toBe(false);
  });
});
