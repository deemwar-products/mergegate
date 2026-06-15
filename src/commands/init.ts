import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

interface Stack {
  build: string;
  tests: string;
  checks: string;
}

/** Best-effort detection of the repo's build/test/check commands. */
export function detectStack(dir: string): Stack {
  const has = (f: string) => existsSync(join(dir, f));
  if (has("package.json")) {
    let scripts: Record<string, unknown> = {};
    try {
      scripts = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts ?? {}) as Record<string, unknown>;
    } catch { /* ignore */ }
    const runner = has("bun.lockb") || has("bun.lock") ? "bun run" : has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm run";
    return {
      build: scripts.build ? `${runner} build` : "echo 'no build step' ",
      tests: scripts.test ? (runner === "npm run" ? "npm test" : `${runner} test`) : "echo 'no tests configured — add one' && exit 1",
      checks: scripts.lint ? `${runner} lint` : scripts.typecheck ? `${runner} typecheck` : "echo 'no checks configured'",
    };
  }
  if (has("Cargo.toml")) return { build: "cargo build --locked", tests: "cargo test", checks: "cargo clippy -- -D warnings" };
  if (has("go.mod")) return { build: "go build ./...", tests: "go test ./...", checks: "go vet ./..." };
  if (has("pyproject.toml") || has("requirements.txt")) return { build: "echo 'no build step'", tests: "pytest -q", checks: "ruff check ." };
  return { build: "echo 'set your build command'", tests: "echo 'set your test command' && exit 1", checks: "echo 'set your checks command'" };
}

export function defaultConfig(stack: Stack): object {
  return {
    $schema: "https://github.com/deemwar/mergegate/schema.json",
    version: 1,
    protectedBranch: "main",
    gates: {
      spec: {
        description: "Every commit must reference a spec or issue (proof the work was specified).",
        builtin: "spec",
        required: true,
      },
      build: { description: "The project builds.", run: stack.build, required: true },
      tests: { description: "The test suite passes.", run: stack.tests, required: true },
      checks: { description: "Lint / typecheck / static analysis.", run: stack.checks, required: false },
    },
    policy: {
      _comment: "Agent-authored changes must pass EVERY gate. Human changes honor each gate's `required`.",
      agent: { requireAll: true },
      human: { requireAll: false },
    },
  };
}

const WORKFLOW = `name: mergegate
# Block any PR — especially autonomous-agent PRs — from merging until the gate is green.
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
  pull-requests: write # so mergegate can post the verdict as a PR comment
jobs:
  mergegate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # mergegate needs branch history for the spec gate
      # One line. Auto-detects the agent author and holds it to every gate.
      - uses: deemwar/mergegate@v0
`;

export function cmdInit(args: string[]): number {
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = resolve(dirArg ?? ".");
  const force = args.includes("--force");
  const configPath = join(dir, "mergegate.config.json");

  if (existsSync(configPath) && !force) {
    console.error(`mergegate: ${configPath} already exists. Use --force to overwrite.`);
    return 2;
  }
  const stack = detectStack(dir);
  writeFileSync(configPath, JSON.stringify(defaultConfig(stack), null, 2) + "\n");
  console.log(`✔ wrote mergegate.config.json (detected: build=\`${stack.build}\`, tests=\`${stack.tests}\`)`);

  if (!args.includes("--no-workflow")) {
    const wfDir = join(dir, ".github", "workflows");
    mkdirSync(wfDir, { recursive: true });
    const wfPath = join(wfDir, "mergegate.yml");
    if (!existsSync(wfPath) || force) {
      writeFileSync(wfPath, WORKFLOW);
      console.log("✔ wrote .github/workflows/mergegate.yml (PR gate on main)");
    }
  }

  console.log("\nNext:");
  console.log("  1. Review mergegate.config.json — wire build/tests/checks to your real commands.");
  console.log("  2. `mergegate check` locally to see the verdict.");
  console.log("  3. `mergegate install-hook` to block pushes to main that aren't green.");
  return 0;
}
