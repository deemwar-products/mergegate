#!/usr/bin/env bash
# Sandbox for the "granular, identity-aware policy rules" demo.
# Usage: source setup-identity.sh
# A Dependabot dependency-bump PR (no spec ref) against a config whose identity rule
# relaxes Dependabot to build+tests only — while feature agents still need every gate.
# Defines `mg` -> the real mergegate binary, and cd's into the sandbox.
set -uo pipefail

_MG_REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
MERGEGATE_BIN="${MERGEGATE_BIN:-$_MG_REPO/bin/mergegate.mjs}"
SB="/tmp/mergegate-identity-demo"

mg() { node "$MERGEGATE_BIN" "$@"; }

rm -rf "$SB"; mkdir -p "$SB"; cd "$SB" || return 1
git init -q -b main
# The PR is authored by Dependabot — a low-risk dependency-bump agent.
git config user.name "dependabot[bot]"
git config user.email "49699333+dependabot[bot]@users.noreply.github.com"

cat > package.json <<'JSON'
{ "name": "payments-api", "scripts": { "build": "echo 'compiled ✓'", "test": "echo 'ok - 42 passed'" } }
JSON
echo 'lodash@4.17.20' > deps.lock

cat > mergegate.config.json <<'JSON'
{
  "version": 1,
  "protectedBranch": "main",
  "gates": {
    "spec":  { "builtin": "spec", "required": true },
    "build": { "run": "npm run build", "required": true },
    "tests": { "run": "npm test", "required": true }
  },
  "policy": {
    "agent": { "requireAll": true },
    "human": { "requireAll": false },
    "identities": [
      { "match": "dependabot", "label": "dep-bumps", "requireGates": ["build", "tests"] }
    ]
  }
}
JSON

git add -A
git commit -qm "chore: bootstrap payments-api (spec 14)"

# Dependabot's PR: a routine bump, no spec/issue reference (bumps don't have specs).
echo 'lodash@4.17.21' > deps.lock
git commit -aqm "chore(deps): bump lodash from 4.17.20 to 4.17.21"

clear
