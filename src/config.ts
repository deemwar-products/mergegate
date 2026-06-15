import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MergegateConfig, PolicyConfig } from "./types.ts";

export const CONFIG_FILENAMES = ["mergegate.config.json", ".mergegate.json"];

/** Patterns that, by default, mark a commit author as an autonomous agent. */
export const DEFAULT_AGENT_AUTHORS = [
  "\\[bot\\]",
  "copilot-swe-agent",
  "github-actions",
  "dependabot",
  "claude",
  "codex",
  "cursor",
  "devin",
  "noreply@anthropic\\.com",
  "agents@",
];

export const DEFAULT_POLICY: Required<PolicyConfig> = {
  agentAuthors: DEFAULT_AGENT_AUTHORS,
  agent: { requireAll: true },
  human: { requireAll: false },
};

export class ConfigError extends Error {}

export function findConfigPath(dir: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Parse and validate a config object, filling defaults. Throws ConfigError on malformed input. */
export function parseConfig(raw: unknown, source = "config"): MergegateConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${source}: expected a JSON object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.gates !== "object" || obj.gates === null || Array.isArray(obj.gates)) {
    throw new ConfigError(`${source}: "gates" must be an object with at least one gate`);
  }
  const gateNames = Object.keys(obj.gates as object);
  if (gateNames.length === 0) {
    throw new ConfigError(`${source}: define at least one gate`);
  }
  for (const [name, g] of Object.entries(obj.gates as Record<string, unknown>)) {
    if (typeof g !== "object" || g === null) {
      throw new ConfigError(`${source}: gate "${name}" must be an object`);
    }
    const gate = g as Record<string, unknown>;
    if (!gate.run && !gate.builtin) {
      throw new ConfigError(`${source}: gate "${name}" needs a "run" command or a "builtin"`);
    }
    if (gate.builtin && gate.builtin !== "spec") {
      throw new ConfigError(`${source}: gate "${name}" has unknown builtin "${gate.builtin}"`);
    }
  }

  const policyIn = (obj.policy as PolicyConfig) ?? {};
  const policy: PolicyConfig = {
    agentAuthors: policyIn.agentAuthors ?? DEFAULT_POLICY.agentAuthors,
    agent: { requireAll: policyIn.agent?.requireAll ?? DEFAULT_POLICY.agent.requireAll },
    human: { requireAll: policyIn.human?.requireAll ?? DEFAULT_POLICY.human.requireAll },
  };

  return {
    version: typeof obj.version === "number" ? obj.version : 1,
    protectedBranch: typeof obj.protectedBranch === "string" ? obj.protectedBranch : "main",
    gates: obj.gates as MergegateConfig["gates"],
    policy,
  };
}

/** Load config from a directory. Throws ConfigError if none found or malformed. */
export function loadConfig(dir: string): MergegateConfig {
  const path = findConfigPath(dir);
  if (!path) {
    throw new ConfigError(
      `no mergegate config found in ${dir} (looked for ${CONFIG_FILENAMES.join(", ")}). Run \`mergegate init\`.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`${path}: invalid JSON — ${(e as Error).message}`);
  }
  return parseConfig(raw, path);
}
