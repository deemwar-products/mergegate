// parseConfig validation for policy.identities — reject the footguns the critic flagged.
import { test, expect } from "bun:test";
import { parseConfig, ConfigError } from "../src/config.ts";

const base = (identities: unknown) => ({
  version: 1,
  gates: { spec: { builtin: "spec" }, tests: { run: "npm test" } },
  policy: { identities },
});

test("accepts a well-formed identity rule", () => {
  const c = parseConfig(base([{ match: "dependabot", requireGates: ["tests"] }]));
  expect(c.policy?.identities?.[0]?.requireGates).toEqual(["tests"]);
});

test("rejects identities that is not an array", () => {
  expect(() => parseConfig(base({ match: "x" }))).toThrow(ConfigError);
});

test("rejects a rule with no match", () => {
  expect(() => parseConfig(base([{ requireGates: ["tests"] }]))).toThrow(/match/);
});

test("rejects a rule that sets BOTH requireAll and requireGates (confused config)", () => {
  expect(() => parseConfig(base([{ match: "x", requireAll: true, requireGates: ["tests"] }]))).toThrow(/both/i);
});

test("rejects requireGates referencing an unknown gate (typo = silent over-exemption)", () => {
  expect(() => parseConfig(base([{ match: "x", requireGates: ["tetst"] }]))).toThrow(/tetst|unknown gate/i);
});

test("rejects a non-string match entry", () => {
  expect(() => parseConfig(base([{ match: [123] }]))).toThrow(ConfigError);
});

test("a config with no identities still parses (back-compat)", () => {
  const c = parseConfig({ version: 1, gates: { spec: { builtin: "spec" } } });
  expect(c.policy?.identities ?? []).toEqual([]);
});
