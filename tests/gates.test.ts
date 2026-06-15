import { test, expect, describe } from "bun:test";
import { runGate, evalSpecGate } from "../src/gates.ts";
import type { EvalContext } from "../src/types.ts";

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({
  cwd: process.cwd(),
  author: "test <t@example.com>",
  commitMessages: [],
  ...over,
});

describe("shell run gates", () => {
  test("exit 0 passes", () => {
    const r = runGate("build", { run: "exit 0" }, ctx());
    expect(r.status).toBe("pass");
    expect(r.required).toBe(true);
  });

  test("non-zero exit fails and captures output", () => {
    const r = runGate("tests", { run: "echo boom 1>&2; exit 3" }, ctx());
    expect(r.status).toBe("fail");
    expect(r.reason).toContain("exited 3");
    expect(r.output).toContain("boom");
  });

  test("required:false is preserved on the result", () => {
    const r = runGate("checks", { run: "exit 1", required: false }, ctx());
    expect(r.required).toBe(false);
    expect(r.status).toBe("fail");
  });
});

describe("builtin spec gate", () => {
  test("passes when every commit references a spec", () => {
    const { ok } = evalSpecGate({ builtin: "spec" }, ctx({
      commitMessages: ["feat: add gate (spec 028)", "fix: edge case #112"],
    }));
    expect(ok).toBe(true);
  });

  test("fails when a commit lacks a spec/issue ref", () => {
    const res = evalSpecGate({ builtin: "spec" }, ctx({
      commitMessages: ["feat: add gate (spec 028)", "wip random change"],
    }));
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("1/2");
  });

  test("fails when there are no commits", () => {
    const res = evalSpecGate({ builtin: "spec" }, ctx({ commitMessages: [] }));
    expect(res.ok).toBe(false);
  });

  test("honors a custom pattern", () => {
    const res = evalSpecGate({ builtin: "spec", pattern: "RFC-\\d+" }, ctx({
      commitMessages: ["change per RFC-7"],
    }));
    expect(res.ok).toBe(true);
  });

  test("runGate routes builtin:spec", () => {
    const r = runGate("spec", { builtin: "spec" }, ctx({ commitMessages: ["x (spec 1)"] }));
    expect(r.status).toBe("pass");
  });
});
