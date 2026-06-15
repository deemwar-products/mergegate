#!/usr/bin/env bash
# Sandbox for the "one uses: line" GitHub-Action demo.
# Usage: source setup-action.sh <blocked|green>
# Defines `mgaction` -> runs the real Action entrypoint and prints the markdown verdict
# (exactly what gets posted as the PR comment), and cd's into the sandbox.
set -uo pipefail

REPO="/Users/muthuishere/muthu/deemwarworkspace/products/mergegate"
MERGEGATE_BIN="$REPO/bin/mergegate.mjs"
ENTRY="$REPO/action/entrypoint.sh"
SB="/tmp/mergegate-action-demo"
SCENARIO="${1:-blocked}"

mgaction() {
  MG_BIN="$MERGEGATE_BIN" MG_COMMENT=false MG_BASE=main NO_COLOR=1 \
    bash "$ENTRY" 2>/dev/null
}

rm -rf "$SB"; mkdir -p "$SB"; cd "$SB" || return 1
git init -q -b main
git config user.name "copilot-swe-agent"
git config user.email "copilot-swe-agent@users.noreply.github.com"

cat > package.json <<'JSON'
{ "name": "payments-api", "scripts": { "build": "echo compiled", "test": "node retry.test.js", "lint": "echo lint ok" } }
JSON
cat > mergegate.config.json <<'JSON'
{
  "version": 1, "protectedBranch": "main",
  "gates": {
    "spec":   { "builtin": "spec", "required": true },
    "build":  { "run": "npm run build", "required": true },
    "tests":  { "run": "npm test", "required": true },
    "checks": { "run": "npm run lint", "required": false }
  },
  "policy": { "agent": { "requireAll": true }, "human": { "requireAll": false } }
}
JSON
mkdir -p .github/workflows
cat > .github/workflows/mergegate.yml <<'YAML'
name: mergegate
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
jobs:
  mergegate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: deemwar/mergegate@v0   # <- one line. that's the whole gate.
YAML
cat > retry.js <<'JS'
exports.retries = 3;
JS
cat > retry.test.js <<'JS'
const { retries } = require("./retry.js");
if (retries !== 3) { console.error("FAIL: expected 3 retries, got " + retries); process.exit(1); }
console.log("ok - retry policy");
JS
git add -A; git commit -qm "chore: bootstrap payments-api (spec 14)"

if [ "$SCENARIO" = "blocked" ]; then
  echo 'exports.retries = 99;' > retry.js
  git commit -aqm "tweak retry backoff"
elif [ "$SCENARIO" = "green" ]; then
  echo 'exports.retries = 5;' > retry.js
  sed -i '' 's/!== 3/!== 5/; s/expected 3/expected 5/' retry.test.js
  git commit -aqm "fix: raise retry ceiling to 5 (spec 14)"
fi
clear
