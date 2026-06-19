# mergegate demos

House-style demo videos for each MVP story, driven by the storyboards in this folder.

| Story | Storyboard | Shows |
|---|---|---|
| 1 — the gate | `story1-gate.json` | Agent PR BLOCKED on missing spec + broken test → fixed → PASS. |
| 2 — governance | `story2-governance.json` | `init` scaffolding; same change PASSES for a human, BLOCKED for an agent. |
| 3 — enforcement | `story3-enforce.json` | Pre-push hook rejects a real `git push` to main, then lets it land once green. |
| — the one-line Action | `story-action.json` | `uses: deemwar/mergegate@v0` posts the markdown verdict on the PR. |
| — the summary digest | `story-summary.json` | `mergegate summary` — one-glance gate digest (author · counts · headline): agent PR BLOCKED → one-line markdown badge → fixed → PASS. Reuses `setup-sandbox.sh blocked`/`green`. |
| — remediation hints | `story-remediation.json` | Actionable fixes in the verdict: each BLOCKING gate gets a `→ fix:` line + a markdown "How to fix" list → agent follows them → PASS. Reuses `setup-sandbox.sh blocked`/`green`. |
| — identity-aware rules | `story-identity.json` | Granular `policy.identities` rules: Dependabot relaxed to build+tests (warns it dropped spec) vs a feature agent still BLOCKED, and `--strict` refusing the relaxed gate. Uses `setup-identity.sh`. |

`setup-sandbox.sh <scenario>` builds the deterministic sandbox each tape drives
(`blocked` · `green` · `governance` · `init` · `hook`); `setup-action.sh <blocked|green>`
does the same for the Action demo. Both self-locate the repo root, so they run from a
fresh clone with no edits. The tapes source them under `Hide`/`Show` so only the demo
commands appear on screen.

The rendered `.mp4` outputs are git-ignored (large binaries) and linked from the main
README / release assets; the storyboards + setup scripts here are the source of truth.
