import { test, expect, describe } from "bun:test";
import { formatAgentsList, probeAuthor, cmdAgents } from "../src/commands/agents.ts";
import { AGENTS } from "../src/agents.ts";

function capture(fn: () => number): { code: number; out: string } {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    const code = fn();
    return { code, out: logs.join("\n") };
  } finally {
    console.log = orig;
  }
}

describe("agents command", () => {
  test("list shows every registry id + a contribution hint, no ANSI when color off", () => {
    const out = formatAgentsList(false);
    for (const a of AGENTS) expect(out).toContain(a.id);
    expect(out.toLowerCase()).toContain("add");
    expect(out).not.toContain("["); // no ANSI escape sequence when color is off
  });

  test("probeAuthor flags a known agent with the specific pattern that fired", () => {
    const p = probeAuthor("copilot-swe-agent <bot@users.noreply.github.com>");
    expect(p.cls).toBe("agent");
    expect(p.entry?.id).toBe("copilot-swe-agent");
    expect(p.pattern).toBeTruthy();
  });

  test("probeAuthor leaves a human named like an agent human (the auditor's job)", () => {
    const p = probeAuthor("Devin Carter <devin.carter@gmail.com>");
    expect(p.cls).toBe("human");
    expect(p.entry).toBeNull();
    expect(p.pattern).toBeNull();
  });

  test("cmdAgents default/list, --author, --json all exit 0", () => {
    expect(capture(() => cmdAgents([])).code).toBe(0);
    expect(capture(() => cmdAgents(["--author", "Jordan Lee <jordan@example.com>"])).code).toBe(0);
    expect(capture(() => cmdAgents(["--json"])).code).toBe(0);
  });

  test("--json emits the raw registry array", () => {
    const { out } = capture(() => cmdAgents(["--json"]));
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.find((e: { id: string }) => e.id === "claude-code")).toBeTruthy();
  });

  test("--json --author emits a parseable verdict", () => {
    const { out, code } = capture(() => cmdAgents(["--json", "--author", "Claude <noreply@anthropic.com>"]));
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.cls).toBe("agent");
    expect(parsed.agent.id).toBe("claude-code");
  });

  test("check audits this repo's authors and reports a summary (exit 0)", () => {
    const { out, code } = capture(() => cmdAgents(["check", "--limit", "5"]));
    expect(code).toBe(0);
    expect(out.toLowerCase()).toMatch(/human|agent/);
  });
});
