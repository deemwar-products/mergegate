#!/usr/bin/env bash
# Sandbox for the "mergegate agents" auditor demo: a repo whose history mixes a
# human contributor NAMED like an agent (Devin) with a real coding agent (Copilot).
# Usage: source setup-agents.sh
# Defines `mg` -> the real mergegate binary, and cd's into the sandbox.
set -uo pipefail

# Resolve the repo root from this script's own location so the demo is portable.
_MG_REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
MERGEGATE_BIN="${MERGEGATE_BIN:-$_MG_REPO/bin/mergegate.mjs}"
SB="/tmp/mergegate-agents-demo"

mg() { node "$MERGEGATE_BIN" "$@"; }

rm -rf "$SB"; mkdir -p "$SB"; cd "$SB" || return 1
git init -q -b main

# A human teammate who happens to be named Devin.
git config user.name "Devin Carter"
git config user.email "devin.carter@gmail.com"
echo "export const retries = 3;" > app.js
git add -A
git commit -qm "feat: initial app (spec 1)"

# An autonomous coding agent opens a PR on the same repo.
git config user.name "copilot-swe-agent"
git config user.email "copilot-swe-agent@users.noreply.github.com"
echo "export const retries = 5;" > app.js
git commit -aqm "tweak retry ceiling (spec 1)"

clear
