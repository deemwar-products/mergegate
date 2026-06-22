# mergegate

**GitHub gates on branches, not on _who_ opened the PR. mergegate gates on the author —
and holds autonomous-agent PRs to a provably-done bar (spec + build + tests + checks)
before they touch `main`.**

Agents open pull requests now. A lot of them. The good ones are green; the rest are
plausible-looking diffs that don't build, skip the tests, or were never specified — and
nobody's reviewing them at 3am.

Here's the gap. GitHub branch protection and rulesets let you require checks on a
*branch*. They **cannot condition on the PR author** — author is bypass-only, never a
trigger ([verified in the ruleset
docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)).
So you can't say *"if an agent opened this PR, require **every** gate"* — the one rule
that matters when most of your PR volume is unattended.

That's the sentence mergegate exists to express:

> **If an agent opened this PR, it must be provably done — spec, build, tests, checks — before it merges. Humans keep a lighter, configurable bar.**

mergegate is one small, zero-dependency gate you drop in front of `main`. It classifies
*who* authored the change, runs your four pillars, and holds agent PRs to a stricter bar
than humans — because an unattended agent doesn't get the benefit of the doubt.

```
✘ BLOCKED — 2 required gate(s) not green: spec, tests
  agent-authored change → all gates required. Fix the above, then re-run `mergegate check`.
```

---

## Why

- **GitHub can't gate on the author; mergegate can.** Rulesets condition on the branch,
  the file paths, the checks — never on *who* opened the PR. mergegate keys the policy
  on the author identity, so "agent-authored ⇒ every gate required" becomes an
  enforceable rule, not a wish.
- **Branch protection counts checks; it doesn't judge done-ness.** A passing lint job
  next to a missing spec and a skipped test suite still merges.
- **Agent PRs need a higher bar.** A human reviewer reads intent. An agent at 3am has
  no reviewer — so the gate *is* the reviewer. mergegate makes "agent-authored ⇒ every
  gate required" the default, while letting humans keep a lighter, configurable bar.
- **Spec is a first-class gate.** "No spec reference, no merge" is built in — the
  cheapest way to stop unscoped agent drift before it reaches your default branch.

This is the merge-gate we run over our own agent fleet, packaged as a per-repo gate
you can adopt in two commands.

## Install

```sh
# zero-install, one-off
bunx mergegate check          # or: npx mergegate check

# per repo
bun add -d mergegate          # or: npm i -D mergegate
```

Requires Node 18+ (or Bun). No runtime dependencies.

## Quick start

```sh
mergegate init            # scaffold mergegate.config.json + a GitHub Actions gate
mergegate check           # run every gate, print the verdict, exit non-zero if BLOCKED
mergegate install-hook    # block local pushes to main that aren't green
```

`mergegate init` detects your stack (npm / pnpm / bun / cargo / go / python) and wires
sensible `build` / `tests` / `checks` commands — review them, then you're gated.

**Step 1 once it's scaffolded: teach mergegate _your_ agents.** The defaults catch 13
public agents (Copilot, Cursor, Devin, Claude Code, Codex, …) — but if your own fleet
commits under a plain `team@company.com` noreply (no `[bot]` login, no vendor domain),
mergegate can't see it's an agent and it gets the lighter human bar. Add your fleet's
commit identity — this is _added_ to the defaults, not a replacement:

```jsonc
// mergegate.config.json
"policy": {
  "extraAgentAuthors": ["bot@acme\\.dev", "ci@acme\\.com"]  // matched against "<name> <email>", case-insensitive regex
}
```

Then prove it: `mergegate agents check` audits your repo's recent authors and shows
exactly who'd be gated as an agent vs. who stays human — so you catch a leak before it ships.

## How it works

```
 change ─▶ classify author ─▶ run gates ─▶ apply policy ─▶ verdict
            (agent | human)    spec        agent  ⇒ ALL gates required
                               build       human  ⇒ each gate's own `required`
                               tests
                               checks
```

1. **Classify the author.** The HEAD author (`Name <email>`) is matched against
   agent-author patterns (`[bot]`, `copilot-swe-agent`, `dependabot`, `claude`,
   `noreply@anthropic.com`, …). Override with `--agent` / `--human`.
2. **Run the gates.** Each gate is either a shell command (passes on exit 0) or the
   built-in **spec** gate (every commit on the branch must reference a spec/issue).
3. **Apply policy.** Agent-authored changes must pass **every** gate. Human changes
   honor each gate's `required` flag. The verdict's exit code is `0` (clear to merge)
   or `1` (BLOCKED). Config/usage errors are exit `2`.

## Configuration

`mergegate.config.json`:

```json
{
  "version": 1,
  "protectedBranch": "main",
  "gates": {
    "spec":   { "builtin": "spec", "required": true },
    "build":  { "run": "npm run build", "required": true },
    "tests":  { "run": "npm test", "required": true },
    "checks": { "run": "npm run lint", "required": false }
  },
  "policy": {
    "agent": { "requireAll": true },
    "human": { "requireAll": false }
  }
}
```

| Field | Meaning |
|---|---|
| `gates.<name>.run` | Shell command; the gate passes when it exits `0`. |
| `gates.<name>.builtin` | `"spec"` — every commit on the branch must match a spec/issue pattern. |
| `gates.<name>.pattern` | Override the spec regex (default matches `spec 28`, `#112`, `PROJ-7`). |
| `gates.<name>.required` | Whether the gate blocks human-authored changes (agents always require all). |
| `policy.extraAgentAuthors` | **Your fleet's identities — added to the built-in registry.** The knob to set first (regex vs. `"<name> <email>"`). |
| `policy.agentAuthors` | Patterns (regex) that classify an author as an agent. Setting this *replaces* the built-in registry — prefer `extraAgentAuthors` unless you mean to redefine detection wholesale. |
| `policy.agent.requireAll` | Agent PRs must pass every gate (default `true`). |
| `policy.human.requireAll` | Force the strict bar for humans too (default `false`). |

## In CI (GitHub Actions) — one line

`mergegate init` drops `.github/workflows/mergegate.yml`. Adoption is a single `uses:` line —
no YAML rule engine, no merge-queue migration:

```yaml
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
  pull-requests: write   # so mergegate can post the verdict comment
jobs:
  mergegate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: deemwar/mergegate@v0   # auto-detects the agent author, holds it to every gate
```

The Action runs the gate keyed on the PR author, **upserts the verdict as a PR comment**
(`mergegate --format markdown`), and fails the required check when an agent PR isn't provably
done — so it can't merge. That's the productized promise.

## Pre-push hook

`mergegate install-hook` writes a `pre-push` hook that runs the gate before any push to
the protected branch:

```
mergegate: running the merge gate before pushing to main…
mergegate: ✘ push to main BLOCKED — gate not green (override: MERGEGATE_SKIP=1).
```

Emergency bypass (human, deliberate): `MERGEGATE_SKIP=1 git push`.

## Commands

| Command | Does |
|---|---|
| `mergegate check` | Run gates against the current change, print the verdict. |
| `mergegate gate` | Same as `check`, tuned for CI. |
| `mergegate init` | Scaffold config + GitHub Actions workflow. |
| `mergegate install-hook` | Install the pre-push gate. |
| `mergegate agents` | List the coding agents mergegate detects out of the box. |
| `mergegate agents --author "<name> <email>"` | Probe one author — agent/human + which pattern fired. |
| `mergegate agents check` | Audit a repo's recent commit authors — proves the gate won't block a human. |
| `mergegate check --format json\|markdown` | Machine-readable / PR-comment verdict. |

## Known agents

mergegate ships a curated registry of coding-agent identities (`src/agents.ts`), so
human-vs-agent classification works out of the box — Copilot, Cursor, Devin, Claude Code,
Codex, Dependabot, Renovate, Jules, Sweep, Aider, and the generic `[bot]` accounts.

```
$ mergegate agents
mergegate · 13 known coding agents detected out of the box
  copilot-swe-agent  GitHub Copilot coding agent  copilot-swe-agent, copilot\[bot\]
  ...
```

**The gate's job is to stop agents without ever blocking a human.** Every pattern is
anchored to an identity a human can't accidentally own — a GitHub App `[bot]` login or a
vendor noreply domain — *never* a bare first name. So a contributor named **Devin** or
**Claude** stays human:

```
$ mergegate agents --author "Devin Carter <devin.carter@gmail.com>"
human  — no known agent matched "Devin Carter <devin.carter@gmail.com>"
```

Before you turn the gate on, audit your own repo's history to confirm none of your people
get misclassified:

```
$ mergegate agents check
  human  Devin Carter <devin.carter@gmail.com>
  agent  copilot-swe-agent <bot@users.noreply.github.com>  → copilot-swe-agent /copilot-swe-agent/
```

**Your own fleet missing?** Don't edit source — add its commit identity to
`policy.extraAgentAuthors` in your config (see [Quick start](#quick-start)). That's the
right path for an org's private agents; it merges on top of the built-in registry.

**A _public_ agent missing?** Add one entry to `src/agents.ts` (anchored to a `[bot]`
login or noreply domain — see the safety rule at the top of the file) and open a PR. The
registry is community-maintained; new agents ship every month.

## Running an agent fleet?

mergegate is the gate we run over our own fleet of autonomous agents, opened up as OSS.
We dogfood it honestly: we pointed it at our own 19 agent-built repos and found our top
committer is a bot with 170+ commits that the *defaults* waved through as human — because
it commits under a plain noreply email, not a `[bot]` login. That's the whole point. GitHub
can't see *who* opened a PR, and even a tool that can won't help until it knows *your*
agents' faces. The fix was one line of `extraAgentAuthors` (above) — set yours first.

If your team is drowning in agent-authored PRs — or you'd want this as a hosted,
per-repo gate with a dashboard of gate outcomes — tell us what you'd need:

> **[deemwar.com/contact](https://deemwar.com/contact)** — design-partner / "I'd pay for this unbundled".

## License

MIT © deemwar — questions / design-partner: **[deemwar.com/contact](https://deemwar.com/contact)**
