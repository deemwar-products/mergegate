# mergegate — product line

Merge-gate-as-a-service: block any autonomous-agent PR from touching main until it provably passes spec+build+tests+checks. Per-repo governance subscription. PRODUCTIZE our validator.

## Milestones
1. **MVP: core working end-to-end (smallest shippable), great README/UX. — ✅ DONE (2026-06-15)**
   - Zero-dep bun+TS CLI: `check` / `gate` / `init` / `install-hook`.
   - Config-driven gates (built-in `spec` + shell `build`/`tests`/`checks`), author
     classification (agent vs human), policy-aware verdict, terminal + JSON report.
   - 32 tests green. Dogfoods itself (customer-zero): `mergegate.config.json` gates this repo.
   - Three story demos in house style (`ceo/demos/mergegate-{gate,governance,enforce}.mp4`).
2. Demo (auto-demo house style) + (OSS) Show-HN/X draft OR (SaaS) landing + 1 design-partner. — ✅ DONE (2026-06-17)
   - Demos: ✅ produced (staged for CEO verify). Launch copy: ✅ `ceo/launch/mergegate-launch.md`
     (repo + video + Show HN title/body/first-comment + X thread + order-of-ops) — **publish owner-gated**.
3. Stage for Muthu (publish/deploy/launch owner-gated); CTA -> deemwar.com/contact.
   - Branch `feat/github-action` ready; no public repo/remote yet — **publish owner-gated**.

## Hardening pass (2026-06-17, #59 — demo-verified gate)
- **Bug fixed:** committed `bin/mergegate.mjs` was missing its `#!/usr/bin/env node` shebang
  — the `bin` entry would fail to execute via `npx`/`bunx`. Root cause: `tests/action.test.ts`
  rebuilt the bundle *without* `--banner`, silently clobbering the shebang. Test build now
  matches `npm run build`; added a regression test asserting the shebang.
- **Flake fixed:** the shell-spawning entrypoint integration tests (git init + npm + node)
  now carry a 20s per-test timeout (were tripping the 5s default under parallel load).
- 43 tests green; dogfoods itself (human PASS, agent classified `[agent]`, markdown verdict).

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

## Adoption layer — OSS-funnel build (2026-06-15, the PIVOT path) — ✅ DONE
*(#2992 — M0 answer was PIVOT = GO on the OSS funnel; built the adoption lever, NOT the
deferred paid SaaS.)*
- `mergegate --format markdown` — a PR-comment-ready verdict (gate table + upsert marker).
- **Reusable composite GitHub Action** (`action.yml` + `action/entrypoint.sh`): adopt in
  one `uses: deemwar/mergegate@v0` line — runs the gate keyed on PR author, posts/upserts
  the verdict comment, exits with the gate code. Beats "a YAML afternoon" (the validation's
  named ergonomic edge over Mergify). 42 tests; self-dogfood workflow uses the local action.
- Demo: `ceo/demos/mergegate-action.mp4`. Branch `feat/github-action`, publish owner-gated.

## Next (still gated on WTP)
- **Stage the OSS publish** (public repo + Action listing) — **owner-gated**, awaiting CEO.
- **Only if WTP validated (2–3 paying design partners):** spec gate v2 (file→spec linkage),
  per-repo subscription + hosted gate-outcomes dashboard. **Do not build on a hypothesis.**
