# mergegate — validation + recommendation (M0)

*Builder: #mergegate · 2026-06-15 · 3 independent adversarial research passes + primary-source
verification. This is the **answer to the CEO**: go / defer / pivot, with evidence.*

---

## TL;DR — **PIVOT** (ship the wedge as OSS funnel) + **DEFER** the scalable paid SaaS

- The broad product ("a merge gate") is **commoditized** — ~80% is free in GitHub branch
  protection. Building a *paid standalone gate* is building a feature GitHub gives away. → **DEFER**.
- There **is** one genuine, primary-source-verified native gap: GitHub rulesets **cannot
  condition on PR author** (author is bypass-only). The **author-conditioned, evidence-based
  agent-PR gate** is real whitespace. → **a viable wedge**.
- But **WTP for an *unbundled* gate is unproven**, the loudest pain is non-paying OSS that
  GitHub already placated for free, and funded incumbents will **bundle** this within 6–12mo.
- **Net:** keep mergegate as a sharp **OSS funnel/dogfood tool** on the verified wedge
  (cheap, on-brand, the MVP is already done). **Do not** invest in the scalable paid SaaS
  until **2–3 fleet-running teams commit to paying for it unbundled.**

---

## 1. Occupancy — is the space already taken?

**Verdict: PARTIALLY OCCUPIED, and the open seam is thin + closing.** Every load-bearing
piece already ships somewhere; the exact wedge isn't branded yet, but it's contested.

| What | Who | How close to our wedge | WTP signal |
|---|---|---|---|
| "Block PR until checks pass" | **GitHub branch protection / rulesets** (native, free) | Does ~80% of the literal promise. **Verified gap:** cannot target PR author (bypass-only) | Free (the baseline we must beat) |
| Per-author merge rules | **Mergify** (`author=` YAML conditions) | **Closest functional threat** — can already route `author=somebot[bot]` to a stricter queue | **$21/seat/mo** (anchors WTP) |
| Stricter gate for AI code | **SonarQube AI Code Assurance** | Auto-detects AI code → stricter blocking quality gate, but **project-level, not per-PR-author** | Free + paid Server/Cloud |
| "Merge gates for AI coding agents" | **OSS `logi-cmd/agent-guardrails`** | Same *words* as us, but **manual (no agent-author detection), doesn't truly block** | **7 stars**, v0.20.0 — concept validated, zero traction |
| PR-blocking custom checks | **CodeRabbit pre-merge checks** | Real gate, but advisory-origin + applies to all PRs (not agent-specific) | Paid SaaS |
| AI reviews the PR | CodeRabbit, Greptile, Qodo, Diamond, Baz, Korbit, … | **Fully commoditized** — most are advisory; Greptile *explicitly* reviews agents and humans identically | $1.2B+ funding in the category |

**The one unclaimed sentence:** *a per-PR, author-identity-triggered gate whose criterion is
spec+build+tests+checks passing — enforced harder on agents than humans.* Verified: GitHub
can't express it (author = bypass-only), AI reviewers don't gate on it (they gate on comments
or are advisory), Sonar gates on detected-AI-ness at project level, Mergify *can* approximate
it but only via expert YAML and isn't packaged for agents.

**Biggest single threat:** SonarQube AI Code Assurance (enterprise distribution + "stricter
gate for AI code" already shipped) and Mergify's `author=` (the mechanism already exists).
If either moves to per-PR-author packaging, the wedge largely collapses.

## 2. Willingness-to-pay / demand — is the pain real *and* paid?

**Verdict: pain is REAL and quantified; paid, unbundled demand is UNPROVEN.**

**Real (strong):**
- 17M+ agent-authored PRs by Mar 2026 (4× in 6 months); GitHub: ~1 in 10 AI PRs legit.
- LinearB (8.1M PRs): AI PRs merge **32.7% vs 84.4%** human, **154% larger**, **75% more
  logic errors**, **4.6× longer** review wait.
- Loud, current language: "drowning in AI slop PRs", "Stop Vibe Merging", "every PR should
  arrive with evidence it works, not a claim."

**Weak / contested (the kill-risk):**
- The loudest pain is **unpaid OSS maintainers** (curl killed its bug bounty over AI slop;
  Godot; Jazzband) — and **GitHub shipped a free PR kill-switch (Feb 2026)** for exactly them.
- The flagship "enterprise teams are next" piece is **sponsored content** (Signadot).
- **No observed buying behavior** for a *standalone* agent-PR gate. Adjacent money ($1.2B+)
  is in AI *review*, none earmarked for a gate. Incumbents (Greptile repriced around agent-PR
  volume; Sonar; CodeRabbit) will **absorb "gate agent code" as a feature**.
- The one direct OSS competitor proves the idea pulls **7 stars** — i.e., the idea alone
  doesn't pull users.

## 3. Recommendation to the CEO

**PIVOT + DEFER, with a concrete gate to flip to GO.**

1. **PIVOT the framing.** mergegate is **not** "another merge gate" (dead vs free GitHub).
   It is the **author-conditioned, evidence-based agent-PR gate** — the thing rulesets can't
   express. Lead every line with the verified gap ("GitHub can gate on branches, not on *who*
   opened the PR") and the criterion ("evidence = spec+build+tests pass, not advisory comments").
2. **Ship/keep it as an OSS funnel tool** (the MVP is already built + dogfooded). This is
   cheap, on-brand (oss-engine: small OSS → top-of-funnel → deemwar.com/contact), and survives
   incumbent bundling. Publish is **owner-gated** — staged for Muthu.
3. **DEFER the scalable paid SaaS.** Do **not** build the hosted dashboard / per-repo
   subscription yet.
4. **Flip-to-GO criteria (validate cheaply first):** put the OSS tool + a one-line Action in
   front of **2–3 teams running agent fleets**; if they (a) adopt it and (b) say they'd *pay
   for it unbundled* from their existing reviewer, **then** greenlight the scalable build.
   If they won't pay unbundled — stay OSS-funnel-only. **Do not build the scalable version on
   a hypothesis.**

This honors the M0 mandate ("tighten + validate BEFORE any long/scalable build") and is
deliberately *against* the grain of "I already built it" — the evidence says the paid SaaS is
a defer, and the honest move is to say so.

---

## Sources (primary + verified)

- GitHub rulesets cannot target PR author (bypass-only) — verified:
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- Direct OSS competitor (7 stars, manual, doesn't truly block) — verified:
  https://github.com/logi-cmd/agent-guardrails
- SonarQube AI Code Assurance: https://docs.sonarsource.com/sonarqube-cloud/ai-capabilities/ai-code-assurance
- Mergify per-author rules + pricing: https://docs.mergify.com/merge-queue/rules/ · https://mergify.com/pricing
- CodeRabbit pre-merge checks: https://docs.coderabbit.ai/pr-reviews/pre-merge-checks
- Greptile reviews agents == humans: https://greptile.com/docs/code-review/first-pr-review
- GitHub: "Agent pull requests are everywhere": https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/
- GitHub free PR kill-switch (Feb 2026): https://www.theregister.com/2026/02/03/github_kill_switch_pull_requests_ai/
- curl ends bug bounty over AI slop: https://thenewstack.io/drowning-in-ai-slop-reports-curl-ends-bug-bounties/
- LinearB AI-PR benchmarks: https://byteiota.com/ai-prs-wait-4-6x-longer-linearb-2026-benchmarks/
- "Stop Vibe Merging": https://shmulc.substack.com/p/stop-vibe-merging
