import { writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

/** The pre-push hook script. Blocks pushing the protected branch unless `mergegate gate` passes. */
export function hookScript(runner: string): string {
  return `#!/usr/bin/env bash
# Installed by \`mergegate install-hook\`. Blocks a push to the protected branch
# unless the merge gate is green. Bypass once (emergency only): MERGEGATE_SKIP=1 git push
set -euo pipefail

if [ "\${MERGEGATE_SKIP:-}" = "1" ]; then
  echo "mergegate: skipped via MERGEGATE_SKIP=1" >&2
  exit 0
fi

protected="$(${runner} gate --print-branch 2>/dev/null || echo main)"

while read -r local_ref local_sha remote_ref remote_sha; do
  case "\${remote_ref}" in
    refs/heads/"\${protected}")
      echo "mergegate: running the merge gate before pushing to \${protected} ..." >&2
      if ! ${runner} gate; then
        echo "mergegate: BLOCKED push to \${protected} -- gate not green (override: MERGEGATE_SKIP=1)." >&2
        exit 1
      fi
      ;;
  esac
done
exit 0
`;
}

function detectRunner(dir: string): string {
  // Prefer a locally resolvable binary; fall back to bunx/npx.
  if (existsSync(join(dir, "node_modules", ".bin", "mergegate"))) return "./node_modules/.bin/mergegate";
  const which = spawnSync("which", ["mergegate"], { encoding: "utf8" });
  if (which.status === 0) return "mergegate";
  return "bunx mergegate";
}

export function cmdInstallHook(args: string[]): number {
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = resolve(dirArg ?? ".");
  const gitDir = join(dir, ".git");
  if (!existsSync(gitDir)) {
    console.error(`mergegate: ${dir} is not a git repository (no .git).`);
    return 2;
  }
  const hooksDir = join(gitDir, "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, "pre-push");
  if (existsSync(hookPath) && !args.includes("--force")) {
    console.error(`mergegate: ${hookPath} already exists. Use --force to overwrite.`);
    return 2;
  }
  writeFileSync(hookPath, hookScript(detectRunner(dir)));
  chmodSync(hookPath, 0o755);
  console.log(`✔ installed pre-push hook at .git/hooks/pre-push`);
  console.log("  pushes to the protected branch now run the merge gate first.");
  console.log("  emergency bypass: MERGEGATE_SKIP=1 git push");
  return 0;
}
