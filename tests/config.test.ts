import { test, expect, describe } from "bun:test";
import { parseConfig, ConfigError, DEFAULT_AGENT_AUTHORS } from "../src/config.ts";

describe("parseConfig", () => {
  test("fills defaults: version, protectedBranch, policy", () => {
    const cfg = parseConfig({ gates: { build: { run: "true" } } });
    expect(cfg.version).toBe(1);
    expect(cfg.protectedBranch).toBe("main");
    expect(cfg.policy?.agent?.requireAll).toBe(true);
    expect(cfg.policy?.human?.requireAll).toBe(false);
    expect(cfg.policy?.agentAuthors).toEqual(DEFAULT_AGENT_AUTHORS);
  });

  test("honors explicit protectedBranch and policy overrides", () => {
    const cfg = parseConfig({
      gates: { build: { run: "true" } },
      protectedBranch: "release",
      policy: { agentAuthors: ["mybot"], human: { requireAll: true } },
    });
    expect(cfg.protectedBranch).toBe("release");
    expect(cfg.policy?.agentAuthors).toEqual(["mybot"]);
    expect(cfg.policy?.human?.requireAll).toBe(true);
  });

  // The no-footgun onboarding knob (dogfood 2026-06-22): adding your fleet must NOT drop
  // the 13 built-in public-agent patterns.
  test("extraAgentAuthors MERGES onto the defaults (keeps built-ins)", () => {
    const cfg = parseConfig({
      gates: { build: { run: "true" } },
      policy: { extraAgentAuthors: ["bot@acme\\.dev"] },
    });
    expect(cfg.policy?.agentAuthors).toEqual([...DEFAULT_AGENT_AUTHORS, "bot@acme\\.dev"]);
  });

  test("extraAgentAuthors MERGES onto an explicit agentAuthors override", () => {
    const cfg = parseConfig({
      gates: { build: { run: "true" } },
      policy: { agentAuthors: ["mybot"], extraAgentAuthors: ["bot@acme\\.dev"] },
    });
    expect(cfg.policy?.agentAuthors).toEqual(["mybot", "bot@acme\\.dev"]);
  });

  test("rejects non-object", () => {
    expect(() => parseConfig(null)).toThrow(ConfigError);
    expect(() => parseConfig([])).toThrow(ConfigError);
  });

  test("rejects missing/empty gates", () => {
    expect(() => parseConfig({})).toThrow(ConfigError);
    expect(() => parseConfig({ gates: {} })).toThrow(/at least one gate/);
  });

  test("rejects a gate without run or builtin", () => {
    expect(() => parseConfig({ gates: { x: { required: true } } })).toThrow(/run.*builtin/);
  });

  test("rejects unknown builtin", () => {
    expect(() => parseConfig({ gates: { x: { builtin: "magic" } } })).toThrow(/unknown builtin/);
  });

  test("accepts builtin:spec gate", () => {
    const cfg = parseConfig({ gates: { spec: { builtin: "spec" } } });
    expect(cfg.gates.spec!.builtin).toBe("spec");
  });
});
