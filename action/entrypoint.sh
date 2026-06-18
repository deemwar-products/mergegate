#!/usr/bin/env bash
# mergegate GitHub Action entrypoint. Runs the gate ONCE, surfaces the verdict in the
# Actions log, optionally upserts a PR comment, and exits with the gate's code so the
# required check goes red when an agent PR isn't provably done.
#
# Env contract (set by action.yml; overridable for local smoke tests):
#   MG_BIN     - path to the bundled mergegate CLI (node entry)
#   MG_BASE    - base ref to diff against (default: origin/main)
#   MG_AUTHOR  - PR author "Name <email>" or login (default: empty -> auto-detect)
#   MG_COMMENT - "true" to upsert a PR comment (needs gh + GH_TOKEN + PR context)
#   MG_OUT     - where to write the markdown verdict (default: $RUNNER_TEMP or /tmp)
set -uo pipefail

BIN="${MG_BIN:?MG_BIN is required}"
BASE="${MG_BASE:-origin/main}"
AUTHOR="${MG_AUTHOR:-}"
COMMENT="${MG_COMMENT:-false}"
OUT="${MG_OUT:-${RUNNER_TEMP:-/tmp}/mergegate-verdict.md}"

args=(gate --base "$BASE" --format markdown)
[ -n "$AUTHOR" ] && args+=(--author "$AUTHOR")

node "$BIN" "${args[@]}" > "$OUT"
code=$?

# Surface the verdict in the workflow log (markdown reads fine as plain text).
cat "$OUT"

# Upsert a single PR comment (find our marker, PATCH it; else POST a new one).
# Skip when the verdict is empty (e.g. a config error wrote only to stderr) — an
# empty mergegate comment on a public PR reads as broken.
if [ "$COMMENT" = "true" ] && [ -s "$OUT" ] && command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  pr="${MG_PR:-${PR_NUMBER:-}}"
  repo="${GITHUB_REPOSITORY:-}"
  if [ -n "$pr" ] && [ -n "$repo" ]; then
    existing="$(gh api "repos/$repo/issues/$pr/comments" --jq '.[] | select(.body | contains("<!-- mergegate -->")) | .id' 2>/dev/null | head -1)"
    if [ -n "$existing" ]; then
      gh api -X PATCH "repos/$repo/issues/comments/$existing" -F body=@"$OUT" >/dev/null 2>&1 \
        && echo "mergegate: updated PR comment $existing" >&2
    else
      gh api -X POST "repos/$repo/issues/$pr/comments" -F body=@"$OUT" >/dev/null 2>&1 \
        && echo "mergegate: posted PR comment" >&2
    fi
  fi
fi

exit "$code"
