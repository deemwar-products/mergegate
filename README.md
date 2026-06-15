# mergegate

**Block any autonomous-agent PR from touching `main` until it provably passes spec + build + tests + checks.**

Agents open pull requests now. A lot of them. The good ones are green; the rest are
plausible-looking diffs that don't build, skip the tests, or were never specified.
Branch protection asks *"did a check run?"* — `mergegate` asks the question that
actually matters:

> **Is this change provably done — spec, build, tests, checks — and is it from an agent that has to prove it?**

mergegate is one small, zero-dependency gate you drop in front of `main`. It runs your
four pillars, classifies *who* authored the change, and holds agent PRs to a stricter
bar than humans — because an unattended agent doesn't get the benefit of the doubt.

```
✘ BLOCKED — 2 required gate(s) not green: spec, tests
  agent-authored change → all gates required. Fix the above, then re-run `mergegate check`.
```

---

## Why

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
| `policy.agentAuthors` | Patterns (regex) that classify an author as an agent. |
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
| `mergegate check --format json\|markdown` | Machine-readable / PR-comment verdict. |

## License

MIT © deemwar — questions / design-partner: **deemwar.com/contact**
