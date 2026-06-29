// Pluggable custom-check framework.
//
// The built-in catalog (src/checks.ts) ships the curated checks for the failure modes
// that show up in EVERY agent PR. But an org has its own conventions a generic catalog
// can't know: a banned-internal-import rule, a license-header gate, a "no calls to the
// deprecated client" check. Forking the binary to make those discoverable is the wrong
// price. A *checkpack* is the pluggable layer: a JSON file the org commits beside its
// config (`mergegate.checks.json`), and `checks list/show/add` surface its entries
// alongside the built-ins — tagged `(custom)` — so `checks add <id>` drops one into
// mergegate.config.json exactly like a built-in.
//
// DESIGN RULE (mirrors src/checks.ts rule 1): a custom check is the SAME `CheckEntry` as
// a built-in — no new evaluator, no new gate semantics. The pack only EXTENDS the
// catalog; the gate engine still runs whatever lands in `config.gates`. So a custom
// check composes with policy / identity rules for free, and the trust boundary is
// unchanged: nothing here runs a command — `checks add` writes a gate you then review.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CHECK_CATEGORIES, type CheckCategory, type CheckEntry } from "./checks.ts";

/** Auto-discovered checkpack filenames, in precedence order (mirrors CONFIG_FILENAMES). */
export const CHECKPACK_FILENAMES = ["mergegate.checks.json", ".mergegate.checks.json"];

export class CheckpackError extends Error {}

/** Custom ids share the built-in id contract: stable, kebab-case, used in `checks add <id>`. */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isCategory(s: string): s is CheckCategory {
  return (CHECK_CATEGORIES as string[]).includes(s);
}

/** Validate + normalize a raw checkpack object into CheckEntry[]. Rejects the footguns
 *  that would make a pack silently useless or unsafe: a missing/garbled id, a duplicate
 *  id within the pack, an unknown category, or a gate with nothing to run. Throws
 *  CheckpackError (the command layer maps it to exit 2 with the source path). */
export function parseCheckpack(raw: unknown, source = "checkpack"): CheckEntry[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CheckpackError(`${source}: expected a JSON object with a "checks" array`);
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.checks)) {
    throw new CheckpackError(`${source}: "checks" must be an array`);
  }
  const seen = new Set<string>();
  return obj.checks.map((r, i) => {
    const where = `${source}: checks[${i}]`;
    if (typeof r !== "object" || r === null || Array.isArray(r)) {
      throw new CheckpackError(`${where} must be an object`);
    }
    const e = r as Record<string, unknown>;
    if (typeof e.id !== "string" || !KEBAB.test(e.id)) {
      throw new CheckpackError(`${where} needs a kebab-case "id" (e.g. "no-internal-urls")`);
    }
    if (seen.has(e.id)) {
      throw new CheckpackError(`${where} duplicate id "${e.id}" in this pack`);
    }
    seen.add(e.id);
    // category is optional; an org check that targets no specific stack lands in `custom`.
    let category: CheckCategory = "custom";
    if (e.category !== undefined) {
      if (typeof e.category !== "string" || !isCategory(e.category)) {
        throw new CheckpackError(`${where} "category" must be one of: ${CHECK_CATEGORIES.join(", ")}`);
      }
      category = e.category;
    }
    if (typeof e.gate !== "object" || e.gate === null || Array.isArray(e.gate)) {
      throw new CheckpackError(`${where} needs a "gate" object`);
    }
    const gate = e.gate as Record<string, unknown>;
    if (typeof gate.run !== "string" && gate.builtin !== "spec") {
      throw new CheckpackError(`${where} gate needs a "run" command (or builtin "spec")`);
    }
    return {
      id: e.id,
      label: typeof e.label === "string" && e.label ? e.label : e.id,
      category,
      why: typeof e.why === "string" ? e.why : "",
      gateName: typeof e.gateName === "string" && e.gateName ? e.gateName : e.id,
      gate: e.gate as CheckEntry["gate"],
    } satisfies CheckEntry;
  });
}

export function findCheckpackPath(dir: string): string | null {
  for (const name of CHECKPACK_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Load a checkpack: an explicit path (which MUST exist — a typo'd --pack is an error,
 *  not a silent no-op) or auto-discovery in `dir`. Returns an empty pack with
 *  source=null when auto-discovery finds nothing, since a pack is optional. */
export function loadCheckpack(
  dir: string,
  explicitPath?: string,
): { checks: CheckEntry[]; source: string | null } {
  const path = explicitPath ?? findCheckpackPath(dir);
  if (!path) return { checks: [], source: null };
  if (!existsSync(path)) {
    throw new CheckpackError(`checkpack not found: ${path}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new CheckpackError(`${path}: invalid JSON — ${(e as Error).message}`);
  }
  return { checks: parseCheckpack(raw, path), source: path };
}
