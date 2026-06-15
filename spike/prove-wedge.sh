#!/usr/bin/env bash
# SPIKE: prove the one thing GitHub branch protection / rulesets CANNOT do —
# condition the merge gate on PR AUTHOR IDENTITY (agent vs human).
#
# Experiment: take ONE identical changeset (same gates, same results: an optional
# `checks` gate is red). Run the gate twice, changing ONLY the author.
#   - human author  -> expect PASS  (optional gate waived)
#   - agent author  -> expect BLOCK (agents must clear EVERY gate)
# If the verdict flips on author identity alone, the wedge mechanism holds.
set -uo pipefail

BIN="${MERGEGATE_BIN:-$(cd "$(dirname "$0")/.." && pwd)/bin/mergegate.mjs}"
SB="$(mktemp -d)"
cd "$SB" || exit 2
export NO_COLOR=1

git init -q -b main
git config user.email dev@example.com; git config user.name dev
cat > package.json <<'JSON'
{ "name": "spike", "scripts": { "build": "echo ok", "test": "echo ok", "lint": "exit 1" } }
JSON
cat > mergegate.config.json <<'JSON'
{
  "version": 1,
  "gates": {
    "build":  { "run": "npm run build", "required": true },
    "tests":  { "run": "npm test",      "required": true },
    "checks": { "run": "npm run lint",  "required": false }
  },
  "policy": { "agent": { "requireAll": true }, "human": { "requireAll": false } }
}
JSON
git add -A; git commit -qm "spike change (spec 1)"

run() { node "$BIN" check --"$1" >/dev/null 2>&1; echo $?; }

human_exit="$(run human)"   # optional `checks` waived -> 0 PASS
agent_exit="$(run agent)"   # every gate required      -> 1 BLOCK

echo "identical change · only the author differs:"
echo "  human author -> exit ${human_exit}  ($([ "$human_exit" = 0 ] && echo PASS || echo BLOCK))"
echo "  agent author -> exit ${agent_exit}  ($([ "$agent_exit" = 0 ] && echo PASS || echo BLOCK))"

rm -rf "$SB"

if [ "$human_exit" = "0" ] && [ "$agent_exit" = "1" ]; then
  echo "SPIKE PASS: the verdict flips on author identity alone."
  echo "            GitHub rulesets cannot express this (author = bypass-only). The wedge holds."
  exit 0
fi
echo "SPIKE FAIL: author-conditioned gating did not hold."
exit 1
