# mergegate — tight spec (M0)

*Builder: #mergegate · 2026-06-15 · for CEO go/defer/pivot. Pairs with
[mergegate-validation.md](./mergegate-validation.md) (occupancy + WTP evidence) and the
working spike (the shipped MVP, branch `feat/mvp-merge-gate`).*

> **One line.** mergegate is the gate that holds AI-agent-authored PRs to a stricter,
> evidence-based bar — spec + build + tests + checks — *before* they touch `main`,
> conditioned on the one thing GitHub branch protection literally cannot express: **who
> authored the PR**.

---

## 1. Problem

Autonomous coding agents (Copilot agent, Claude, Codex, Cursor, Devin) now open PRs at
scale — **17M+ agent-authored PRs on GitHub by Mar 2026, 4× in six months**. The quality
gap is measured, not anecdotal: AI-authored PRs merge at **32.7% vs 84.4% for humans**,
are **154% larger**, carry **75% more logic errors**, and wait **4.6× longer** in review
(LinearB, 8.1M-PR dataset). GitHub's own number: **~1 in 10 AI PRs is legitimate.**

The reviewer is the bottleneck, and the reviewer is human. Teams want a *machine* gate
that says "this agent PR is provably done, or it doesn't merge" — without nagging humans,
and **with a stricter bar for agents than for people**, because an unattended agent gets
no benefit of the doubt.

## 2. Who pays / why it could spread

- **Pays (eventually):** engineering teams running fleets of coding agents (the "10 devs ×
  Devin/Claude = 30–40 PRs/dev/month" cohort) who feel the review-bottleneck pain in money.
- **Why it could spread (funnel logic, the deemwar way):** a zero-config OSS CLI + one-line
  GitHub Action is *adopt-in-2-minutes, share-in-a-tweet*. The pain is loud and current
  ("drowning in AI slop PRs"), so a sharp tool rides an existing conversation. Every README
  footer / demo end-card / Action marketplace listing funnels to **deemwar.com/contact**.
- **Honest caveat:** the loudest pain today is *unpaid OSS maintainers* whom GitHub already
  gave a free PR kill-switch (Feb 2026). Paid demand is **plausible but unproven** — see
  validation doc. This is why the recommendation is pivot/validate, not a scalable build.

## 3. The WEDGE (the one defensible thing)

Everything in mergegate's headline except one clause is already free or commoditized:

| Clause | Status |
|---|---|
| "block a PR until build + tests + checks pass" | **~80% free** in GitHub branch protection / required status checks |
| "AI reviews the PR" | **fully commoditized** (CodeRabbit, Greptile, Qodo, …) |
| "stricter bar **for agent-authored PRs**, keyed on author identity" | **genuine native gap** — GitHub rulesets target branches/paths only; PR author is available *only as a bypass*, never as a matching condition |

**The wedge is the author-conditioned, evidence-based gate:** detect that a PR was authored
by an autonomous agent → require it to *prove* spec + build + tests + checks → block at the
merge if not. Not advisory comments. Not "comments resolved" (gameable). Not project-level
"contains AI code." **Per-PR, per-author, evidence = the four pillars passing.**

That is the one sentence no incumbent owns cleanly today (validation doc, §1).

## 4. The build (staged — NOT the scalable version yet)

The thin vertical already exists as the **spike/MVP** (branch `feat/mvp-merge-gate`):
zero-dep CLI (`check`/`gate`/`init`/`install-hook`), built-in `spec` gate + shell
build/tests/checks, **author classification (agent vs human)**, policy (`agent.requireAll`),
pre-push hook + GitHub Actions gate keyed on `pull_request.user.login`. 32 tests, dogfooded.

What a *scalable* build would add (ONLY after WTP is validated — see §5 gate):
1. A published GitHub App / reusable Action so adoption is one `uses:` line.
2. Robust agent-identity detection (bot/app/known-agent registry, commit-trailer + API
   signals) — the technical moat, since native can't do it.
3. Spec gate v2: link a *changed file* to its spec/issue, not just any commit reference.
4. (SaaS, only if partners pay unbundled) hosted dashboard of gate outcomes + per-repo
   governance subscription.

## 5. Risks (and the kill-criteria)

| Risk | Severity | Read |
|---|---|---|
| **Free GitHub baseline** does 80% of the literal promise | **High** | Don't sell "a merge gate." Sell the author-conditioned wedge only. |
| **Mergify `author=`** already enables per-author gating ($21/seat) | **High** | We must beat its ergonomics (one toggle vs YAML afternoon) or we lose. |
| **Incumbents bundle it** (Sonar AI-Code-Assurance, CodeRabbit pre-merge, GitHub rulesets) within 6–12mo | **High** | Window is short; OSS-funnel value survives bundling, paid SaaS may not. |
| **WTP unproven** — paid demand not observed, loudest users don't pay | **High** | Gate the scalable build on 2–3 paying design partners. |
| Agent-identity detection is gameable (spoof author) | Medium | Treat as defense-in-depth, not a security boundary; be honest in copy. |

**Kill / defer criteria:** if 2–3 fleet-running teams won't commit to *paying for an
unbundled* agent-PR gate, do **not** build the scalable SaaS — keep mergegate as an OSS
funnel tool only.

---

*Recommendation lives in [mergegate-validation.md](./mergegate-validation.md): **PIVOT** —
ship/keep as OSS funnel on the verified wedge; **DEFER** the scalable paid SaaS pending WTP.*
