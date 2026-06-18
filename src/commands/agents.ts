import { resolve } from "node:path";
import { AGENTS, explainMatch, type AgentEntry } from "../agents.ts";
import { isGitRepo, recentAuthors } from "../git.ts";
import type { AuthorClass } from "../types.ts";

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
const yellow = (on: boolean, s: string) => paint(on, "33", s);
const green = (on: boolean, s: string) => paint(on, "32", s);

/** Classify one "<name> <email>" against the registry, reporting the entry + the
 *  specific pattern that fired. The auditor's core primitive. */
export function probeAuthor(author: string): { cls: AuthorClass; entry: AgentEntry | null; pattern: string | null } {
  const hit = explainMatch(author);
  if (hit) return { cls: "agent", entry: hit.entry, pattern: hit.pattern };
  return { cls: "human", entry: null, pattern: null };
}

/** The default `mergegate agents` table: every known agent + the patterns it matches. */
export function formatAgentsList(useColor: boolean): string {
  const idW = Math.max(2, ...AGENTS.map((a) => a.id.length));
  const labelW = Math.max(5, ...AGENTS.map((a) => a.label.length));
  const lines: string[] = [];
  lines.push(`mergegate · ${AGENTS.length} known coding agents detected out of the box`);
  lines.push("");
  lines.push(dim(useColor, `  ${"ID".padEnd(idW)}  ${"LABEL".padEnd(labelW)}  PATTERNS`));
  for (const a of AGENTS) {
    lines.push(`  ${a.id.padEnd(idW)}  ${a.label.padEnd(labelW)}  ${dim(useColor, a.match.join(", "))}`);
  }
  lines.push("");
  lines.push(dim(useColor, "  Add yours (one entry, anchored to a [bot] login or noreply domain):"));
  lines.push(dim(useColor, "  https://github.com/deemwar/mergegate  → edit src/agents.ts"));
  return lines.join("\n");
}

function formatProbe(author: string, useColor: boolean): string {
  const { cls, entry, pattern } = probeAuthor(author);
  if (cls === "agent") {
    return `${yellow(useColor, "agent")}  ✔ ${entry!.label} (${entry!.id}) — matched ${dim(useColor, `/${pattern}/`)}`;
  }
  return `${green(useColor, "human")}  — no known agent matched ${dim(useColor, `"${author}"`)}`;
}

function runCheck(flags: Record<string, string | boolean>, useColor: boolean): number {
  const dir = resolve(typeof flags.dir === "string" ? flags.dir : ".");
  const limit = typeof flags.limit === "string" ? Math.max(1, parseInt(flags.limit, 10) || 20) : 20;
  if (!isGitRepo(dir)) {
    console.error(`mergegate: ${dir} is not a git repo — \`agents check\` audits commit authors.`);
    return 2;
  }
  const authors = recentAuthors(dir, limit);
  const probed = authors.map((a) => ({ author: a, ...probeAuthor(a) }));

  if (flags.json) {
    console.log(JSON.stringify(probed.map((p) => ({ author: p.author, cls: p.cls, agent: p.entry })), null, 2));
    return 0;
  }

  const agents = probed.filter((p) => p.cls === "agent");
  console.log(`mergegate · audited ${authors.length} recent author(s) in ${dir}\n`);
  for (const p of probed) {
    const tag = p.cls === "agent" ? yellow(useColor, "agent") : green(useColor, "human");
    const why = p.entry ? dim(useColor, `  → ${p.entry.id} /${p.pattern}/`) : "";
    console.log(`  ${tag}  ${p.author}${why}`);
  }
  console.log(
    `\n${agents.length} of ${authors.length} would be gated as agents. ` +
      dim(useColor, "Named like an agent but listed human? Your contributors are safe."),
  );
  return 0;
}

export function cmdAgents(args: string[]): number {
  const { _, flags } = parseFlags(args);
  const useColor = useColorDefault();

  // `mergegate agents check` — audit this repo's real commit authors (the star mode).
  if (_[0] === "check") return runCheck(flags, useColor);

  // `mergegate agents --author "<name> <email>"` — probe a single author.
  if (typeof flags.author === "string") {
    const { cls, entry } = probeAuthor(flags.author);
    if (flags.json) {
      console.log(JSON.stringify({ author: flags.author, cls, agent: entry }, null, 2));
    } else {
      console.log(formatProbe(flags.author, useColor));
    }
    return 0;
  }

  // `mergegate agents --json` — raw registry.
  if (flags.json) {
    console.log(JSON.stringify(AGENTS, null, 2));
    return 0;
  }

  // `mergegate agents` — the list.
  console.log(formatAgentsList(useColor));
  return 0;
}
