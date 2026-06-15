import { test, expect, describe } from "bun:test";
import { hookScript } from "../src/commands/hook.ts";

describe("hookScript", () => {
  const script = hookScript("./node_modules/.bin/mergegate");

  test("is bash and respects the skip env", () => {
    expect(script.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(script).toContain("MERGEGATE_SKIP");
  });

  test("braces all variable expansions (no $var adjacent to text — regression)", () => {
    // The unbraced `$protected…` bug let bash glob the trailing char into the name.
    expect(script).not.toMatch(/\$protected[^}]/);
    expect(script).toContain("${protected}");
    expect(script).toContain("${remote_ref}");
  });

  test("is pure ASCII (portable across shells/locales)", () => {
    expect(/^[\x00-\x7F]*$/.test(script)).toBe(true);
  });

  test("invokes the runner for the gate and blocks on failure", () => {
    expect(script).toContain("./node_modules/.bin/mergegate gate");
    expect(script).toContain("exit 1");
  });
});
