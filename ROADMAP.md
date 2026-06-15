# mergegate — product line

Merge-gate-as-a-service: block any autonomous-agent PR from touching main until it provably passes spec+build+tests+checks. Per-repo governance subscription. PRODUCTIZE our validator.

## Milestones
1. **MVP: core working end-to-end (smallest shippable), great README/UX. — ✅ DONE (2026-06-15)**
   - Zero-dep bun+TS CLI: `check` / `gate` / `init` / `install-hook`.
   - Config-driven gates (built-in `spec` + shell `build`/`tests`/`checks`), author
     classification (agent vs human), policy-aware verdict, terminal + JSON report.
   - 32 tests green. Dogfoods itself (customer-zero): `mergegate.config.json` gates this repo.
   - Three story demos in house style (`ceo/demos/mergegate-{gate,governance,enforce}.mp4`).
2. Demo (auto-demo house style) + (OSS) Show-HN/X draft OR (SaaS) landing + 1 design-partner.
   - Demos: ✅ produced (staged for CEO verify). Launch copy + Show-HN/landing: pending.
3. Stage for Muthu (publish/deploy/launch owner-gated); CTA -> deemwar.com/contact.
   - Branch `feat/mvp-merge-gate` ready; no public repo/remote yet — **publish owner-gated**.

## M0 — SPEC + VALIDATE + SPIKE (2026-06-15) → recommendation: **PIVOT + DEFER**
*(Muthu: tighten + validate BEFORE any long/scalable build. Did it. See
`ceo/strategy/mergegate-spec.md` + `ceo/strategy/mergegate-validation.md` + `spike/SPIKE.md`,
demo `ceo/demos/mergegate-validate.mp4`.)*
- **Spec:** the wedge = author-conditioned, evidence-based agent-PR gate (spec+build+tests+checks).
- **Validation (3 adversarial passes, primary-source verified):** "block PR until checks pass"
  is ~80% FREE in GitHub branch protection; rulesets **cannot** condition on PR author
  (verified — bypass-only) → that's the one real native gap. But Mergify `author=` + Sonar
  AI-Code-Assurance are circling, and WTP for an *unbundled* gate is **unproven** (loudest
  pain = unpaid OSS GitHub already placated free).
- **Spike:** `spike/prove-wedge.sh` — verdict flips on author identity alone (human PASS /
  agent BLOCK). Hard part **de-risked**; remaining risk is market, not tech.
- **Call to CEO:** **PIVOT** to ship the wedge as an OSS funnel tool (the MVP is done);
  **DEFER** the scalable paid SaaS until 2–3 fleet-running teams commit to paying *unbundled*.

## Next (gated on the M0 call)
- **If CEO approves PIVOT:** stage the OSS publish (owner-gated) + reusable GitHub Action
  (`deemwar/mergegate-action`, one `uses:` line); CTA → deemwar.com/contact.
- **Only if WTP validated (paying design partners):** spec gate v2 (file→spec linkage),
  per-repo subscription + hosted gate-outcomes dashboard. **Do not build on a hypothesis.**
