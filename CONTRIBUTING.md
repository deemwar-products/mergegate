# Contributing

## Add a coding agent to the registry

mergegate detects autonomous agents by their commit identity. The list lives in one file:
[`src/agents.ts`](src/agents.ts). Adding one is a single entry + a PR.

```ts
{ id: "my-agent", label: "My Agent", match: ["my-agent\\[bot\\]"], url: "https://..." },
```

**The one rule that keeps the gate safe:** every `match` pattern must anchor to an identity
a human cannot accidentally own:

- ✅ a GitHub App `[bot]` login — `my-agent\\[bot\\]`
- ✅ a vendor noreply / email domain — `noreply@myagent\\.com`, `@myagent\\.com`
- ❌ a bare first name or common word — `devin`, `claude`, `cursor` would block a human
  contributor *named* Devin or Claude. We don't merge those.

Then:

1. `npm test` — the registry canary (`tests/agents.test.ts`) asserts no entry misclassifies a
   human named like an agent. Add your agent's identity to the positive cases if you like.
2. `mergegate agents` — confirm your entry renders.
3. `mergegate agents --author "<a real commit author from that agent>"` — confirm it matches
   the pattern you expect.
4. Open the PR. Include where you observed the identity (a link to a real agent-authored commit).

## Everything else

mergegate is a zero-dependency bun + TypeScript CLI. `npm test` runs the suite; `npm run build`
produces `bin/mergegate.mjs`. The gate dogfoods itself — `mergegate check` must stay green.
