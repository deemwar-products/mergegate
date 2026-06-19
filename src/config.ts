import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MergegateConfig, PolicyConfig, IdentityRule } from "./types.ts";
// The default agent-author patterns are DERIVED from the coding-agent registry
// (src/agents.ts) — the single source of truth. Imported for local use in
// DEFAULT_POLICY and re-exported so existing importers keep resolving it here.
import { DEFAULT_AGENT_AUTHORS } from "./agents.ts";

export { DEFAULT_AGENT_AUTHORS };

export const CONFIG_FILENAMES = ["mergegate.config.json", ".mergegate.json"];

export const DEFAULT_POLICY: Required<PolicyConfig> = {
  agentAuthors: DEFAULT_AGENT_AUTHORS,
  agent: { requireAll: true },
  human: { requireAll: false },
  identities: [],
};

export class ConfigError extends Error {}

/** Validate + normalize policy.identities. Rejects the footguns that would silently
 *  over-exempt an author (missing match, a typo'd gate, a confused both-fields rule). */
function parseIdentities(raw: unknown, gateNames: string[], source: string): IdentityRule[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new ConfigError(`${source}: "policy.identities" must be an array`);
  }
  return raw.map((r, i) => {
    const where = `${source}: policy.identities[${i}]`;
    if (typeof r !== "object" || r === null || Array.isArray(r)) {
      throw new ConfigError(`${where} must be an object`);
    }
    const rule = r as Record<string, unknown>;
    const match = rule.match;
    const patterns = Array.isArray(match) ? match : match === undefined ? [] : [match];
    if (patterns.length === 0) {
      throw new ConfigError(`${where} needs a "match" (a pattern string or array of strings)`);
    }
    if (!patterns.every((p) => typeof p === "string" && p.length > 0)) {
      throw new ConfigError(`${where} "match" must be non-empty string(s)`);
    }
    const hasRequireAll = rule.requireAll !== undefined;
    const hasRequireGates = rule.requireGates !== undefined;
    if (hasRequireAll && hasRequireGates) {
      throw new ConfigError(`${where} sets both "requireAll" and "requireGates" — use one (requireGates is the explicit allow-list)`);
    }
    let requireGates: string[] | undefined;
    if (hasRequireGates) {
      if (!Array.isArray(rule.requireGates) || !rule.requireGates.every((g) => typeof g === "string")) {
        throw new ConfigError(`${where} "requireGates" must be an array of gate names`);
      }
      for (const g of rule.requireGates as string[]) {
        if (!gateNames.includes(g)) {
          throw new ConfigError(`${where} "requireGates" references unknown gate "${g}" (defined gates: ${gateNames.join(", ")})`);
        }
      }
      requireGates = rule.requireGates as string[];
    }
    const out: IdentityRule = { match: match as string | string[] };
    if (typeof rule.label === "string") out.label = rule.label;
    if (hasRequireAll) out.requireAll = !!rule.requireAll;
    if (requireGates) out.requireGates = requireGates;
    return out;
  });
}

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

  const policyIn = (obj.policy as Record<string, unknown>) ?? {};
  const policy: PolicyConfig = {
    agentAuthors: (policyIn.agentAuthors as string[]) ?? DEFAULT_POLICY.agentAuthors,
    agent: { requireAll: (policyIn.agent as PolicyConfig["agent"])?.requireAll ?? DEFAULT_POLICY.agent.requireAll },
    human: { requireAll: (policyIn.human as PolicyConfig["human"])?.requireAll ?? DEFAULT_POLICY.human.requireAll },
    identities: parseIdentities(policyIn.identities, gateNames, source),
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
