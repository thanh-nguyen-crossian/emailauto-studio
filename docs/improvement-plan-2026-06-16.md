# EmailAuto Studio — Improvement Plan

_Prepared 2026-06-16 · Scope: output diversity/quality + UI deep restructure + new features_
_Status: PLAN ONLY — no code changed yet. Code changes will be proposed as diffs for review before any edit._

---

## 0. TL;DR

The single most important finding: **the app's elaborate "variety machinery" is the cause of the sameness, not the cure.** A closed library of pre-written creative phrases is pasted verbatim into every prompt, a validator punishes any deviation from one "winning template," and a low-temperature repair pass actively rewrites outliers back toward that template. Meanwhile the canonical `email-campaign-playbook.html` is itself an *anti-sameness* document — it names "body fatigue / the old formula" as the #1 documented cause of falling CTR and **requires** rotating openers, angles, and hero-stories every send. The generator is fighting the playbook.

This plan has three workstreams:

- **A — Output diversity & quality** (addresses the stated #1 pain). Highest leverage.
- **B — UI deep restructure** (`page.tsx` is a 3,121-line monolith with ~60 `useState` hooks).
- **C — New features** (data-backed by the performance docs; none duplicate the existing roadmap).

Each item carries code-level references so the follow-up diffs are unambiguous. Hard constraints are preserved throughout: **playbook hard rules stay strict, secrets stay server-only, and deploys remain maintainer-only** (per `CLAUDE.md`).

---

## 1. Guardrails this plan must not regress

These come from `CLAUDE.md` and the playbook and bound every change below.

- **Playbook HARD rules stay strict.** Subject/preheader lengths, ≤2 emojis, `{{first_name}}` in subject XOR preheader, 4–6 even product count (SF=4), hero locked to slot 0, color hex ranges, spam encoding (`$`→`💲`, "off"→`o.f.f`), and **proof safety (never invent ratings/dates/stock/guarantees)** are non-negotiable. The diversity work loosens *creative/stylistic* constraints only.
- **Merge tags emitted literally** (`{{paramurl}}`, `{{unsubscribe}}`, `{{first_name}}`).
- **Brand/segment/product logic derived from `lib/config/*`** — never duplicated into prompts.
- **Prompt changes live in `lib/briefgen.ts`; email HTML in `lib/render/*`** — keep `GenBrief` TS type and prompt schema in sync.
- **`requireActiveUser`/`requireAdmin`** stays on paid/admin routes; `SUPABASE_SERVICE_ROLE_KEY` never `NEXT_PUBLIC`.
- **Every change must pass `npx tsc --noEmit` then `npm run build`.** Stop dev before build.
- **No deploys, no deploy hooks, no auto-deploy CI.** Work ends at a reviewable branch.

---

## 2. Workstream A — Output diversity & quality

### A0. Root-cause map (evidence)

| # | Root cause | Where (file · symbol) | Effect |
|---|---|---|---|
| 1 | Variety is **deterministic** — seeded from a hash of campaign fields, no random salt | `briefgen.ts` · `selectVarietyProfile`, `selectCreativeRoute`, `hashSeed` | Similar briefs → identical route/character/pain/arc; re-runs are identical |
| 2 | **Tiny phrase banks pasted verbatim** ("use this phrase") | `briefgen.ts` · `VARIETY_BANKS` (5 each), `CREATIVE_LEVER_BANKS` (4 each), `varietyMandate` | Same characters/pains/sensory phrases recur across campaigns |
| 3 | **One "winning shape" injected into every prompt** | `intelligence.ts` · `winShape`/`failShape`; `briefgen.ts` · `winToneMandate` (with sample phrases) | Every brand collapses to "warm note → one product → offer" |
| 4 | **Literal paragraph-order mandate** ("deviating is INVALID") | `briefgen.ts` · route `bodyArchitecture` enforcement | Identical skeleton whenever two campaigns share a route |
| 5 | **All 3 providers get the identical prescriptive prompt**; "model lens" is one cosmetic sentence | `anthropic.ts` · `createText` → `callClaude/Gemini/OpenAI`; `briefgen.ts` · `modelExecutionStyle` | Cross-model sameness — structure is locked, only wording varies |
| 6 | **Fixed, moderate temps; no `top_p`; repair at 0.30** | `anthropic.ts` · A=0.65, B=0.75, retry=0.80, **repair=0.30** | Flattened sampling; repair pass = mean-reversion |
| 7 | **A/B contrast is label-deep**; B generated blind in parallel; checks compare angle/framework strings + token overlap | `briefgen.ts` · `contrastInstruction`, `briefContrastIssues`, `similarity()` | "Different" = renamed angle + reworded same idea |
| 8 | **Validator mixes compliance with style** and scores them together; repair fires on stylistic flags too | `briefgen.ts` · `validateBrief`, `scoreBrief`, `repairFlagsFor`; `anthropic.ts` · `repairBriefIfNeeded` | Creative deviation is penalized into the score, then rewritten away |
| 9 | **No cross-send fatigue guard** for angle/framework/opener/visual pattern | only `recentProductSlugs` + within-generation A/B contrast exist | App can't honor the playbook's core "Fatigue" QA gate |

### A1. Quick wins (low risk, surgical — Phase 1)

1. **Add a random salt to the variety seed.** Mix a per-request nonce (`crypto.randomUUID()`) into the seed in `selectVarietyProfile`/`selectCreativeRoute`. Keep the existing `lastSend` avoidance. _Result: identical briefs stop producing identical creative._
2. **Raise sampling + add `top_p`.** A ≈ 0.85, B ≈ 1.0, pass `top_p ≈ 0.95` to all three providers. For OpenAI, drop `verbosity: "low"` / `reasoning: low` on the copy fields. Make these env-tunable (`AI_TEMP_A`, `AI_TEMP_B`, `AI_TOP_P`).
3. **Stop the repair pass from homogenizing.** Raise repair temp to ~0.6 **and** scope `repairFlagsFor` to compliance/proof-safety/deliverability flags only (spam words, invented proof, opt-out, length caps) — never paragraph count, P.S. word count, or banner-beat structure.
4. **Expand the banks 4–6×** (`VARIETY_BANKS`, `CREATIVE_LEVER_BANKS`) and select randomly rather than by deterministic index.
5. **Demote example phrases.** Remove the literal sample sentences from `winToneMandate`/`winShape`; describe the register abstractly so the model stops echoing them.
6. **Relax `bodyArchitecture`** from "INVALID to deviate" to "suggested arc," so the same route stops producing the same skeleton.

> All six are isolated to `briefgen.ts` + `anthropic.ts`, type-safe, and independently revertible. They directly attack root causes 1, 2, 3, 4, 5, 6.

### A2. Medium refactors (Phase 2)

7. **Split compliance validation from creative scoring.** Refactor `validateBrief` into:
   - `validateCompliance(brief)` → hard flags only (spam, proof safety, length caps, deliverability). These *can* trigger repair and *should* block.
   - `scoreCreative(brief)` → advisory style signals (paragraph count, banner beats, P.S. length). These inform the UI score but **never** trigger a rewrite.
   Keep `_flags`/`_score` shape for back-compat; add `_advisory` for the soft set.
8. **Make A/B contrast diff the idea, not the label.** Generate B *after* A, feed A's full `creative_direction` (hook contract, character, emotion, hero, payoff) into B's prompt, and rewrite `briefContrastIssues` to compare those fields — not just angle/framework strings. Keep the parallel path as a fast fallback behind a flag.
9. **Differentiate providers structurally.** Assign each provider a *different* route/framework (so the three models solve genuinely different briefs) and/or distinct sampling — replacing the cosmetic `modelExecutionStyle` sentence.

### A3. Deeper / optional (Phase 3)

10. **Cross-send fatigue guard** (this is also Feature C1). Persist each send's `{angle, framework, openerMechanic, emotionalArc, visualPattern, heroSlug}` and inject the last N as "avoid" rules into the prompt — the playbook's core anti-fatigue mechanism, currently absent.
11. **Embedding-based similarity** to replace token-overlap `similarity()`/`phraseOverlap`, so the model can't defeat dup checks by rewording the same idea. (Requires an embeddings call; gate behind env + cache.)
12. **Loosen angle/framework enums** — allow free-form angles with `PLAYBOOK_ANGLES`/`PLAYBOOK_FRAMEWORKS` as suggestions rather than an allowlist whose violation is a SERIOUS flag.

### A4. How we'll verify diversity actually improved

- Extend the existing eval harness (`lib/quality/eval.ts`, `app/api/eval`) with a **diversity metric**: generate N briefs for the *same* campaign and for *varied* campaigns, then measure pairwise distance (embedding or n-gram) across openers, angles, hero stories, and subjects. Target: meaningfully higher inter-brief distance after Phase 1, with **zero regressions** in compliance pass-rate.
- Spot-check that all playbook HARD rules still pass on a golden set.

---

## 3. Workstream B — UI deep restructure

### B0. Problems (evidence)

- **3,121-line monolith.** `app/page.tsx` — `Studio()` spans ~1,700 lines and defines ~25 sub-components below it in the same file.
- **State explosion.** ~60 `useState` hooks in one component; 18+ campaign scalars threaded into a `useMemo` `campaign` object and re-set in **three** near-identical ~150-line functions (`restoreDraft`, `startNewBrief`, `openVersion`). Adding a field means editing it in ~5 places — a standing bug magnet.
- **Runtime-injected stylesheet.** The whole component CSS lives in a `Styles()` `<style>` template literal at the bottom of the render; `globals.css` holds only `:root` tokens. Components can't share it → real drift (`History.tsx` redefines `.btn-ghost` with different values). Pervasive inline `style={{ color: ... }}` ternaries and hardcoded hexes (`#fef9c3`, `#c83434`, `#dfe7e9`) bypass tokens; some referenced vars (`--warn-soft`, `--warn-text`) don't exist in `:root`.
- **Three competing progress systems** on screen at once: a 3-step top nav, a 6-step accordion, and a `WorkflowSnapshot` chip row.
- **Uneven, overloaded steps.** Step 1 "Brand · Date · Theme" secretly contains ~12 inputs (incl. hidden "Strategy enrichment"); Step 5 crams an 18-control ops form + last-send context; Steps 4 & 6 are trivial.
- **Late validation.** No per-step validation; `StepCard` shows green ✓ on *visit*, not on *valid*. Users hit the wall at the disabled Generate button.
- **Buried preview.** Output screen stacks 8+ control panels around the single email preview the user came to see; Export is at the very bottom, far from it.
- **Duplicated primitives.** Two rich-text toolbars (`BriefView` markdown vs `HtmlFormatEditor` HTML), undo/redo reinvented twice, three `Row`/`EditField` variants, status-color logic reimplemented in 4+ places.

### B1. Target architecture

```
app/
  page.tsx                      // thin shell: providers + view router (<150 lines)
  studio/
    StudioProvider.tsx          // context + reducer (campaign, ui, generation state)
    useStudioReducer.ts         // single source of truth; loadCampaign()/resetCampaign()
    views/
      BuildView.tsx
      ReviewView.tsx
      OutputView.tsx
    steps/                      // one file per wizard step
      BrandStrategyStep.tsx     // (was step 1, renamed to match contents)
      PromoUrgencyStep.tsx
      ProductsStep.tsx
      SegmentsStep.tsx
      SendOpsStep.tsx           // split from old step 5
      LastSendStep.tsx          // split from old step 5
      WinningReferenceStep.tsx
  components/ui/                // shared design system
    Card.tsx  Field.tsx  StatusBadge.tsx  InfoCard.tsx
    RichTextToolbar.tsx         // parameterized: markdown | html
    useUndoRedo.ts
    Stepper.tsx                 // the ONE progress component
app/globals.css                // ALL component classes + tokens live here now
```

### B2. Phased plan

**Phase B1 — design-system extraction (no behavior change, fully reviewable):**
- Move the `Styles()` `<style>` block into `globals.css` as real classes; delete the duplicate `.btn-ghost` in `History.tsx`.
- Add missing tokens (`--warn-soft`, `--warn-text`, etc.); replace hardcoded hexes and inline color ternaries with semantic utilities (`.text-ok/.text-warn/.text-bad`, `.badge-*`, `.info-card`).
- Extract `StatusBadge`, `InfoCard`, `Field`, `Card` and swap call sites.

**Phase B2 — state consolidation:**
- Introduce `useStudioReducer` + `StudioProvider`. Collapse the triplicated `restoreDraft`/`startNewBrief`/`openVersion` into `loadCampaign(payload)` / `resetCampaign()`. This kills the "edit a field in 5 places" problem and is the single biggest maintainability win.

**Phase B3 — view & step split:**
- Extract `BuildView`/`ReviewView`/`OutputView` and one file per step. Rename steps to match contents; split old Step 5 into Send Ops + Last-Send.
- Replace the three progress systems with **one** `Stepper`. Add **per-step validation** (red/amber badges when required fields — products in step 3, segments in step 4 — are empty) instead of auto-green-on-visit. Gate Review the way Output is gated today.

**Phase B4 — Output redesign:**
- Two-pane "studio" layout: persistent left sidebar (option A/B + segment selector + score + **Export**) and a large right preview. Move the layout/HTML/image controls into a collapsible "Customize" drawer or tabs so the preview is primary. Collapse the raw system/user prompt editors behind one "Advanced" disclosure on Review.
- Unify the two rich-text toolbars into one `RichTextToolbar` and one `useUndoRedo`.

### B3. Risk management for the restructure
- Each phase is independently shippable and reviewable; B1 and B2 produce **zero visible behavior change** (pure refactor) and are easy to verify against the running app.
- After each phase: `npx tsc --noEmit` + `npm run build` + a manual click-through of build→review→output.
- Keep `Draft`/`VersionPayload` types and Supabase history payloads back-compatible so saved versions still load.

---

## 4. Workstream C — New features (data-backed, non-duplicative)

All grounded in `email-performance-analysis.md` / `performance-insights.md`; none duplicate `optimization-roadmap.md`.

- **C1. Cross-send fatigue tracker.** Persist recent sends' angle/framework/opener/visual-pattern/hero per brand+segment; surface "what not to repeat" in the brief and inject as prompt "avoid" rules. Directly implements the playbook's "Fatigue" QA gate (missing today; not on the roadmap). _Pairs with A3-10._
- **C2. Diversity score across recent sends.** A panel that scores how different the current draft is from the last N sends (not just A vs B). Turns the abstract "avoid sameness" goal into a visible number marketers can act on.
- **C3. Segment-quality / +Yahoo dilution warning.** Your single biggest data finding: tight high-value lists delivered **4× CBH/Del** vs the bloated list, and +Yahoo suppresses value 40–60% every time. Flag in the Segments step when a selection implies broad/+Yahoo audiences outside proven peak events.
- **C4. Trigger-email generator.** Birthday / back-in-stock / anniversary are the top performers in your data (birthday top-3 in 20 of 24 brand-months). A dedicated mode for these lifecycle triggers.
- **C5. A/B test harness (roadmap T2-06).** The 8-test priority queue is already specified in both the roadmap and the playbook's Rule 22 — wire it into the Studio so generated variants map to a structured test plan. _Listed because it's planned, not net-new._

---

## 5. Recommended sequencing

| Phase | Workstream | Why first | Verify |
|---|---|---|---|
| 1 | **A1 quick wins** (seed salt, temps/top_p, repair scoping, banks, demote examples, relax architecture) | Highest leverage on the stated #1 pain; surgical; low risk | Diversity eval + compliance golden set |
| 2 | **B1 design-system extraction** + **B2 state reducer** | Pure refactors, unblock everything else, kill the bug magnet | tsc + build + click-through |
| 3 | **A2** (split validation/scoring, real A/B contrast, provider differentiation) | Builds on A1; needs care | Eval + manual review |
| 4 | **B3** (view/step split, one Stepper, per-step validation) | Depends on B1/B2 | Click-through each view |
| 5 | **A3 + C1/C2** (cross-send fatigue + diversity score) | Implements the playbook's core anti-fatigue gate | New cross-send eval |
| 6 | **B4 Output redesign** + **C3/C4** | Polish + high-value features | Manual + accessibility pass |

---

## 6. Open questions for you

1. **Persistence for cross-send fatigue (C1):** OK to add a small Supabase table (`send_history`) under RLS, or should it derive from existing `saved_versions`?
2. **Embeddings (A3-11):** acceptable to add an embeddings API call (extra cost/latency, cached) for semantic similarity, or keep it n-gram for now?
3. **Provider sampling:** is dropping OpenAI's `verbosity:"low"`/`reasoning:"low"` on copy fields acceptable given the latency budget (`AI_PROVIDER_TIMEOUT_MS`, route `maxDuration=300`)?
4. **UI rename/flow:** any step names or the 6→7 step split (splitting Ops from Last-Send) you'd veto before I touch the wizard?

---

## 7. What happens next

Per your direction: this is the plan; **code will be delivered as proposed diffs for your review before any file is edited.** Suggested first diff batch = **Phase 1 (A1 quick wins)** — small, isolated to `lib/briefgen.ts` + `lib/anthropic.ts`, and the fastest path to visibly less-samey output. Tell me to proceed and I'll prepare those diffs.
