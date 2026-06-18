import { test, expect, describe } from "bun:test";
import { AGENTS, DEFAULT_AGENT_AUTHORS, matchAgent, explainMatch } from "../src/agents.ts";
import { classifyAuthor } from "../src/author.ts";

describe("agent registry", () => {
  test("every entry is well-formed: kebab id, unique, non-empty valid-regex patterns", () => {
    const ids = new Set<string>();
    for (const a of AGENTS) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.match.length).toBeGreaterThan(0);
      for (const p of a.match) {
        expect(() => new RegExp(p, "i")).not.toThrow();
      }
    }
  });

  test("DEFAULT_AGENT_AUTHORS is the flat derived pattern list", () => {
    expect(DEFAULT_AGENT_AUTHORS).toEqual(AGENTS.flatMap((a) => a.match));
  });

  test("known agents resolve to their registry entry", () => {
    expect(matchAgent("copilot-swe-agent <bot@users.noreply.github.com>")?.id).toBe("copilot-swe-agent");
    expect(matchAgent("Claude <noreply@anthropic.com>")?.id).toBe("claude-code");
    expect(matchAgent("dependabot[bot] <support@github.com>")?.id).toBe("dependabot");
    expect(matchAgent("mergegate <agents@deemwar.com>")?.id).toBe("deemwar-agent");
  });

  // The canary that earns the feature its keep: a human NAMED like an agent
  // (Devin, Claude, Cursor, Codex) must NEVER be misclassified as an agent.
  test("humans named like agents are not misclassified (no false positives)", () => {
    for (const human of [
      "Devin Carter <devin.carter@gmail.com>",
      "Claude Dubois <claude.dubois@corp.com>",
      "Cursor Smith <cursor.smith@personalmail.com>",
      "Codex Ventures <hi@codex.io>",
      "Sales Agents <agents@realty.com>",
    ]) {
      expect(matchAgent(human)).toBeNull();
      expect(classifyAuthor(human, DEFAULT_AGENT_AUTHORS)).toBe("human");
    }
  });

  test("explainMatch reports which specific pattern fired", () => {
    const e = explainMatch("Claude <noreply@anthropic.com>");
    expect(e?.entry.id).toBe("claude-code");
    expect(e?.pattern).toBe("noreply@anthropic\\.com");
    expect(explainMatch("Jordan Lee <jordan@example.com>")).toBeNull();
  });
});
