# EmailAuto Studio — Implementation Plan (Jul 2026 refresh)

**Audience:** an executing coding agent (Codex / Claude Code) working in this repo.
**Source of truth for content rules:** `docs/email-campaign-playbook.html` (updated Jul 2026 — includes the
"Artificial Proof Is Allowed" refresh, banner anatomy, the product-block template catalog, and the
subject/preview teardown). This plan operationalizes that playbook into the app.

## How to use this plan
- Work phase by phase, ticket by ticket. Each ticket is self-contained: **Why → Files → Do → Acceptance → Verify.**
- **Line numbers are indicative** (captured Jul 2026). Always re-locate symbols by name before editing — do not trust line numbers blindly.
- **Before every commit:** `npx tsc --noEmit` then `npm run build` must both pass (per `CLAUDE.md`). Run `npm run lint` too.
- **Do not deploy.** Contributors cannot deploy (Vercel is maintainer-only). End at: branch pushed + PR opened.
- Keep all brand/segment/product logic derived from `lib/config/*` — never hardcode it into prompts or components.
- Keep prompt schema (`buildSystemPrompt` output contract) and the `GenBrief` TS types in `lib/briefgen.ts` in sync at all times.

## Background: what the analysis found (the "why" behind everything below)
Teardown of 29 winning vs 29 failing `.eml` templates + the four `*_Email Content.xlsx` archives:
- **Artificial proof is standard in winners** — star badges, `98% RECOMMENDED`, `LAST 30 ITEMS`, `4.9/5 RATING`,
  `BEST SELLER`, and named quotes (`"Fantastically stretchy!" – Walter B.`). The failure mode is **not** artificiality.
- **What actually fails:** fake clinical stats in body prose ("studies show… 23%"), stacked impersonal stats
  ("894 men switched", "150K hrs"), brand-as-announcer corporate benefit-speak, generic flattery openers,
  and passive/vague urgency. Winners are **one human voice + one concrete pain + one named sensory testimonial + one real reason to act + mandatory net-new P.S.**
- **Product blocks are composite tiles**: each has *Popout badge · Main text (uppercase benefit) · Sub text · USPs · Review (attributed) · CTA*. This maps 1:1 to `GenProductBlock`.
- **Banner** = 5-star logo strip + offer headline + review sub-line + big %/price + hero product + CTA + free-ship/scarcity line.
- **Subjects:** compact, first-person emotion / open-loop / reluctant-deadline win; stat-stacked & abstract-gratitude lose. Preheader must add a *new* beat.

---

# Phase 0 — Baseline & guardrails (do first)

### T0.1 — Establish a green baseline
- **Why:** every later ticket must be diffable against a known-good build.
- **Do:** `npm ci` (or `npm install`), then `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npx vitest run`. Record any pre-existing failures.
- **Acceptance:** baseline status documented in the PR description (what already passes/fails before changes).
- **Verify:** commands exit as recorded.

### T0.2 — Create a working branch
- **Do:** `git checkout -b feat/playbook-2026-07`.
- **Acceptance:** branch exists; no changes to `vercel.json`, deploy config, or GitHub Actions that deploy.

---

# Phase 1 — Encode the refreshed playbook into the prompt engine

Goal: the model receives the Jul 2026 rules as explicit constraints, and the "artificial proof allowed / abstract-science forbidden" stance replaces the old "never use artificial proof" wording.

### T1.1 — Update `lib/config/playbook.ts` rules for the artificial-proof stance
- **Why:** current rules (e.g., R4/R5) treat artificial ratings/counts as failures; the playbook now permits artificial proof and reframes the failure as *pseudo-scientific / impersonal framing*.
- **Files:** `lib/config/playbook.ts` (rule objects `{id,name,scope,win,fail,enforce}`), consumed by `promptRuleBlock()`.
- **Do:**
  - Edit R4 ("Body opener + proof") and R5 ("Pain to relief") `win`/`fail` strings so:
    - `win`: artificial reviews, ratings, %-recommend, best-seller/scarcity badges are **allowed and encouraged on tiles/banner**; testimonials must be **named + sensory + specific**; at most one number in body prose, always beside a named human.
    - `fail`: fake clinical statistics in prose ("studies show… %", "research finds"), stacked impersonal counts, brand-as-announcer, passive urgency. Remove wording that brands all artificial ratings/counts as failures.
  - Add a new rule (e.g., R23 "Proof placement"): *ratings/badges belong on product tiles & banner chips; body prose carries sensory + one named story.*
- **Acceptance:** `promptRuleBlock(brandId,"prompt")` output contains the new stance; no rule text says artificial proof must be avoided or "marked needs verification."
- **Verify:** add/adjust a case in `lib/briefgen.prompt.test.ts` asserting the assembled system prompt contains "artificial" allowance language and forbids "studies show"; `npx vitest run`.

### T1.2 — Reflect the stance in `buildSystemPrompt` layers
- **Why:** `briefgen.ts` assembles ~28 prompt layers incl. "Artificial Proof Mode", "Core Rules", "Playbook Rules". These must not contradict T1.1.
- **Files:** `lib/briefgen.ts` (`buildSystemPrompt`, ~L1924–2072; the "Artificial Proof Mode" and "Core Rules" layers).
- **Do:** rewrite the "Artificial Proof Mode" layer to: (a) permit invented reviews/ratings/claims/badges/counts; (b) require they read as a specific human or a punchy tile badge; (c) forbid clinical-study phrasing and stacked impersonal stats. Keep the "one voice / persona-as-subject" and "mandatory net-new P.S." core rules.
- **Acceptance:** the layer no longer instructs the model to mark proof "synthetic / needs verification"; it instead instructs *how* to make artificial proof land.
- **Verify:** `AI_PROMPT_DEBUG=on` local run logs the assembled prompt; confirm the layer text. Snapshot test updated.

### T1.3 — Add banner-anatomy + product-block-field guidance to the prompt
- **Why:** ensure generated `banner` and `products[]` fill every slot the playbook defines (logo_stars, headline, review sub-line, offer figure, CTA, reassurance; and per product: popup_badge, main_text, sub_text, usps, review, cta).
- **Files:** `lib/briefgen.ts` ("Component Rules" / "Production Brief Pattern" layers; the Output Contract ~L1974–2014).
- **Do:** add explicit field-by-field instructions mirroring the playbook "Banner anatomy" and "Product-block template catalog" tables, including badge vocabulary examples (`98% RECOMMENDED`, `LAST 30 ITEMS`, `BEST SELLER`, `4.9/5 RATING`).
- **Acceptance:** prompt enumerates each banner slot and each product field with a 1-line spec + example.
- **Verify:** generate a brief locally (or via `app/api/eval`) and confirm banner + product fields are populated, not empty.

---

# Phase 2 — Product-block templates in the Build step

Goal: expand the current 5 `ProductCopyStyle` values to include the 4 new templates from the playbook catalog (`persona_pick`, `story_review`, `bundle_nudge`, `new_arrival`), surface them in the Build wizard, thread them through the prompt, and (optionally) reflect them in render.

### T2.1 — Extend the `ProductCopyStyle` union
- **Why:** add the new templates as first-class options.
- **Files:** `lib/config/types.ts` (`export type ProductCopyStyle` ~L92; `Campaign.productCopyStyle` ~L239).
- **Do:** add `"persona_pick" | "story_review" | "bundle_nudge" | "new_arrival"` to the union. Keep `headline_winner` as default.
- **Acceptance:** type compiles; union has 9 members.
- **Verify:** `npx tsc --noEmit`.

### T2.2 — Surface the new templates in the picker UI
- **Why:** users choose the block template in Build Step 2.
- **Files:** `app/studio/StudioPanels.tsx` (`ProductStylePicker`, ~L1151+); it renders in `app/studio/StudioApp.tsx` ~L1645.
- **Do:** add option cards for the 4 new templates with a 1-line description each (from the playbook catalog "Best for" column). Keep the picker visually compact (see Phase 4).
- **Acceptance:** all 9 templates selectable; selection persists to `campaign.productCopyStyle`.
- **Verify:** run `npm run dev`, open Studio, select each new template, confirm it round-trips (reducer state).

### T2.3 — Thread the template through generation state & server validation
- **Why:** the choice must reach the prompt and survive server-side validation.
- **Files:** `app/studio/studioShared.ts` (StudioCampaignState), `app/studio/useStudioReducer.ts` (hydrate/reset), `app/api/generate-copy/route.ts` (input cleaning/validation), `lib/briefgen.ts` (where `campaign.productCopyStyle` is injected, ~L1958 / user-prompt facts ~L169).
- **Do:** ensure the new enum values are accepted (no allowlist rejects them), hydrated on load, and reset correctly on brand switch.
- **Acceptance:** generating with a new template does not 400; the prompt's product-template line reflects the choice.
- **Verify:** POST to `/api/generate-copy` locally with each new value; confirm 200 + prompt reflects it (`AI_PROMPT_DEBUG=on`).

### T2.4 — Teach the prompt what each template means
- **Why:** the model must render the block differently per template (which field leads, which badge vocabulary).
- **Files:** `lib/briefgen.ts` (Component Rules / Output Contract for `products[]`).
- **Do:** add a compact mapping (template → lead field + badge examples + best-for) so `main_text`, `popup_badge`, `review`, `cta` follow the chosen style. Reuse the playbook catalog table verbatim as the spec.
- **Acceptance:** briefs generated with `story_review` lead the block with a named micro-story; `urgency_badge`/`bundle_nudge` produce scarcity/free-ship badges; etc.
- **Verify:** generate one brief per template; spot-check the `products[]` output matches the template intent.

### T2.5 — (Optional) Reflect template in render
- **Why:** today `lib/render/email.ts` ignores `template_style`; layout is purely `stack|two|three|hero_grid`. Visual differentiation is nice-to-have.
- **Files:** `lib/render/email.ts` (`productBlock` / product cell inner, ~L310–350).
- **Do:** if pursued, branch presentation on `template_style` (e.g., `price_prominent` enlarges price; `story_review` gives the review more room; `urgency_badge` styles the badge). Keep it email-safe (tables, inline styles, merge tags literal). If not pursued now, leave a `// TODO(template_style)` and note it in the PR.
- **Acceptance:** render remains email-safe; no regressions to existing layouts.
- **Verify:** `lib/render` unit tests + visual check of exported HTML in a browser.

---

# Phase 3 — Prompt fidelity & completeness (fix "incomplete / prompt-leak" briefs)

Goal: eliminate the reported symptom where a generated brief "is incomplete or just lines of prompt instead of results."

### T3.1 — Diagnose & log the salvage path
- **Why:** `lib/anthropic.ts` `salvagePartialJson()` closes truncated JSON by filling missing fields with empties — the most likely cause of "incomplete" briefs. Silent salvage hides the root cause.
- **Files:** `lib/anthropic.ts` (`parseStrictJson`, `salvagePartialJson`, ~L52–104; `createAndParseWithModel`).
- **Do:** when salvage triggers, emit a structured telemetry log (gated by `AI_GENERATION_TELEMETRY`) recording which top-level keys are missing/empty, the model, and token usage. Surface the existing `_advisory` warning to the client output view.
- **Acceptance:** a truncated response produces a visible advisory + a log listing missing fields; no silent empty briefs.
- **Verify:** unit test feeding a deliberately truncated JSON string to `parseStrictJson`; assert advisory + missing-key report.

### T3.2 — Guarantee required fields post-merge (foundation + segment patches)
- **Why:** layered generation merges a shared "foundation" with per-segment "patches"; a dropped/failed patch leaves segments without subject/preheader/body → looks incomplete.
- **Files:** `lib/anthropic.ts` (`generateOptions` merge logic), `lib/briefgen.ts` (`validateBrief` / `validateBriefPair`, `segJsonKey`).
- **Do:** after merge, assert every selected segment has non-empty `subject_lines[seg]`, `body[seg]`; if a patch is missing, retry just that patch once, else fill from `body.base` and flag it in `_flags`.
- **Acceptance:** with N segments selected, output always contains N complete segment entries or an explicit per-segment flag.
- **Verify:** simulate a missing patch (mock) and confirm fallback + flag; add a test in `lib/anthropic.test.ts`.

### T3.3 — Prevent prompt text from leaking into output fields
- **Why:** "just lines of prompt instead of results" implies instruction text or placeholders (e.g., `[HOOK_CONTRACT]`, layer headings) reaching output fields.
- **Files:** `lib/briefgen.ts` (`validateBrief`), `lib/anthropic.ts` (post-parse sanitize).
- **Do:** add a validation check that flags/strips fields containing prompt-marker patterns (`[A-Z_]{3,}\]`, "Output Contract", "Return ONLY", layer titles). If found, trigger the existing single JSON-correction retry with an explicit "do not echo instructions" note.
- **Acceptance:** any output field containing a prompt marker is caught by `validateBrief` (`_flags`) and does not render silently.
- **Verify:** unit test feeding a brief whose `theme` contains `[HOOK_CONTRACT]`; assert it's flagged.

### T3.4 — Enforce merge-tag & spam-token invariants in output
- **Why:** playbook requires `{{paramurl}}`/`{{unsubscribe}}` literal, `$`→`💲`, "off"→`o.f.f`, no spam words (`SPAM_WORDS` in `briefgen.ts`).
- **Files:** `lib/briefgen.ts` (`validateBrief`, `SPAM_WORDS`), `lib/render/markdown.ts`.
- **Do:** confirm validation flags hardcoded `$`, raw "off", and spam words in generated copy; extend if gaps exist.
- **Acceptance:** a brief with `$19.99` or "50% off" in copy is flagged.
- **Verify:** unit test; `npx vitest run`.

### T3.5 — Pre-generation input completeness guard
- **Why:** thin product data (missing USPs/review/price/URL) yields thin briefs.
- **Files:** `app/api/generate-copy/route.ts`, `lib/briefgen.ts` (product context assembly ~L1933–1938).
- **Do:** before calling the model, warn (non-blocking) when a selected product lacks USPs/review/price; pass a clear instruction to draft artificial-but-concrete proof for those gaps (now allowed).
- **Acceptance:** thin-product runs still produce full blocks (using allowed artificial proof), and the response includes a "drafted proof" note.
- **Verify:** generate with a bare product; confirm complete block + note.

---

# Phase 4 — Build/Studio UI simplification

Goal: reduce on-screen density (user reports "too much"). Progressive disclosure, not feature removal.

### T4.1 — Collapse advanced inputs in Step 0 (Brand · Date · Theme)
- **Files:** `app/studio/StudioApp.tsx` (~L1481–1558), `app/studio/StudioPanels.tsx` (`StepCard` uses `<details>` already).
- **Do:** keep Brand / Date / Theme visible; move "Hook contract" and "Strategy enrichment" (goal/narrative/pain/solution/tone) into a collapsed `<details>` "Advanced (optional)".
- **Acceptance:** Step 0 shows ≤4 primary controls by default; advanced still reachable.
- **Verify:** `npm run dev` visual check at 1280px and mobile (~380px).

### T4.2 — Group Step 4 (Ops & Last-Send) into collapsible sub-sections
- **Files:** `app/studio/StudioApp.tsx` (~L1736–1787).
- **Do:** cluster the 12+ ops fields into "Send ops", "Consent & tracking", "Suppression/compliance", "Last send" collapsible groups, collapsed by default.
- **Acceptance:** Step 4 default view fits without long scroll; each group expandable.
- **Verify:** visual check; confirm all fields still bind (reducer unchanged).

### T4.3 — Default-collapse later wizard steps; keep Step 0 open
- **Files:** `app/studio/StudioApp.tsx` (STEP map ~L1285/1470–1803), `StepCard` open state.
- **Do:** open Step 0 by default, collapse 1–5 until clicked; show a per-step completion/summary chip.
- **Acceptance:** only one step expanded initially; summaries readable when collapsed.
- **Verify:** click through all steps; state persists.

### T4.4 — Tabbe­d / collapsible Review view
- **Files:** `app/studio/StudioApp.tsx` (Review view ~L1809–1949), `app/components/PreflightPanel.tsx`.
- **Do:** convert the ~8 stacked review panels (pre-flight, budget, models, playbook checklist, perf, prompt steering) into tabs or collapsed accordions; put the Generate CTA above the fold.
- **Acceptance:** Generate reachable without scrolling; panels available on demand.
- **Verify:** visual check; generation still works end-to-end.

### T4.5 — Consistency & a11y pass
- **Files:** `app/studio/StudioPanels.tsx`, `app/globals.css`.
- **Do:** unify choice-card vs radio patterns; ensure focus states, `aria-expanded` on `<details>` toggles, and 44px tap targets.
- **Acceptance:** keyboard-navigable; no contrast regressions.
- **Verify:** manual keyboard pass; optional `design:accessibility-review`.

---

# Phase 5 — Verification & QA (required before PR)

### T5.1 — Types, build, lint, unit
- **Do:** `npx tsc --noEmit` → `npm run build` → `npm run lint` → `npx vitest run`. All green (or no new failures vs T0.1 baseline).

### T5.2 — Generation smoke test across brands × templates
- **Do:** via `app/api/eval` (or `npm run dev` + Studio), generate A/B briefs for each brand (BraGoddess, GentsLux, LuxFitting, SantaFare) with a multi-segment selection and at least one new product template.
- **Acceptance:** every brief has: complete per-segment subject/preheader/body, full banner slots, full product blocks with badges, mandatory net-new P.S., no prompt markers, merge tags literal, no spam tokens, `_score` present. No empty-field salvage without an advisory.

### T5.3 — Render + export check
- **Do:** render one brief to SendGrid HTML (`lib/render/email.ts`) for each layout; open in a browser; run the Excel export (`lib/exportExcel.ts`).
- **Acceptance:** email-safe HTML (tables/inline styles), images `max-width:100%`, CTA labels present; export opens.

### T5.4 — Playbook ↔ app consistency check
- **Do:** confirm the app's product-template list and prompt stance match `docs/email-campaign-playbook.html` (artificial proof allowed; catalog of 9 templates; banner anatomy).
- **Acceptance:** no contradictions between doc and code.

### T5.5 — PR
- **Do:** push branch, open PR summarizing phases, link this plan, paste the T0.1 baseline vs final results. **Do not deploy.**

---

## Risk notes & sequencing
- **Phase 1 before Phase 2's T2.4** (prompt stance must exist before per-template prompt rules).
- **Phase 3 is independent** and can be parallelized; it is the highest-value fix for the "incomplete brief" complaint — consider doing T3.1–T3.3 early.
- **Phase 5 T5.2** is the real regression gate; budget time for a few generation runs (multi-segment frontier-model runs can take minutes; keep segment counts ≤ the route's `maxDuration`).
- Keep edits small and typed (`no any`); guard any new paid/user route with `requireActiveUser`.

## Quick file index (re-locate by symbol, not line)
| Concern | File | Symbol |
|---|---|---|
| Content rules (source of truth) | `docs/email-campaign-playbook.html` | Jul 2026 refresh sections |
| Playbook rules → prompt | `lib/config/playbook.ts` | rule objects, `promptRuleBlock` |
| Prompt assembly + schema + validation | `lib/briefgen.ts` | `buildSystemPrompt`, `buildUserPrompt`, Output Contract, `validateBrief`, `validateBriefPair`, `segJsonKey`, `SPAM_WORDS` |
| Generation + JSON parse + layered merge | `lib/anthropic.ts` | `generateOptions`, `parseStrictJson`, `salvagePartialJson`, `createAndParseWithModel` |
| Product copy templates (type) | `lib/config/types.ts` | `ProductCopyStyle`, `Campaign` |
| Template picker UI | `app/studio/StudioPanels.tsx` | `ProductStylePicker`, `LayoutPicker`, `StepCard` |
| Wizard shell / views | `app/studio/StudioApp.tsx` | STEP map, Build/Review views |
| Studio state | `app/studio/studioShared.ts`, `app/studio/useStudioReducer.ts` | `StudioCampaignState`, reducer |
| Generate route (auth + validation) | `app/api/generate-copy/route.ts` | POST handler |
| Render (email-safe HTML) | `lib/render/email.ts`, `lib/render/markdown.ts` | `renderEmailHTML`, `productBlock`, `ProductLayout` |
| Excel export | `lib/exportExcel.ts` | `exportBriefsToExcel` |
