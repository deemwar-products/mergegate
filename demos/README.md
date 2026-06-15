# mergegate demos

House-style demo videos for each MVP story. Rendered with the auto-demo toolkit
(`~/muthu/deemwarworkspace/auto-demo/bin/produce.ts <storyboard> --house`).

| Story | Storyboard | Output (staged for CEO) | Shows |
|---|---|---|---|
| 1 — the gate | `story1-gate.json` | `ceo/demos/mergegate-gate.mp4` | Agent PR BLOCKED on missing spec + broken test → fixed → PASS. |
| 2 — governance | `story2-governance.json` | `ceo/demos/mergegate-governance.mp4` | `init` scaffolding; same change PASSES for a human, BLOCKED for an agent. |
| 3 — enforcement | `story3-enforce.json` | `ceo/demos/mergegate-enforce.mp4` | Pre-push hook rejects a real `git push` to main, then lets it land once green. |

`setup-sandbox.sh <scenario>` builds the deterministic sandbox each tape drives
(`blocked` · `green` · `governance` · `init` · `hook`). The tapes source it under
VHS `Hide`/`Show` so only the demo commands appear on screen.

Regenerate one:

```sh
cd ~/muthu/deemwarworkspace/auto-demo
bin/produce.ts ~/muthu/deemwarworkspace/products/mergegate/demos/story1-gate.json --house
cp artifacts/mergegate-gate/final.mp4 ~/muthu/deemwarworkspace/products/mergegate/ceo/demos/mergegate-gate.mp4
```

The `.mp4` outputs are git-ignored (large binaries); the storyboards + setup script
are the source of truth.
