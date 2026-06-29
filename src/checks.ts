// The curated library of pre-built validation checks.
//
// `init` scaffolds the four pillars (spec / build / tests / checks) wired to your
// detected stack. This catalog is the next layer: ready-to-drop-in gates for the
// failure modes that show up specifically in AUTONOMOUS-AGENT pull requests — the
// diffs that "look" done but ship a leftover `debugger`, a focused test that quietly
// skips the rest of the suite, an unresolved conflict marker, or a pasted private key.
//
// A human reviewer catches these by eye. An unattended agent PR at 3am has no reviewer
// — so mergegate ships the eye as a gate you can add in one command (`checks add <id>`).
//
// DESIGN RULES (read before adding an entry):
//  1. A check is just a `GateConfig` — no new evaluator. It runs the same way every
//     other gate does, so it composes with policy/identity rules for free.
//  2. `run` must be POSIX-sh portable and dependency-light. Grep-style hygiene checks
//     use the form `git grep -nE 'PAT' -- <pathspec> && exit 1 || exit 0`: git grep
//     prints the offending lines and exits 0 on a match (→ `exit 1`, gate FAILS and the
//     lines surface in the verdict); exits 1 when clean (→ `exit 0`, gate PASSES). On a
//     non-repo it exits 128 (→ `exit 0`) — fine, mergegate runs on a CI checkout.
//  3. `why` is the agent-PR rationale, in one sentence — it's what `checks show` leads
//     with and the reason a maintainer would add this gate.
//  4. Tool-dependent checks (eslint, ruff, staticcheck) assume the tool is installed in
//     CI; that's a deliberate, documented prerequisite, not a silent pass.

import type { GateConfig } from "./types.ts";

/** Buckets a check belongs to: the stack it targets, universal `hygiene`, or `custom`
 *  for an org-defined check from a checkpack (src/checkpack.ts) that targets no one stack. */
export type CheckCategory = "hygiene" | "node" | "go" | "rust" | "python" | "custom";

export interface CheckEntry {
  /** Stable kebab-case key — unique, used in `checks` output and `checks add <id>`. */
  id: string;
  /** Human-readable display name. */
  label: string;
  /** `hygiene` = language-agnostic; otherwise the stack the check targets. */
  category: CheckCategory;
  /** One sentence: why this matters for an agent-authored PR (the lead line of `show`). */
  why: string;
  /** Suggested key under `gates: {}` when added to a config (collision-suffixed on add). */
  gateName: string;
  /** The gate definition itself — dropped verbatim into config.gates. */
  gate: GateConfig;
}

// ── universal hygiene — the agent-smell catalog (language-agnostic) ──────────────
const HYGIENE: CheckEntry[] = [
  {
    id: "no-conflict-markers",
    label: "No unresolved merge-conflict markers",
    category: "hygiene",
    why: "Agents that auto-resolve a rebase sometimes commit the `<<<<<<<` / `>>>>>>>` markers themselves — the diff compiles in their head but not on disk.",
    gateName: "no-conflict-markers",
    gate: {
      description: "Fail if any tracked file still contains a Git merge-conflict marker.",
      run: "git grep -nE '^(<<<<<<<|>>>>>>>)' -- . && exit 1 || exit 0",
      required: true,
    },
  },
  {
    id: "no-private-keys",
    label: "No committed private keys",
    category: "hygiene",
    why: "An agent scaffolding a deploy or a test fixture can paste a real PEM private key into the repo without realizing it's a secret.",
    gateName: "no-private-keys",
    gate: {
      description: "Fail if a PEM private-key header is committed anywhere in the tree.",
      // ENCRYPTED is a real, leak-worthy header (PKCS#8 'BEGIN ENCRYPTED PRIVATE KEY')
      // — a passphrase isn't a safe place to commit a key. Keep it in the alternation.
      run: "git grep -nE 'BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY' -- . && exit 1 || exit 0",
      required: true,
    },
  },
  {
    id: "no-aws-keys",
    label: "No AWS access-key IDs",
    category: "hygiene",
    why: "Hardcoded cloud credentials are the highest-blast-radius thing an agent can leak; an `AKIA…` literal in a diff is almost never intentional.",
    gateName: "no-aws-keys",
    gate: {
      description: "Fail if an AWS access-key ID (AKIA/ASIA + 16 chars) appears in any tracked file.",
      run: "git grep -nE '(AKIA|ASIA)[0-9A-Z]{16}' -- . && exit 1 || exit 0",
      required: true,
    },
  },
  {
    id: "no-large-files",
    label: "No large files committed (>5 MB)",
    category: "hygiene",
    why: "Agents routinely commit build artifacts, vendored binaries, or a stray `node_modules` blob — bloating history irreversibly.",
    gateName: "no-large-files",
    gate: {
      description: "Fail if any tracked file exceeds 5 MB (adjust the byte threshold to taste).",
      run: "git ls-files | while IFS= read -r f; do [ -f \"$f\" ] && [ \"$(wc -c < \"$f\")\" -gt 5242880 ] && echo \"$f is larger than 5MB\"; done | grep . && exit 1 || exit 0",
      required: false,
    },
  },
];

// ── node / typescript ────────────────────────────────────────────────────────────
const NODE: CheckEntry[] = [
  {
    id: "node-typecheck",
    label: "TypeScript type-check (tsc --noEmit)",
    category: "node",
    why: "Agents write code that runs the happy path but fails the type-checker; tests often don't cover the typed edges tsc does.",
    gateName: "typecheck",
    gate: {
      description: "The project type-checks with no emit.",
      run: "npx --no-install tsc --noEmit",
      required: false,
    },
  },
  {
    id: "eslint",
    label: "ESLint (no errors)",
    category: "node",
    why: "Lint catches the unused imports, undeclared vars, and no-floating-promise mistakes an agent leaves in a plausible-looking diff.",
    gateName: "lint",
    gate: {
      description: "ESLint passes with zero errors.",
      run: "npx --no-install eslint .",
      required: false,
    },
  },
  {
    id: "prettier-check",
    label: "Prettier formatting check",
    category: "node",
    why: "Keeps an agent's reformat-the-world diffs out of review — code must already match the repo's format, not just be reformattable.",
    gateName: "format",
    gate: {
      description: "All files match Prettier formatting (no rewrite needed).",
      run: "npx --no-install prettier --check .",
      required: false,
    },
  },
  {
    id: "no-focused-tests-js",
    label: "No focused tests (.only / fdescribe / fit)",
    category: "node",
    why: "A single `it.only` or `fdescribe` silently turns the whole suite into one test — the most dangerous green an agent can produce.",
    gateName: "no-focused-tests",
    gate: {
      description: "Fail if a focused test (.only, fdescribe, fit) is committed.",
      // No \b — git grep's POSIX ERE doesn't support it portably (verified on macOS).
      run: "git grep -nE '(describe|context|it|test)\\.only\\(|fdescribe\\(|fit\\(' -- '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs' '*.cjs' && exit 1 || exit 0",
      required: true,
    },
  },
  {
    id: "no-console-log",
    label: "No leftover console.log",
    category: "node",
    why: "Debug `console.log`/`console.debug` lines are the classic agent residue — harmless to compile, noisy in production, and a reviewer's first nit.",
    gateName: "no-debug-logging",
    gate: {
      description: "Fail if console.log / console.debug appears in source (allow it in tests/scripts via pathspec).",
      run: "git grep -nE 'console\\.(log|debug)\\(' -- '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs' '*.cjs' ':!*.test.*' ':!*.spec.*' && exit 1 || exit 0",
      required: false,
    },
  },
];

// ── go ─────────────────────────────────────────────────────────────────────────
const GO: CheckEntry[] = [
  {
    id: "go-vet",
    label: "go vet",
    category: "go",
    why: "vet catches the printf mismatches, lost struct tags, and shadowed errors an agent's code compiles past.",
    gateName: "vet",
    gate: { description: "go vet reports no issues.", run: "go vet ./...", required: false },
  },
  {
    id: "gofmt",
    label: "gofmt formatting check",
    category: "go",
    why: "Enforces canonical Go formatting so an agent's diff is reviewable, not a whitespace storm.",
    gateName: "gofmt",
    gate: {
      description: "All Go files are gofmt-clean.",
      run: "test -z \"$(gofmt -l .)\" || { echo 'gofmt needed:'; gofmt -l .; exit 1; }",
      required: false,
    },
  },
  {
    id: "staticcheck",
    label: "staticcheck",
    category: "go",
    why: "Deeper static analysis than vet — surfaces the dead code and misused stdlib calls agents generate from stale patterns.",
    gateName: "staticcheck",
    gate: { description: "staticcheck passes (requires staticcheck on PATH).", run: "staticcheck ./...", required: false },
  },
  {
    id: "no-skipped-tests-go",
    label: "No newly skipped Go tests (t.Skip)",
    category: "go",
    why: "An agent that can't make a test pass will sometimes `t.Skip` it instead — a green suite that proves nothing.",
    gateName: "no-skipped-tests",
    gate: {
      description: "Fail if t.Skip( appears in a _test.go file.",
      run: "git grep -nE 't\\.Skip(Now)?\\(' -- '*_test.go' && exit 1 || exit 0",
      required: false,
    },
  },
];

// ── rust ─────────────────────────────────────────────────────────────────────────
const RUST: CheckEntry[] = [
  {
    id: "cargo-clippy",
    label: "cargo clippy (deny warnings)",
    category: "rust",
    why: "Clippy with -D warnings turns the lints an agent ignores into a hard gate — unwraps, needless clones, dead code.",
    gateName: "clippy",
    gate: { description: "cargo clippy passes with warnings denied.", run: "cargo clippy --all-targets -- -D warnings", required: false },
  },
  {
    id: "cargo-fmt",
    label: "cargo fmt --check",
    category: "rust",
    why: "Keeps an agent's output rustfmt-canonical so the diff is signal, not formatting churn.",
    gateName: "fmt",
    gate: { description: "All Rust files are rustfmt-clean.", run: "cargo fmt --check", required: false },
  },
  {
    id: "no-dbg-rust",
    label: "No leftover dbg! macros",
    category: "rust",
    why: "`dbg!(...)` is the Rust equivalent of a forgotten print — it compiles, ships, and spams stderr.",
    gateName: "no-dbg",
    gate: {
      description: "Fail if a dbg! macro is committed.",
      run: "git grep -nE 'dbg!\\(' -- '*.rs' && exit 1 || exit 0",
      required: false,
    },
  },
];

// ── python ───────────────────────────────────────────────────────────────────────
const PYTHON: CheckEntry[] = [
  {
    id: "ruff",
    label: "Ruff lint",
    category: "python",
    why: "Ruff catches the unused imports, undefined names, and bare excepts an agent's plausible-looking Python hides.",
    gateName: "lint",
    gate: { description: "ruff check passes.", run: "ruff check .", required: false },
  },
  {
    id: "mypy",
    label: "mypy type-check",
    category: "python",
    why: "Static types catch the wrong-shape returns and None-handling bugs that an agent's runtime test happened not to hit.",
    gateName: "typecheck",
    gate: { description: "mypy passes.", run: "mypy .", required: false },
  },
  {
    id: "black-check",
    label: "Black formatting check",
    category: "python",
    why: "Code must already be Black-formatted — keeps an agent's reformatting out of the substantive diff.",
    gateName: "format",
    gate: { description: "All files match Black formatting.", run: "black --check .", required: false },
  },
  {
    id: "no-breakpoint-py",
    label: "No leftover breakpoint() / pdb",
    category: "python",
    why: "A stray `breakpoint()` or `pdb.set_trace()` will hang CI or a server forever — an agent drops these while debugging and forgets them.",
    gateName: "no-debugger",
    gate: {
      description: "Fail if breakpoint() / pdb.set_trace() / import pdb is committed.",
      // No \b — git grep's POSIX ERE doesn't support it portably; bound with a char class.
      run: "git grep -nE 'breakpoint\\(\\)|pdb\\.set_trace\\(\\)|^[[:space:]]*import pdb([^[:alnum:]_]|$)' -- '*.py' && exit 1 || exit 0",
      required: false,
    },
  },
];

/** The full curated catalog, in display order (hygiene first, then by stack). */
export const CHECKS: CheckEntry[] = [...HYGIENE, ...NODE, ...GO, ...RUST, ...PYTHON];

/** All categories present, in canonical display order (`custom` last — org checks
 *  render after the built-ins that share their tab). */
export const CHECK_CATEGORIES: CheckCategory[] = ["hygiene", "node", "go", "rust", "python", "custom"];

/** Look one check up by its id. */
export function findCheck(id: string): CheckEntry | undefined {
  return CHECKS.find((c) => c.id === id);
}

/** Filter the catalog by category (the stack tab) — undefined returns everything. */
export function checksByCategory(category?: CheckCategory): CheckEntry[] {
  return category ? CHECKS.filter((c) => c.category === category) : CHECKS;
}

/** Overlay an org checkpack onto the built-in catalog: a custom entry whose id matches
 *  a built-in REPLACES it (so an org can tighten a default in place), and a new id is
 *  appended. Returns the merged catalog in canonical category order, plus the set of ids
 *  the pack contributed — the command layer tags those `(custom)`. Pure: it never reads
 *  files (the caller supplies the parsed pack), so it's trivially testable. */
export function mergeChecks(custom: CheckEntry[]): { entries: CheckEntry[]; customIds: Set<string> } {
  const customIds = new Set(custom.map((c) => c.id));
  const byId = new Map<string, CheckEntry>();
  for (const c of CHECKS) byId.set(c.id, c);
  for (const c of custom) byId.set(c.id, c); // override a built-in id, or add a new one
  const all = [...byId.values()];
  const entries = CHECK_CATEGORIES.flatMap((cat) => all.filter((c) => c.category === cat));
  return { entries, customIds };
}
