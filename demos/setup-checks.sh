#!/usr/bin/env bash
# Sandbox for the "mergegate checks" library demo: a repo where an agent PR has
# left behind exactly the residue the curated checks catch — an unresolved
# conflict marker and a focused test that silently skips the rest of the suite.
# Usage: source setup-checks.sh
# Defines `mg` -> the real mergegate binary, and cd's into the sandbox.
set -uo pipefail

# Resolve the repo root from this script's own location so the demo is portable.
_MG_REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
MERGEGATE_BIN="${MERGEGATE_BIN:-$_MG_REPO/bin/mergegate.mjs}"
SB="/tmp/mergegate-checks-demo"

mg() { node "$MERGEGATE_BIN" "$@"; }

rm -rf "$SB"; mkdir -p "$SB"; cd "$SB" || return 1
git init -q -b main
git config user.name "claude-code"
git config user.email "noreply@anthropic.com"

# A minimal config with just the spec gate — what `mergegate init` would scaffold
# before you reach for the library.
cat > mergegate.config.json <<'JSON'
{
  "version": 1,
  "protectedBranch": "main",
  "gates": {
    "spec": { "builtin": "spec", "required": true }
  }
}
JSON

# An agent PR that "looks done" — but auto-resolved a rebase badly (left a conflict
# marker) and dropped an it.only while debugging a failing test.
cat > app.test.js <<'JS'
describe.only("retry", () => {
  it("backs off", () => {});
});
JS
cat > app.js <<'JS'
<<<<<<< HEAD
export const retries = 3;
=======
export const retries = 5;
>>>>>>> feature
JS
git add -A
git commit -qm "feat: tune retry backoff (spec 1)"

clear
