import { test, expect, describe } from "bun:test";
import { classifyAuthor } from "../src/author.ts";
import { DEFAULT_AGENT_AUTHORS } from "../src/config.ts";

describe("classifyAuthor", () => {
  const P = DEFAULT_AGENT_AUTHORS;

  test("classic bot suffix is an agent", () => {
    expect(classifyAuthor("dependabot[bot] <support@github.com>", P)).toBe("agent");
  });

  test("copilot agent is an agent", () => {
    expect(classifyAuthor("copilot-swe-agent <bot@users.noreply.github.com>", P)).toBe("agent");
  });

  test("claude noreply is an agent", () => {
    expect(classifyAuthor("Claude <noreply@anthropic.com>", P)).toBe("agent");
  });

  test("a normal human is human", () => {
    expect(classifyAuthor("Jordan Lee <jordan@example.com>", P)).toBe("human");
  });

  test("custom patterns are honored", () => {
    expect(classifyAuthor("releasebot <ci@acme.io>", ["releasebot"])).toBe("agent");
    expect(classifyAuthor("releasebot <ci@acme.io>", ["otherbot"])).toBe("human");
  });

  test("invalid regex falls back to substring", () => {
    expect(classifyAuthor("weird(author", ["weird(author"])).toBe("agent");
  });
});
