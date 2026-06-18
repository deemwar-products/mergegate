#!/usr/bin/env bash
# Build a deterministic sandbox repo for the mergegate demos.
# Usage: source setup-sandbox.sh <scenario>   (scenarios: blocked | green | init)
# Defines `mg` -> the real mergegate binary, and cd's into the sandbox.
set -uo pipefail

# Resolve the repo root from this script's own location so the demo is portable
# (works for anyone who clones); override with MERGEGATE_BIN if needed.
_MG_REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
MERGEGATE_BIN="${MERGEGATE_BIN:-$_MG_REPO/bin/mergegate.mjs}"
SB="/tmp/mergegate-demo"
SCENARIO="${1:-blocked}"

mg() { node "$MERGEGATE_BIN" "$@"; }

rm -rf "$SB"; mkdir -p "$SB"; cd "$SB" || return 1
git init -q -b main
# The PR is authored by an autonomous coding agent.
git config user.name "copilot-swe-agent"
git config user.email "copilot-swe-agent@users.noreply.github.com"

cat > package.json <<'JSON'
{
  "name": "payments-api",
  "scripts": {
    "build": "echo 'compiled ✓'",
    "test": "node retry.test.js",
    "lint": "echo 'lint ✓'"
  }
}
JSON

cat > mergegate.config.json <<'JSON'
{
  "version": 1,
  "protectedBranch": "main",
  "gates": {
    "spec":   { "builtin": "spec", "required": true },
    "build":  { "run": "npm run build", "required": true },
    "tests":  { "run": "npm test", "required": true },
    "checks": { "run": "npm run lint", "required": false }
  },
  "policy": { "agent": { "requireAll": true }, "human": { "requireAll": false } }
}
JSON

# A passing test harness; the agent's change will break it in the "blocked" scenario.
cat > retry.js <<'JS'
exports.retries = 3;
JS
cat > retry.test.js <<'JS'
const { retries } = require("./retry.js");
if (retries !== 3) { console.error("FAIL: expected 3 retries, got " + retries); process.exit(1); }
console.log("ok - retry policy");
JS

git add -A
git commit -qm "chore: bootstrap payments-api (spec 14)"

if [ "$SCENARIO" = "blocked" ]; then
  # The agent's PR: changes behavior, breaks the test, and references no spec.
  echo 'exports.retries = 99;' > retry.js
  git commit -aqm "tweak retry backoff"
elif [ "$SCENARIO" = "green" ]; then
  # The agent's PR, done right: behavior + test updated, spec referenced.
  echo 'exports.retries = 5;' > retry.js
  sed -i '' 's/!== 3/!== 5/; s/expected 3/expected 5/' retry.test.js
  git commit -aqm "fix: raise retry ceiling to 5 (spec 14)"
elif [ "$SCENARIO" = "governance" ]; then
  # A reasonable change: spec referenced, build + tests green — but lint (optional) is red.
  echo 'exports.retries = 5;' > retry.js
  sed -i '' 's/!== 3/!== 5/; s/expected 3/expected 5/' retry.test.js
  # Make the optional `checks` gate (lint) fail.
  node -e "const f='package.json',j=require('./'+f);j.scripts.lint='echo \"style: 2 lint warnings\" && exit 1';require('fs').writeFileSync(f,JSON.stringify(j,null,2))"
  git commit -aqm "fix: raise retry ceiling to 5 (spec 14)"
elif [ "$SCENARIO" = "init" ]; then
  rm -f mergegate.config.json
  rm -rf .github
elif [ "$SCENARIO" = "hook" ]; then
  # A local mergegate shim so the git hook (a separate process) can find the binary.
  mkdir -p node_modules/.bin
  printf '#!/usr/bin/env bash\nexec node "%s" "$@"\n' "$MERGEGATE_BIN" > node_modules/.bin/mergegate
  chmod +x node_modules/.bin/mergegate
  # A bare remote to push at.
  REMOTE="/tmp/mergegate-demo-remote.git"
  rm -rf "$REMOTE"; git init -q --bare "$REMOTE"
  git remote add origin "$REMOTE"
  # The agent's bad PR: breaks the test, no spec reference.
  echo 'exports.retries = 99;' > retry.js
  git commit -aqm "tweak retry backoff"
  # Install the pre-push gate.
  node "$MERGEGATE_BIN" install-hook >/dev/null 2>&1
fi

clear
