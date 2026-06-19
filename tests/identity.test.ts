import { test, expect } from "bun:test";
import { matchIdentity } from "../src/author.ts";
import type { IdentityRule } from "../src/types.ts";

const rules: IdentityRule[] = [
  { match: ["dependabot\\[bot\\]", "renovate\\[bot\\]"], label: "low-risk-bumps", requireGates: ["tests", "build"] },
  { match: "copilot-swe-agent", label: "feature-agent", requireAll: true },
];

test("matchIdentity returns the first rule whose pattern tests the author", () => {
  expect(matchIdentity("dependabot[bot] <dependabot@github.com>", rules)?.label).toBe("low-risk-bumps");
  expect(matchIdentity("renovate[bot] <bot@renovate.com>", rules)?.label).toBe("low-risk-bumps");
  expect(matchIdentity("copilot-swe-agent <copilot@users.noreply.github.com>", rules)?.label).toBe("feature-agent");
});

test("matchIdentity returns null when no rule matches", () => {
  expect(matchIdentity("Jane Dev <jane@example.com>", rules)).toBeNull();
});

test("first-match-wins: an earlier broad rule shadows a later one", () => {
  const ordered: IdentityRule[] = [
    { match: "\\[bot\\]", label: "any-bot", requireAll: false },
    { match: "dependabot", label: "dependabot-specific", requireGates: ["tests"] },
  ];
  // dependabot[bot] matches the broad rule first → that's the documented contract.
  expect(matchIdentity("dependabot[bot] <x@github.com>", ordered)?.label).toBe("any-bot");
});

test("matchIdentity tolerates an invalid regex (treats it as a literal substring)", () => {
  const bad: IdentityRule[] = [{ match: "wat(ch", label: "literal" }];
  expect(matchIdentity("wat(ch <a@b.c>", bad)?.label).toBe("literal");
  expect(matchIdentity("nope <a@b.c>", bad)).toBeNull();
});

test("empty/undefined rules → no match, never throws", () => {
  expect(matchIdentity("anyone <a@b.c>", [])).toBeNull();
  expect(matchIdentity("anyone <a@b.c>", undefined)).toBeNull();
});
