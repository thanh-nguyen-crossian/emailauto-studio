# EmailAuto Studio — Claude Code Build Plan

_Execution-ready work order. Companion to `docs/improvement-plan-2026-06-16.md` (the strategy/rationale)._
_Each task below is self-contained: paste the **Prompt to Claude Code** block as-is. Tasks are ordered; do them in sequence unless marked parallel-safe._

---

## How to use this document

1. Each task has: **Goal**, **Files**, **Do**, **Don't**, **Acceptance criteria**, **Verify**, and a copy-pasteable **Prompt to Claude Code**.
2. Run one task per Claude Code session/branch where possible. Keep diffs small and reviewable.
3. **Line numbers are not given** — they drift. Reference symbols (function/const names). Have the agent grep for the symbol first.
4. After **every** task, the agent must run the Verify block and report results. Do not mark a task done if `tsc` or `build` fails.

---

## GLOBAL GUARDRAILS — paste at the top of every Claude Code session

```
GUARDRAILS (do not violate):
- This is EmailAuto Studio (Next.js 15, App Router, TS, React 19). Read CLAUDE.md before starting.
- DO NOT DEPLOY. Do not run `vercel`, do not add deploy steps, GitHub Actions, or vercel.json hooks. Work ends at a committed branch.
- Playbook HARD rules stay strict: subject/preheader lengths, <=2 emojis, {{first_name}} in subject XOR preheader, 4-6 even product count (SF=4), hero locked to slot 0, color hex ranges, spam encoding ($ -> 💲, "off" -> o.f.f), and PROOF SAFETY (never invent ratings/dates/stock/guarantees/reviews-as-proof). Only stylistic/creative constraints may be loosened.
- Emit merge tags literally: {{paramurl}}, {{unsubscribe}}, {{first_name}}.
- Derive all brand/segment/product logic from lib/config/*; never hardcode it into prompts.
- Prompt changes go ONLY in lib/briefgen.ts; email HTML only in lib/render/*. Keep the GenBrief TS type and the prompt JSON schema in sync.
- Keep requireActiveUser/requireAdmin on paid/admin routes. SUPABASE_SERVICE_ROLE_KEY stays server-only, never NEXT_PUBLIC.
- TypeScript: no `any` unless unavoidable. Match surrounding style.
- BEFORE COMMIT: run `npx tsc --noEmit` then `npm run build` (stop `npm run dev` first). Both must pass.
- Make focused commits with clear messages. Do not refactor unrelated code.
```

---

## Branch & commit conventions

- Branch per phase: `feat/diversity-phase1`, `refactor/ui-design-system`, etc.
- Conventional-commit style: `feat(briefgen): add random salt to variety seed`.
- One logical change per commit; reference the task ID (e.g. `A1-1`).

---

# PHASE 1 — Output diversity quick wins (`lib/briefgen.ts`, `lib/anthropic.ts`)

> Highest leverage on "every email sounds the same." All tasks are surgical and revertible. Branch: `feat/diversity-phase1`.

---

### Task A1-1 — Add a random salt to the variety seed

**Goal:** Identical campaign briefs should stop producing identical creative.

**Files:** `lib/briefgen.ts` (`selectVarietyProfile`, `selectCreativeRoute`, `hashSeed`), `lib/anthropic.ts` (`generateOptions` and its `generateOptionsSingle`).

**Do:**
- Add an optional `nonce?: string` parameter threaded from `generateOptions` into the variety-selection functions. Default to `crypto.randomUUID()` generated once per `generateOptions` call (one per option A/B so A and B differ, but stable within a single brief render).
- Mix `nonce` into the seed string used by `hashSeed`.
- Preserve the existing `lastSend` opener/arc avoidance behavior.

**Don't:** Break determinism of anything the tests/eval rely on without updating them; remove the lastSend avoidance.

**Acceptance criteria:**
- Calling generation twice on the same campaign yields different variety profiles (route/character/pain/arc) across runs.
- A and B still get *different* profiles within one run.
- `npx tsc --noEmit` and `npm run build` pass.

**Verify:** `npx tsc --noEmit && npm run build`; add/adjust a quick unit assertion if a test harness exists under `tests/`.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A1-1: In lib/briefgen.ts, the functions selectVarietyProfile and selectCreativeRoute seed all creative selection from hashSeed() over campaign fields only, so identical briefs produce identical output. Add an optional `nonce?: string` argument to these selection functions and mix it into the seed. Thread a per-option nonce (crypto.randomUUID()) from generateOptions/generateOptionsSingle in lib/anthropic.ts so Option A and Option B each get a fresh nonce, but it's stable within a single render. Keep the existing lastSend opener/emotionalArc avoidance. Then run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A1-2 — Raise sampling and add `top_p` (env-tunable)

**Goal:** Loosen flattened sampling that makes all output converge.

**Files:** `lib/anthropic.ts` (`callClaude`, `callGemini`, `callOpenAI`, `generateOptionsSingle`, `createSegmentPatch`).

**Do:**
- Introduce env-tunable temps with current values as fallbacks: `AI_TEMP_A` (default 0.85), `AI_TEMP_B` (default 1.0), `AI_TEMP_B_RETRY` (default 0.9), `AI_TOP_P` (default 0.95). Document them in `.env.example` and the CLAUDE.md env table.
- Pass `top_p`/`topP` to all three providers where supported.
- For OpenAI, stop forcing `verbosity: "low"` and `reasoning: { effort: "low" }` on the copy-generation calls (keep for any cheap/utility calls if present).

**Don't:** Touch the repair-pass temperature here (that's A1-3). Don't exceed provider max temp.

**Acceptance criteria:** Temps/`top_p` read from env with the new defaults; all three providers receive `top_p`; OpenAI copy calls no longer force low verbosity/reasoning. `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`. Grep to confirm no remaining hardcoded `0.65`/`0.75` in the copy path.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A1-2: In lib/anthropic.ts, generation temperatures are hardcoded (A=0.65, B=0.75, retry=0.80) and no top_p is set; OpenAI calls force verbosity:"low" and reasoning:{effort:"low"}. Add env-tunable settings AI_TEMP_A (default 0.85), AI_TEMP_B (default 1.0), AI_TEMP_B_RETRY (default 0.9), AI_TOP_P (default 0.95). Apply them in generateOptionsSingle and createSegmentPatch, and pass top_p/topP through callClaude/callGemini/callOpenAI. Remove verbosity:"low"/reasoning:"low" from the OpenAI copy-generation call. Document the new vars in .env.example and the env table in CLAUDE.md. Do NOT change the repair-pass temperature. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A1-3 — Scope the repair pass so it stops homogenizing

**Goal:** The repair pass (currently temp 0.30, fires on stylistic flags) rewrites creative outliers back to the template. Restrict it to compliance/safety only and raise its temperature.

**Files:** `lib/anthropic.ts` (`repairBriefIfNeeded`, `repairFlagsFor`, `REPAIR_SYSTEM`), `lib/briefgen.ts` (flag categories: `SERIOUS_FLAG`, whatever classifies flags).

**Do:**
- Define a `COMPLIANCE_FLAG` set = spam words, opt-out issues, invented proof, subject/preheader length caps, deliverability. Make `repairFlagsFor` return only flags in this set (NOT paragraph count, P.S. word count, banner-beat structure, non-enum angle/framework).
- Raise repair temperature to env-tunable `AI_REPAIR_TEMP` (default 0.6).
- Keep the low-score threshold (`AI_QUALITY_REPAIR_THRESHOLD`) but only let it trigger when at least one COMPLIANCE_FLAG is present.

**Don't:** Disable proof-safety or spam repair. Don't remove the repair feature entirely.

**Acceptance criteria:** A brief that only violates stylistic rules does NOT trigger a repair call; a brief with a spam word or invented-proof flag still does. Repair temp comes from env (default 0.6). `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`. If `tests/` has eval fixtures, run them.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A1-3: In lib/anthropic.ts, repairBriefIfNeeded fires at temperature 0.30 and repairFlagsFor includes stylistic flags, so the repair pass rewrites creative deviation back toward one template. (1) Restrict repairFlagsFor to a COMPLIANCE-only set: spam words, opt-out, invented proof, subject/preheader length caps, deliverability — exclude paragraph count, P.S. word count, banner-beat structure, and non-enum angle/framework. (2) Add AI_REPAIR_TEMP (default 0.6) and use it instead of 0.30. (3) Only let the low-score threshold trigger repair when at least one compliance flag is present. Document AI_REPAIR_TEMP in .env.example and CLAUDE.md. Keep proof-safety and spam repair fully intact. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A1-4 — Expand the phrase banks and randomize selection

**Goal:** Tiny banks (5 characters / 5 pains / 5 sensory phrases; 4 levers each) recur verbatim. Enlarge and randomize.

**Files:** `lib/briefgen.ts` (`VARIETY_BANKS`, `CREATIVE_LEVER_BANKS`, and their selectors).

**Do:**
- Expand each bank to ~20+ distinct entries per brand (characters, pain points, sensory phrases, creative lenses, proof roles, subject styles, visual directions). Keep them on-brand and playbook-safe; do NOT invent proof/numbers.
- Change selection from deterministic-index to nonce-salted random (reuse the A1-1 nonce), still avoiding the `lastSend` value.

**Don't:** Introduce fabricated stats, fake reviews-as-proof, or off-brand voice. Keep entries consistent with `lib/config/brands.ts` voice.

**Acceptance criteria:** Each bank has ≥20 entries/brand; selection varies across runs; no playbook proof-safety violations introduced. `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`. Manual read of 10 sample generations for brand-voice fit.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A1-4: In lib/briefgen.ts, VARIETY_BANKS (5 characters/pains/sensory phrases per brand) and CREATIVE_LEVER_BANKS (4 each) are tiny and selected deterministically, so the same phrases recur. Expand each bank to >=20 distinct, on-brand, playbook-safe entries per brand (use lib/config/brands.ts voice as the guide). Change selection to nonce-salted random (reuse the nonce added in A1-1) while still avoiding the lastSend value. Do not fabricate stats or reviews-as-proof. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A1-5 — Demote verbatim example phrases; relax the literal paragraph-order mandate

**Goal:** Remove few-shot phrases the model echoes, and stop forcing the same skeleton.

**Files:** `lib/briefgen.ts` (`winToneMandate`, route `bodyArchitecture` enforcement text), `lib/config/intelligence.ts` (`winShape`/`failShape`).

**Do:**
- Remove the literal sample sentences from `winToneMandate` and `winShape`; describe the desired register abstractly instead.
- Change the `bodyArchitecture` instruction from "LITERAL paragraph order ... deviating is INVALID" to "a suggested arc you may reorder for variety, provided the hook stays consistent."

**Don't:** Remove the single-promise/one-hook rule (playbook-required). Don't weaken proof safety.

**Acceptance criteria:** No verbatim sample sentences remain in the prompt; bodyArchitecture is advisory; one-hook rule intact. `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`; grep the prompt builders for the removed sample phrases to confirm they're gone.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A1-5: In lib/briefgen.ts winToneMandate and lib/config/intelligence.ts winShape/failShape, literal example sentences are injected and the model echoes them; also the route bodyArchitecture is enforced as a LITERAL paragraph order ("deviating is INVALID"). (1) Replace literal sample sentences with abstract register descriptions. (2) Make bodyArchitecture advisory ("suggested arc, may reorder for variety as long as the single hook stays consistent"). Keep the one-promise/one-hook rule and proof safety fully intact. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A1-6 — Diversity eval metric (verification harness)

**Goal:** Prove diversity improved and compliance didn't regress.

**Files:** `lib/quality/eval.ts`, `app/api/eval/route.ts` (extend, don't rewrite).

**Do:**
- Add a `diversity` metric: given N generations (same campaign, and a set of varied campaigns), compute pairwise distance across openers, angles, hero stories, and subject lines (n-gram/Jaccard is fine for now; embeddings are Phase 3).
- Report: mean inter-brief distance (varied campaigns) and intra-campaign distance (same campaign run N times), plus compliance pass-rate (must stay 100% on hard rules).

**Acceptance criteria:** Eval outputs a diversity score and a compliance pass-rate; runnable locally. `tsc` + `build` pass.

**Verify:** Run the eval before vs after Phase 1; expect higher diversity, unchanged compliance.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A1-6: Extend lib/quality/eval.ts and app/api/eval/route.ts with a `diversity` metric. Given N generated briefs (same campaign repeated, and several varied campaigns), compute pairwise n-gram/Jaccard distance across openers, angles, hero stories, and subject lines, and report mean inter-campaign distance, intra-campaign distance, and the hard-rule compliance pass-rate (must remain 100%). Do not rewrite the existing eval; extend it. Run `npx tsc --noEmit && npm run build` and report, then run the eval and paste the numbers.
```

---

# PHASE 2 — UI design system + state consolidation (pure refactors)

> Zero intended behavior change. Branch: `refactor/ui-foundation`. Verify with click-throughs.

---

### Task B1-1 — Lift the runtime stylesheet into `globals.css`

**Goal:** Kill the runtime-injected `<style>` and the resulting drift (e.g. `History.tsx` redefining `.btn-ghost`).

**Files:** `app/page.tsx` (`Styles()`), `app/globals.css`, `app/components/History.tsx`.

**Do:**
- Move all class definitions from the `Styles()` template literal into `globals.css`. Remove `Styles()` and its render-time mount.
- Delete the duplicate `.btn-ghost` (and any other duplicated classes) from `History.tsx`.
- Add missing tokens referenced but not defined in `:root` (`--warn-soft`, `--warn-text`, etc.).

**Acceptance criteria:** No `<style>` string injected from a component; all referenced classes live in `globals.css`; app renders identically. `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`; manual visual diff of build/review/output screens.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task B1-1: app/page.tsx defines its entire component CSS in a Styles() <style> template literal injected at render, so components can't share it (app/components/History.tsx even redefines .btn-ghost differently). Move ALL classes from Styles() into app/globals.css, delete Styles() and its mount, remove the duplicate .btn-ghost from History.tsx, and add the missing :root tokens (--warn-soft, --warn-text, any others referenced but undefined). The app must render identically. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task B1-2 — Semantic utilities; remove inline color logic and hardcoded hexes

**Goal:** Replace inline `style={{color:...}}` ternaries and hardcoded hexes with token-based utility classes.

**Files:** `app/globals.css`, `app/page.tsx`, `app/components/PreflightPanel.tsx`, `BriefView.tsx`, `ImageEditor.tsx`, `HtmlFormatEditor.tsx`.

**Do:**
- Add `.text-ok/.text-warn/.text-bad`, `.badge-ok/.badge-warn/.badge-bad`, `.info-card` utilities in `globals.css`.
- Replace inline color ternaries (`scoreColor`, `subjectLenColor`, `preheaderLenColor`, PreflightPanel/FormatCoverage inline styles) and hardcoded hexes (`#fef9c3`, `#c83434`, `#dfe7e9`, stray `rgba(...)`) with the utilities/tokens.

**Acceptance criteria:** No hardcoded hex colors in component files for status/state; no inline `style={{color:...}}` for status. `tsc` + `build` pass; visuals unchanged.

**Verify:** `npx tsc --noEmit && npm run build`; grep for `#` hex literals in `app/components/*` and `app/page.tsx`.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task B1-2: Status colors are computed inline (scoreColor, subjectLenColor, preheaderLenColor, and many style={{color:...}} ternaries in PreflightPanel.tsx/FormatCoverage) and several hardcoded hexes bypass tokens (#fef9c3, #c83434, #dfe7e9, stray rgba). Add semantic utilities (.text-ok/.text-warn/.text-bad, .badge-*, .info-card) to globals.css and replace the inline color logic and hardcoded hexes across app/page.tsx and app/components/*. Visuals must stay the same. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task B1-3 — Extract shared UI primitives

**Goal:** One implementation each of Card, Field, StatusBadge, InfoCard, RichTextToolbar, useUndoRedo.

**Files:** new `app/components/ui/*`; refactor `BriefView.tsx`, `ImageEditor.tsx`, `HtmlFormatEditor.tsx`, `page.tsx` call sites.

**Do:**
- Create `Card`, `Field`, `StatusBadge`, `InfoCard`.
- Create one `RichTextToolbar` parameterized for `markdown | html` (replacing the two separate toolbars) and one `useUndoRedo` hook (replacing the two duplicate implementations).
- Swap call sites; delete the duplicates (`Row`/`EditField` variants, duplicate undo/redo).

**Acceptance criteria:** Both editors use the shared toolbar + undo/redo; no duplicated primitives remain; behavior unchanged. `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`; manually test markdown editing (BriefView) and HTML editing (HtmlFormatEditor) incl. undo/redo.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task B1-3: There are duplicated UI primitives: two rich-text toolbars (BriefView markdown vs HtmlFormatEditor HTML), undo/redo reinvented twice, and 3 Row/EditField variants. Create app/components/ui/ with Card, Field, StatusBadge, InfoCard, a single RichTextToolbar parameterized as markdown|html, and a useUndoRedo hook. Refactor BriefView.tsx, ImageEditor.tsx, HtmlFormatEditor.tsx, and page.tsx to use them; delete the duplicates. Behavior must be unchanged (test markdown + HTML editing and undo/redo). Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task B2-1 — Consolidate state into a reducer + provider

**Goal:** Replace ~60 `useState` hooks and the three near-identical load/reset functions with one source of truth.

**Files:** new `app/studio/StudioProvider.tsx`, `app/studio/useStudioReducer.ts`; refactor `app/page.tsx`.

**Do:**
- Model state as `{ campaign, ui, generation }`. Move the ~18 campaign scalars into `campaign`.
- Replace `restoreDraft`, `startNewBrief`, `openVersion` with `loadCampaign(payload)` and `resetCampaign()` actions.
- Keep `Draft`/`VersionPayload` shapes and Supabase history payloads back-compatible so saved versions still load.

**Acceptance criteria:** No duplicated field-setting logic; saved versions and drafts load correctly; adding a campaign field requires editing one place. `tsc` + `build` pass.

**Verify:** `npx tsc --noEmit && npm run build`; load an existing saved version and a draft; create new brief; confirm all fields populate.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task B2-1: app/page.tsx has ~60 useState hooks and three near-identical ~150-line functions (restoreDraft, startNewBrief, openVersion) that each re-set every campaign field. Introduce app/studio/StudioProvider.tsx + useStudioReducer.ts with state grouped as { campaign, ui, generation }, and replace the three functions with loadCampaign(payload) and resetCampaign() actions. Keep Draft/VersionPayload types and Supabase history payloads backward-compatible so saved versions and drafts still load. Verify by loading an existing saved version + a draft and creating a new brief. Run `npx tsc --noEmit && npm run build` and report.
```

---

# PHASE 3 — Idea-level diversity + view/step split

> Branch: `feat/diversity-phase3` and `refactor/ui-views`. Depends on Phases 1-2.

---

### Task A2-1 — Split compliance validation from creative scoring

**Goal:** Stop penalizing/repairing creative deviation as if it were a compliance failure.

**Files:** `lib/briefgen.ts` (`validateBrief`, `scoreBrief`), `lib/anthropic.ts` (consumers).

**Do:**
- Split into `validateCompliance(brief)` (hard flags — block/repair eligible) and `scoreCreative(brief)` (advisory style signals — inform UI only, never trigger repair).
- Preserve `_flags`/`_score` for back-compat; add `_advisory` for soft signals. Update consumers and the UI score display.

**Acceptance criteria:** Stylistic issues affect only the advisory display, never repair/block; compliance issues still block/repair. `tsc` + `build` pass.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A2-1: lib/briefgen.ts validateBrief mixes hard compliance rules with stylistic preferences (paragraph count, P.S. length, banner beats) and scoreBrief penalizes them together, so creative deviation is punished and repaired away. Split into validateCompliance(brief) (hard, block/repair-eligible) and scoreCreative(brief) (advisory only). Keep _flags/_score for back-compat and add _advisory for soft signals; update lib/anthropic.ts and the UI score display. Stylistic issues must never trigger repair/block. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A2-2 — Make A/B contrast diff the idea, not the label

**Goal:** B should be a genuinely different concept, not a renamed angle.

**Files:** `lib/briefgen.ts` (`contrastInstruction`, `briefContrastIssues`), `lib/anthropic.ts` (`generateOptionsSingle`).

**Do:**
- Generate B *after* A and feed A's full `creative_direction` (hook contract, character, emotion, hero emphasis, payoff) into B's prompt.
- Rewrite `briefContrastIssues` to compare those semantic fields, not just angle/framework strings + token overlap.
- Keep a flagged fast parallel path as fallback for latency-sensitive runs.

**Acceptance criteria:** B differs from A on hook contract/character/payoff, not only labels; latency stays within `AI_PROVIDER_TIMEOUT_MS`/`maxDuration=300`. `tsc` + `build` pass.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A2-2: A/B contrast is label-deep — Option B is generated blind in parallel and briefContrastIssues only compares angle/framework strings + token overlap. Change generateOptionsSingle to generate B AFTER A, feeding A's full creative_direction (hook contract, character, emotion, hero emphasis, payoff) into B's prompt, and rewrite briefContrastIssues to diff those semantic fields. Keep a feature-flagged parallel fast path for latency. Stay within AI_PROVIDER_TIMEOUT_MS and route maxDuration=300. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task A2-3 — Differentiate providers structurally

**Goal:** Replace the cosmetic "model lens" so Claude/Gemini/GPT don't solve the identical brief.

**Files:** `lib/briefgen.ts` (`modelExecutionStyle`, `appendModelExecutionStyle`), `lib/anthropic.ts`.

**Do:** Assign each provider a different route/framework selection and/or distinct sampling so they produce genuinely different briefs; remove or downgrade the one-sentence lens.

**Acceptance criteria:** Same campaign across providers yields structurally different briefs. `tsc` + `build` pass.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A2-3: The provider "model lens" (modelExecutionStyle) is one cosmetic sentence, so all 3 providers solve the identical prescriptive brief and look alike. Differentiate them structurally: assign each provider a different route/framework (and/or distinct sampling) so they produce genuinely different briefs. Remove/downgrade the cosmetic lens sentence. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task B3-1 — Split views and steps; one unified Stepper; per-step validation

**Goal:** Break the monolith and fix the confusing progress/validation UX.

**Files:** new `app/studio/views/{BuildView,ReviewView,OutputView}.tsx`, `app/studio/steps/*`, `app/components/ui/Stepper.tsx`; refactor `app/page.tsx` to a thin shell.

**Do:**
- Extract the three views and one file per wizard step. Rename steps to match contents; **split old Step 5 into `SendOpsStep` + `LastSendStep`** (6 → 7 steps). Move the hidden "Strategy enrichment" out of Step 1 into its own clearly-labeled block.
- Replace the three competing progress systems (3-step nav, 6-step accordion, chip row) with one `Stepper`.
- Add per-step validation: red/amber step badge when required fields are empty (products in Products step, segments in Segments step) instead of auto-green-on-visit. Gate the Review step the way Output is gated today.

**Acceptance criteria:** `page.tsx` < ~200 lines; each view/step in its own file; one progress component; steps show real validity. `tsc` + `build` pass; full click-through works.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task B3-1: app/page.tsx is a 3,121-line monolith with three competing progress systems (3-step top nav, 6-step accordion, chip row) and validation that only fires at the end (StepCard goes green on visit, not on valid). Extract app/studio/views/{BuildView,ReviewView,OutputView}.tsx and one file per wizard step under app/studio/steps/. Rename steps to match their contents, split the old Step 5 into SendOpsStep + LastSendStep, and pull the hidden "Strategy enrichment" into its own labeled block. Replace the three progress systems with one Stepper component. Add per-step validation (red/amber when required fields like products/segments are empty) and gate Review like Output is gated today. Reduce page.tsx to a thin shell. Run `npx tsc --noEmit && npm run build`, then click through build->review->output and report.
```

---

# PHASE 4 — Cross-send fatigue, diversity score, Output redesign, features

> Branch: `feat/fatigue-and-output`. Depends on earlier phases.

---

### Task A3-1 / C1 — Cross-send fatigue guard (the playbook's missing QA gate)

**Goal:** Inject last-N sends' angle/framework/opener/visual-pattern/hero as "avoid" rules — the playbook's core anti-fatigue mechanism, absent today.

**Files:** `lib/briefgen.ts` (prompt), `lib/config/types.ts` (`Campaign`), persistence (see open question), `app/studio/*` (surface in UI).

**Do:**
- Persist each completed send's `{brand, segment, angle, framework, openerMechanic, emotionalArc, visualPattern, heroSlug, date}`. **Decision needed:** new Supabase table `send_history` (RLS) vs. derive from `saved_versions`. Default recommendation: small `send_history` table under RLS.
- Inject the last N (e.g. 3) as "do not repeat" rules into the prompt; surface them read-only in the Last-Send step.

**Acceptance criteria:** Generation avoids the recent angle/framework/opener/visual/hero; visible in UI; RLS-scoped. `tsc` + `build` pass; new migration added under `supabase/migrations/`.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task A3-1/C1: The playbook's core anti-fatigue QA gate ("does not repeat last opener, angle, product lead, or visual pattern") is not implemented — only recentProductSlugs exists. Add cross-send fatigue avoidance: persist each completed send's {brand, segment, angle, framework, openerMechanic, emotionalArc, visualPattern, heroSlug, date} in a new RLS-scoped Supabase table `send_history` (add a migration under supabase/migrations/), inject the last 3 as "do not repeat" rules into the briefgen prompt, and surface them read-only in the Last-Send step. Keep it RLS-scoped per user. Run `npx tsc --noEmit && npm run build` and report. (If you think deriving from saved_versions is cleaner, propose it before building.)
```

---

### Task C2 — Diversity score panel (across recent sends)

**Goal:** Show marketers how different the current draft is from the last N sends.

**Files:** reuse the A1-6 diversity metric; new panel component in `app/studio/views/OutputView.tsx` / `app/components/ui`.

**Acceptance criteria:** Output shows a 0–100 "freshness vs recent sends" score with the top overlapping element called out. `tsc` + `build` pass.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task C2: Add a "freshness vs recent sends" diversity score panel to OutputView, reusing the diversity metric from eval (A1-6) and the send_history data (A3-1). Show a 0-100 score and name the most-overlapping element (angle/opener/hero) so the marketer can act. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task C3 — Segment-quality / +Yahoo dilution warning

**Goal:** Surface the biggest data finding (tight lists = 4x value; +Yahoo suppresses 40-60%).

**Files:** `app/studio/steps/SegmentsStep.tsx`, `lib/config/intelligence.ts` (thresholds).

**Acceptance criteria:** Segments step warns when a selection implies broad/+Yahoo audiences outside proven peak events. `tsc` + `build` pass.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task C3: Per the performance docs, tight high-value lists delivered ~4x CBH/Del vs the bloated list and +Yahoo gating suppresses value 40-60% except at proven peak sale events. In the Segments step, add a non-blocking warning when the selected audience implies broad/+Yahoo reach outside proven peak events (Black Friday, Valentine's). Pull thresholds from lib/config/intelligence.ts. Run `npx tsc --noEmit && npm run build` and report.
```

---

### Task B4-1 — Output two-pane redesign

**Goal:** Stop burying the email preview under 8 stacked panels.

**Files:** `app/studio/views/OutputView.tsx`, related components.

**Do:**
- Two-pane layout: persistent left sidebar (option A/B selector, segment selector, score, **Export actions**) + large right preview. Move layout/HTML/image controls into a collapsible "Customize" drawer/tabs. Collapse raw system/user prompt editors behind one "Advanced" disclosure on Review.

**Acceptance criteria:** Preview is the dominant element; export is reachable without scrolling past all controls; prompt editors are opt-in. `tsc` + `build` pass; click-through verified.

**Prompt to Claude Code:**
```
[paste GLOBAL GUARDRAILS]
Task B4-1: The Output screen buries the email preview under 8+ stacked control panels and puts Export at the very bottom. Redesign OutputView as two panes: a persistent left sidebar (A/B option selector, segment selector, score, Export actions) and a large right-hand preview, with layout/HTML/image controls behind a collapsible "Customize" drawer or tabs. On Review, collapse the raw system/user prompt editors behind one "Advanced" disclosure. Preview must be the dominant element. Run `npx tsc --noEmit && npm run build`, click through, and report.
```

---

## Appendix — full task index

| ID | Phase | Title | Files (primary) |
|---|---|---|---|
| A1-1 | 1 | Random salt to variety seed | briefgen, anthropic |
| A1-2 | 1 | Raise temps + top_p (env) | anthropic, .env.example, CLAUDE.md |
| A1-3 | 1 | Scope repair to compliance only | anthropic, briefgen |
| A1-4 | 1 | Expand + randomize phrase banks | briefgen |
| A1-5 | 1 | Demote example phrases; relax arch | briefgen, intelligence |
| A1-6 | 1 | Diversity eval metric | quality/eval, api/eval |
| B1-1 | 2 | Lift stylesheet to globals.css | page, globals.css, History |
| B1-2 | 2 | Semantic color utilities | globals.css, page, components |
| B1-3 | 2 | Extract shared UI primitives | components/ui/* |
| B2-1 | 2 | State reducer + provider | studio/* , page |
| A2-1 | 3 | Split compliance vs creative scoring | briefgen, anthropic |
| A2-2 | 3 | Idea-level A/B contrast | briefgen, anthropic |
| A2-3 | 3 | Differentiate providers structurally | briefgen, anthropic |
| B3-1 | 3 | Split views/steps + Stepper + validation | studio/views, studio/steps |
| A3-1/C1 | 4 | Cross-send fatigue guard | briefgen, types, supabase, studio |
| C2 | 4 | Diversity score panel | OutputView |
| C3 | 4 | +Yahoo dilution warning | SegmentsStep, intelligence |
| B4-1 | 4 | Output two-pane redesign | OutputView |

## Decisions still needed before Phase 4
1. `send_history` table (RLS) vs. derive from `saved_versions`. _(Recommended: new table.)_
2. Embeddings for semantic similarity (cost/latency) vs. n-gram for now. _(Recommended: n-gram now, embeddings later.)_
3. Final step names and the 6→7 step split sign-off.
