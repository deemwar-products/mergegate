# mergegate — launch packet (STAGED · owner-gated)

> **PUBLISH IS OWNER-GATED.** Nothing here goes public without Muthu's explicit tap.
> This is the staged repo + video + Show HN + X copy, ready for the CEO to verify and
> for Muthu to send. Order of operations is at the bottom.

Builder: #mergegate · staged 2026-06-17. Leads with the *verified* gap (GitHub gates on
branches, not on **who** opened the PR) per the M0 validation (`ceo/strategy/mergegate-validation.md`).

---

## 0. What ships (the public surface)

- **Repo:** push the existing tree to `github.com/deemwar/mergegate` (currently local-only,
  no remote). MIT, zero runtime deps, 42 tests green, dogfoods itself.
- **Tag:** `v0` so `uses: deemwar/mergegate@v0` resolves (the README's one-liner).
- **Video:** `ceo/demos/mergegate-action.mp4` (the one-line Action → agent PR BLOCKED →
  verdict comment). 9.1 MB, house style. CEO verifies render + voice + captions + brand first.
- **CTA everywhere:** `deemwar.com/contact` ("design-partner / I'd pay for this unbundled").

---

## 1. Show HN

**Title** (pick one — keep it the verified-gap sentence, not "another merge gate"):

- `Show HN: GitHub can gate a PR on the branch, not on who opened it. mergegate can.`
- `Show HN: mergegate – hold autonomous-agent PRs to a provably-done bar before main`

**Body:**

> Agents open a lot of PRs now. The good ones are green; the rest are plausible-looking
> diffs that don't build, skip the tests, or were never specified — and nobody's reviewing
> them at 3am.
>
> I went looking for the native fix and hit a wall: GitHub branch protection and rulesets
> let you require checks on a *branch*, but they **cannot condition on the PR author** —
> author is bypass-only, never a trigger (it's in the ruleset docs). So you can't express
> the one rule that matters when most of your PR volume is unattended: *"if an agent opened
> this PR, require **every** gate."*
>
> mergegate is one small, zero-dependency gate (Node 18+/Bun, no runtime deps) that does
> exactly that. It classifies *who* authored the change (agent vs human), runs your four
> pillars — spec · build · tests · checks — and holds agent PRs to a stricter bar than
> humans. Adoption is a single `uses: deemwar/mergegate@v0` line; it posts the verdict as
> a PR comment and fails the required check when an agent PR isn't provably done.
>
> It's the gate we run over our own agent fleet, opened up. The "spec" gate is built in —
> "no spec reference, no merge" — which is the cheapest way to stop unscoped agent drift.
>
> Honest scope: ~80% of "block a PR until checks pass" is already free in GitHub branch
> protection. The *only* thing it can't express is the author-conditioned part — that's the
> whole reason this exists. Not trying to sell you a merge queue.
>
> Repo + 90s demo: <REPO_URL>. Feedback very welcome — especially if you're drowning in
> agent PRs and have a war story.

**First comment (post immediately, as the author — pre-empts the obvious pushback):**

> Author here. Pre-empting the top question: *"isn't this just branch protection?"* No —
> branch protection counts checks on a branch and treats every author identically. The
> verified gap (ruleset docs linked in the README) is that you can't make a rule trigger on
> the PR author. mergegate keys the policy on author identity, so "agent ⇒ all gates
> required, human ⇒ lighter configurable bar" becomes enforceable. Mergify's `author=` can
> approximate it via expert YAML; this is packaged for the agent case in one line. If you'd
> want this hosted with a dashboard of gate outcomes, that's exactly the signal I'm looking
> for: deemwar.com/contact.

---

## 2. X / thread (Muthu's builder voice)

**1/**
> GitHub can gate a pull request on the branch.
> It can't gate on *who opened it.*
>
> When half your PRs are opened by agents at 3am, that's the rule you actually need.
> So I built the missing gate. 🧵

**2/**
> The gap is real and verifiable: branch protection + rulesets condition on the branch,
> the paths, the checks — never on the PR author (author is bypass-only, it's in the docs).
>
> You literally cannot say "if an agent opened this, require *every* gate."

**3/**
> mergegate says it.
>
> It classifies the author (agent vs human), runs spec · build · tests · checks, and holds
> agent PRs to a stricter bar than humans. An unattended agent doesn't get the benefit of
> the doubt.

**4/**
> Adoption is one line:
>
> `uses: deemwar/mergegate@v0`
>
> It posts the verdict as a PR comment and fails the required check when an agent PR isn't
> provably done. Zero runtime deps. Node 18+/Bun.

**5/**
> "spec" is a first-class gate — no spec reference, no merge. Cheapest way to stop unscoped
> agent drift before it reaches main.
>
> It's the gate we run over our own agent fleet, opened up. MIT.

**6/**
> [demo video — ceo/demos/mergegate-action.mp4]
>
> Repo: <REPO_URL>
> Drowning in agent PRs? Tell me what you'd need: deemwar.com/contact

---

## 3. Order of operations (for Muthu, when he taps go)

1. `gh repo create deemwar/mergegate --public --source . --remote origin` (or push the
   existing tree); confirm README renders + the `deemwar/mergegate@v0` one-liner is right.
2. Tag + push `v0` so the Action reference resolves.
3. CEO independently verifies `mergegate-action.mp4` (render, voice+captions, real flow,
   deemwar brand) — only a clean cut counts.
4. Post Show HN (Tue–Thu, ~14:00–16:00 UTC tends to land best), then the author first
   comment immediately.
5. Fire the X thread, attach the demo to tweet 6.
6. Watch for "would you pay for this unbundled?" replies → that's the flip-to-GO signal in
   the validation doc (2–3 fleet teams ⇒ greenlight the deferred paid SaaS). Until then it
   stays OSS-funnel-only.

**Nothing above happens without Muthu.** Repo stays local, no remote, until he says go.
