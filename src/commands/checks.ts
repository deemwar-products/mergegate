import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  CHECKS,
  CHECK_CATEGORIES,
  mergeChecks,
  type CheckCategory,
  type CheckEntry,
} from "../checks.ts";
import { loadCheckpack, CheckpackError } from "../checkpack.ts";
import { CONFIG_FILENAMES } from "../config.ts";

// ── tiny flag parse (kept local to avoid a cli.ts <-> commands import cycle) ──
function parseFlags(args: string[]): { _: string[]; flags: Record<string, string | boolean> } {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

const useColorDefault = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (on: boolean, code: string, s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (on: boolean, s: string) => paint(on, "2", s);
const bold = (on: boolean, s: string) => paint(on, "1", s);
const cyan = (on: boolean, s: string) => paint(on, "36", s);

function isCategory(s: string): s is CheckCategory {
  return (CHECK_CATEGORIES as string[]).includes(s);
}

/** The `mergegate checks` table — every curated check, grouped by category. Ids in
 *  `customIds` (from an org checkpack) are tagged `(custom)` so a maintainer can see at a
 *  glance which gates are org-defined vs. built-in. */
export function formatChecksList(
  entries: CheckEntry[],
  useColor: boolean,
  customIds: Set<string> = new Set(),
): string {
  const idW = Math.max(2, ...entries.map((c) => c.id.length));
  const lines: string[] = [];
  lines.push(`mergegate · ${entries.length} pre-built checks for the common agent-PR failure modes`);
  lines.push("");
  let lastCat: CheckCategory | null = null;
  for (const c of entries) {
    if (c.category !== lastCat) {
      if (lastCat !== null) lines.push("");
      lines.push(bold(useColor, c.category));
      lastCat = c.category;
    }
    const tag = customIds.has(c.id) ? dim(useColor, " (custom)") : "";
    lines.push(`  ${cyan(useColor, c.id.padEnd(idW))}  ${c.label}${tag}`);
    lines.push(`  ${" ".repeat(idW)}  ${dim(useColor, c.why)}`);
  }
  lines.push("");
  lines.push(dim(useColor, "  mergegate checks show <id>   full detail + the gate snippet"));
  lines.push(dim(useColor, "  mergegate checks add  <id>   append it into your mergegate.config.json"));
  return lines.join("\n");
}

/** `mergegate checks show <id>` — the rationale, the gate config, and the add hint. */
export function formatCheckDetail(c: CheckEntry, useColor: boolean, isCustom = false): string {
  const snippet = JSON.stringify({ [c.gateName]: c.gate }, null, 2);
  const origin = isCustom ? dim(useColor, " (custom)") : "";
  const lines = [
    `${cyan(useColor, c.id)}  ${bold(useColor, c.label)}${origin}  ${dim(useColor, `[${c.category}]`)}`,
    "",
    `  ${c.why}`,
    "",
    `  ${dim(useColor, "Drop this into the \"gates\" object of mergegate.config.json:")}`,
    snippet.split("\n").map((l) => `  ${l}`).join("\n"),
    "",
    `  ${dim(useColor, `Or add it for me:  mergegate checks add ${c.id}`)}`,
  ];
  return lines.join("\n");
}

function findConfigPath(dir: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Pick a non-colliding gate key: `name`, then `name-2`, `name-3`, … */
function uniqueGateName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}

/** `mergegate checks add <id>` — append the check's gate to mergegate.config.json.
 *  `catalog` is the built-in checks merged with any org checkpack, so a custom check
 *  adds exactly like a built-in one. */
function runAdd(
  ids: string[],
  flags: Record<string, string | boolean>,
  dir: string,
  catalog: CheckEntry[],
): number {
  if (ids.length === 0) {
    console.error("mergegate: `checks add` needs at least one check id (see `mergegate checks`).");
    return 2;
  }
  const entries: CheckEntry[] = [];
  for (const id of ids) {
    const c = catalog.find((x) => x.id === id);
    if (!c) {
      console.error(`mergegate: unknown check "${id}". Run \`mergegate checks\` to list them.`);
      return 2;
    }
    entries.push(c);
  }

  const path = findConfigPath(dir);
  if (!path) {
    console.error(
      `mergegate: no config found in ${dir} (looked for ${CONFIG_FILENAMES.join(", ")}). Run \`mergegate init\` first.`,
    );
    return 2;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`mergegate: ${path}: invalid JSON — ${(e as Error).message}`);
    return 2;
  }
  if (typeof config.gates !== "object" || config.gates === null || Array.isArray(config.gates)) {
    console.error(`mergegate: ${path}: "gates" must be an object — is this a mergegate config?`);
    return 2;
  }
  const gates = config.gates as Record<string, unknown>;
  const existing = new Set(Object.keys(gates));
  const force = Boolean(flags.force);

  const added: string[] = [];
  for (const c of entries) {
    // Idempotent skip: same id already present under its suggested key with the same run.
    const present = gates[c.gateName] as { run?: string } | undefined;
    if (present && present.run === c.gate.run && !force) {
      console.log(`• ${c.id} already present as gate "${c.gateName}" — skipped.`);
      continue;
    }
    const key = force ? c.gateName : uniqueGateName(c.gateName, existing);
    gates[key] = c.gate;
    existing.add(key);
    added.push(`${c.id} → gate "${key}"`);
  }

  if (added.length === 0) {
    console.log("Nothing to add.");
    return 0;
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  console.log(`✔ added ${added.length} check(s) to ${path}:`);
  for (const a of added) console.log(`    ${a}`);
  console.log(`\nThese gates run for every author; agent PRs must pass all of them.`);
  console.log(`Review the \`run\` command(s), then \`mergegate check\` to try them.`);
  return 0;
}

export function cmdChecks(args: string[]): number {
  const { _, flags } = parseFlags(args);
  const useColor = useColorDefault();
  const sub = _[0];
  const dir = resolve(typeof flags.dir === "string" ? flags.dir : ".");

  // Load any org checkpack (explicit `--pack <path>`, else auto-discover beside the
  // config) and merge it over the built-in catalog, so list / show / add all operate on
  // the same combined set. An absent pack leaves the catalog as the built-ins.
  let catalog = CHECKS;
  let customIds = new Set<string>();
  try {
    const explicit = typeof flags.pack === "string" ? resolve(flags.pack) : undefined;
    const { checks } = loadCheckpack(dir, explicit);
    if (checks.length) ({ entries: catalog, customIds } = mergeChecks(checks));
  } catch (e) {
    if (e instanceof CheckpackError) {
      console.error(`mergegate: ${e.message}`);
      return 2;
    }
    throw e;
  }

  // `mergegate checks add <id...>`
  if (sub === "add") return runAdd(_.slice(1), flags, dir, catalog);

  // `mergegate checks show <id>`
  if (sub === "show") {
    const id = _[1];
    if (!id) {
      console.error("mergegate: `checks show` needs a check id (see `mergegate checks`).");
      return 2;
    }
    const c = catalog.find((x) => x.id === id);
    if (!c) {
      console.error(`mergegate: unknown check "${id}". Run \`mergegate checks\` to list them.`);
      return 2;
    }
    if (flags.json) {
      console.log(JSON.stringify(c, null, 2));
    } else {
      console.log(formatCheckDetail(c, useColor, customIds.has(c.id)));
    }
    return 0;
  }

  // `mergegate checks` / `checks list` [--stack <cat> | --category <cat>]
  const catFlag = (typeof flags.stack === "string" && flags.stack) || (typeof flags.category === "string" && flags.category) || null;
  let entries = catalog;
  if (catFlag) {
    if (!isCategory(catFlag)) {
      console.error(`mergegate: unknown category "${catFlag}" (known: ${CHECK_CATEGORIES.join(", ")}).`);
      return 2;
    }
    entries = catalog.filter((c) => c.category === catFlag);
  }
  if (flags.json) {
    console.log(JSON.stringify(entries, null, 2));
    return 0;
  }
  console.log(formatChecksList(entries, useColor, customIds));
  return 0;
}
