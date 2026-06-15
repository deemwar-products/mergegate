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

## Next (post-MVP, when re-queued)
- `mergegate report --markdown` for a PR-comment body (the GitHub-check surface).
- Reusable GitHub Action (`deemwar/mergegate-action`) so adoption is one `uses:` line.
- Spec gate v2: link a changed file to its spec/issue, not just any commit reference.
- SaaS: per-repo subscription + a hosted dashboard of gate outcomes (the governance product).
