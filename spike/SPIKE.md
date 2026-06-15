# mergegate spike — de-risking the hard part (M0)

**Question to de-risk:** the validated wedge depends on **author-conditioned gating** —
holding agent-authored PRs to a stricter bar than humans. Is that *mechanically real*, and
is it genuinely something the free GitHub baseline cannot do?

**Why it's the hard part (not the gate, the *author* axis):** running build/tests/checks is
easy and commoditized. The defensible sliver is keying the gate on *who opened the PR*.
Primary-source verified ([GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)):
GitHub rulesets target **branches / tags / paths only**; PR author is available **as a
bypass list, never as a matching condition**. So "stricter rules for agent authors" is the
one thing the native gate structurally cannot express.

**Experiment** (`spike/prove-wedge.sh`, self-contained, ~1s): take ONE identical changeset
where an *optional* `checks` gate is red, and run mergegate twice changing **only the
author**. The verdict must flip on identity alone.

**Result — SPIKE PASS:**

```
identical change · only the author differs:
  human author -> exit 0  (PASS)     # optional check waived
  agent author -> exit 1  (BLOCK)    # agents must clear EVERY gate
SPIKE PASS: the verdict flips on author identity alone.
```

The same mechanism is wired end-to-end in the MVP and proven at three layers:
1. **Unit** — `tests/verdict.test.ts` (same change → agent BLOCKED, human PASS).
2. **CLI** — `bin/mergegate check --agent|--human` on a real repo.
3. **Enforcement** — the GitHub Actions template keys the gate on
   `pull_request.user.login`; the pre-push hook blocks a real push to `main` (verified
   against a bare remote in the Story-3 demo).

**Conclusion:** the technical hard part is **de-risked** — author-conditioned, evidence-based
gating works and fills a verified native gap. The remaining risk is **market, not tech**
(WTP for an unbundled gate — see [../ceo/strategy/mergegate-validation.md](../ceo/strategy/mergegate-validation.md)),
which is exactly why the recommendation is PIVOT + DEFER-scalable, not a build-out.

Run it: `bash spike/prove-wedge.sh`
