# EmailAuto Studio — Enhancement & Output-Quality Plan (2026-06-18)

**Author:** prepared for hand-off to Codex / Claude Code.
**Scope:** improve generated output quality and variety, compact the prompt to stop incomplete/truncated generations, and wire in the real campaign corpus (`Source/*.xlsx`, `RMKT Master Plan.xlsx`) and `email-campaign-playbook.html` do/don'ts.
**Style of this doc:** every task has a target file, a concrete change, and an acceptance check. Task IDs are stable; implement top-to-bottom by phase.

---

## 0. Verified current state (read before starting)

These were confirmed in code on 2026-06-18 so the plan does **not** re-propose shipped work:

| Already shipped | Evidence |
|---|---|
| Random-nonce variety salt (kills identical re-runs) | `lib/anthropic.ts:918-921` pass `randomUUID()` nonces into `withOptionVariety` / `selectVarietyProfile` |
| Tunable sampling: `AI_TEMP_A=0.85`, `AI_TEMP_B=1.0`, `AI_TEMP_B_RETRY=0.9`, `AI_TOP_P=0.95`, `AI_REPAIR_TEMP=0.6` | `lib/anthropic.ts:64-68` |
| Segment batching + concurrency + A/B contrast retry | `lib/anthropic.ts:79-82, 950-1017, 1116` |
| Compliance-only repair gate | `briefgen.ts isComplianceRepairFlag`, used in `anthropic.ts:891` |
| Deterministic validation engine (validateBrief + deliverability + freshness + diversity eval) | `lib/quality/*`, `briefgen.ts validateBrief` |

| **NOT yet done (this plan targets these)** | Evidence |
|---|---|
| Claude & Gemini still emit **raw-text JSON** (no structured output); only OpenAI uses `json_object` | `lib/anthropic.ts:275` is the only structured call; `callClaude` (196) / `callGemini` (220) send plain text |
| `MAX_OUTPUT_TOKENS` hardcoded `16000`, no truncation salvage — truncation just throws | `lib/anthropic.ts:84, 215, 244, 305` |
| Output schema carries redundant fields (singular + numbered banner, singular + options subjects, verbose prose `quality_checks`, `body_options`) | `briefgen.ts` GenBrief types + schema block ~`1546-1579` |
| The real campaign corpus (`Source/*.xlsx`) is **not** used as few-shot anchors | no reference module in `lib/config` |
| RMKT Master Plan learnings (A/B results, segment perf, hero CBH ranking, +Yahoo dilution) not encoded | `intelligence.ts` is hand-authored, thin |
| No cross-send fatigue persistence, no +Yahoo/dilution warning, no trigger-email mode | confirmed in planning docs |

---

## 1. Diagnosis: why generations come back incomplete

Root cause is **output-token exhaustion**, not input length — though the bloated prompt makes it worse by anchoring the model toward verbose JSON.

1. **Output budget is the hard wall.** `MAX_OUTPUT_TOKENS = 16000`. A 5-segment × 6-product brief needs ~13–16k output tokens for valid JSON. When `quality_checks` prose runs long, the JSON truncates mid-field → `parseStrictJson` fails → the retry regenerates the *entire* brief and can truncate again. Claude Sonnet 4.6 / Opus support far more than 16k output; the cap is artificially low.
2. **The schema is heavier than it needs to be** (see §3): duplicate banner fields, duplicate subject fields, free-text `quality_checks`, and optional `body_options` all inflate output token count.
3. **No graceful degradation.** On `stop_reason === "max_tokens"` the code throws (`anthropic.ts:215`) instead of salvaging the complete portion.
4. **The system prompt is ~18–22k input tokens.** Long inputs don't truncate output directly, but a sprawling prompt with many "be exhaustive" instructions pushes the model toward long answers. Compacting it (§2) both reduces cost and nudges shorter, cleaner JSON.

**Strategy:** (a) raise + adaptively manage the output budget, (b) slim the schema, (c) move prose rules out of the prompt into code-enforced validation, (d) add structured output + truncation salvage so a near-complete brief is never wasted.

---

## PHASE 1 — Completeness & reliability (stops the truncation pain)

### P1-1 — Raise and centralize the output-token budget
**File:** `lib/anthropic.ts:84`
- Replace the hardcoded `const MAX_OUTPUT_TOKENS = 16000` with `envNumber("AI_MAX_OUTPUT_TOKENS", 32000, 4000, 64000)`.
- Pass per-call: full-brief calls request the full budget; segment-patch calls (`buildSegmentPatchPrompt`) request a smaller budget (e.g. `min(budget, 8000)`).
- Document `AI_MAX_OUTPUT_TOKENS` in `CLAUDE.md` env table.
**Acceptance:** a 5-segment/6-product Sonnet generation completes without `truncatedMessage`; env override changes the cap.

### P1-2 — Structured output for Claude (tool-use) and Gemini (responseSchema)
**Files:** `lib/anthropic.ts` `callClaude` (196), `callGemini` (220); new `lib/anthropic/schema.ts`
- Define the GenBrief JSON schema once (derive from the TS types in `briefgen.ts`) in `lib/anthropic/schema.ts`.
- **Claude:** add a single `tools: [{ name: "emit_brief", input_schema }]` with `tool_choice: { type: "tool", name: "emit_brief" }`. Read `tool_use.input` directly — no `parseStrictJson` needed.
- **Gemini:** set `generationConfig.responseMimeType = "application/json"` + `responseSchema`.
- **OpenAI:** upgrade `json_object` → `json_schema` (strict) using the same schema.
- Keep `parseStrictJson` as a fallback path for providers/models that reject schema.
**Acceptance:** invalid-JSON parse failures (and the FIX_JSON retry) drop to ~0 in a 20-run smoke test across all three providers.

### P1-3 — Truncation salvage (never waste a near-complete brief)
**File:** `lib/anthropic.ts` (parse path ~177-194) + new `salvagePartialJson` helper
- On `stop_reason === "max_tokens"` (or any unterminated JSON), attempt to close open brackets/strings and extract the largest valid prefix object. Salvage complete top-level keys (`creative_direction`, `subject_lines`, `banner`, `body`, complete `products[]` items); backfill missing `quality_checks` with a code-generated stub and attach an `_advisory` flag `"output truncated — N fields regenerated"`.
- Only fall back to full regeneration if salvage yields no usable copy.
**Acceptance:** a deliberately undersized budget run returns a usable brief flagged as salvaged rather than throwing.

### P1-4 — Adaptive retry on truncation (shrink, don't repeat)
**File:** `lib/anthropic.ts` retry path
- If a call truncates and salvage is insufficient, retry once with a **reduced schema**: 1 subject option/segment instead of 3, drop `body_options`, collapse `quality_checks` to enums (see P3-3). Tag the result `_advisory: "regenerated in compact mode"`.
**Acceptance:** forced-truncation case recovers in ≤1 extra call with a complete brief.

### P1-5 — Lower the batching threshold
**File:** `lib/anthropic.ts:79`
- Change `SEGMENT_BATCH_THRESHOLD` default from `2` to `1` so any 2+ segment campaign batches the anchor + patches (smaller per-call output). Keep env-overridable.
**Acceptance:** 3-segment campaign now logs batching; per-call output tokens drop.

---

## PHASE 2 — Prompt compaction (keep quality, cut length)

Goal: cut system-prompt size ~30–40% with **zero loss of rule coverage**, by moving enforce-able rules into code (validation already covers most — see the enforcement map in §6) and keeping only *generative guidance* in the prompt.

### P2-1 — Move static phrase-bank lists out of the prompt
**File:** `lib/briefgen.ts:196-241` (SPAM_WORDS, WEAK_COPY, AI_SLOP_PHRASES, BODY_HARD_SELL_PATTERNS, UNSUPPLIED_PROOF)
- These ~800 tokens of lists are already enforced in `validateBrief` / `deliverability.ts`. Remove the full lists from any prompt layer; replace with one compact line: *"Avoid spam/AI-slop/hard-sell phrasing and never invent proof; the validator will reject violations."*
**Acceptance:** prompt shrinks ~600–800 tokens; validator still flags the same violations (existing eval/golden set passes).

### P2-2 — De-duplicate the do/don't rules across layers
**Files:** `briefgen.ts` CORE_PROMPT_LAYER (1434), BRAND_PLAYBOOK_RULES (176-193), `intelligence.ts` block (95-107), openerFallback (1662)
- The same "no gratitude opener / no click-here / no fake Re:/Fwd: / no bullet opener" rules are repeated in 3–4 places. Define one `GLOBAL_DO_DONTS` constant (~250 tokens) included once; brand layers keep **only** brand-specific deltas (voice, palette hex, hero, persona) and reference the global block.
**Acceptance:** ~400–600 token reduction; grep shows each rule stated once.

### P2-3 — Conditionally include optional layers
**File:** `briefgen.ts buildSystemPrompt` / `renderPromptLayers` (1426-1611), `buildUserPrompt` (1633-1698)
- Wrap optional layers in presence checks and `.filter(Boolean)` so they are omitted when empty: Winning Reference (only if `campaign.winningContent`), Adaptive Performance Feedback (only if history present), Strategy Intake (only if `campaign.strategy`), Campaign Operations (only if `campaign.ops`), Recent Send History (only if non-empty).
**Acceptance:** a minimal quick-iteration campaign generates with ~1,000–2,000 fewer input tokens; full campaigns unchanged.

### P2-4 — Slim the segment-patch system prompt
**File:** `lib/anthropic.ts buildSegmentPatchPrompt` (~634-695)
- Patch calls inherit the anchor's creative direction, so they don't need CREATIVE_VARIATION, EMAIL-CONTENT-XLSX-reference, or SENDGRID-HTML-fit layers. Build a dedicated lighter system prompt: Role + Output Contract (patch shape) + subject/body component rules + playbook compliance only.
**Acceptance:** per-patch input drops ~2,000–3,000 tokens; merged briefs still pass validation.

### P2-5 — Condense subject/preheader & component instructions
**File:** `briefgen.ts COMPONENT_PROMPT_LAYER` (1447-1453)
- Replace the multi-paragraph subject/preheader prose with a tight spec: *"Subject 42–58 ch (hard cap 60), 1 offer signal, {{first_name}} in subject OR preheader not both. Preheader 60–90 ch, must add a NEW beat. First body sentence doubles as the Gmail summary—name product + offer."* Numeric limits live in the validator already.
**Acceptance:** ~200–300 token reduction; subject/preheader checks still pass in eval.

> **Net Phase-2 target:** ~3,500–5,500 fewer system-prompt tokens. After implementing, run the diversity + golden-set eval (`app/api/eval`) to confirm no quality regression.

---

## PHASE 3 — Slim the OUTPUT schema (the real truncation lever)

### P3-1 — Collapse duplicate banner fields
**File:** `briefgen.ts` GenBanner type (~47-81) + schema block (~1562)
- Remove singular `main_text` / `sub_text` (the renderer/UI uses `main_text_1/2/3`, `sub_text_1/2/3`). Remove the `options?: GenBannerOption[]` array (banner is singleton per option). Update `lib/render/email.ts` + `BriefView.tsx` reads if they reference the singular fields.
**Acceptance:** banner renders identically; ~600–950 fewer output tokens/brief.

### P3-2 — Flatten subject_lines
**File:** `briefgen.ts` GenSubject type + schema (~1522)
- Drop the duplicated top-level `subject`/`preheader`; make `options[]` the source of truth (first option = primary). Update validator + UI to read `options[0]`.
**Acceptance:** ~300–500 fewer output tokens/multi-segment brief; subject UI unchanged.

### P3-3 — Convert `quality_checks` from prose to enums
**File:** `briefgen.ts` GenQualityChecks (115-131) + PLAYBOOK_REQUIRED_QA (160-165) + validator
- Change each field from a sentence to a short enum (e.g. `hook_alignment: "aligned" | "weak" | "missing"`). Move any human-readable rationale the UI wants into `_advisory` generated by code, not the model.
**Acceptance:** ~600–900 fewer output tokens/brief; QA panel still shows status per field.

### P3-4 — Make `body_options` opt-in
**File:** `briefgen.ts` GenBodyOption (108-114) + schema; `app/studio` build step
- Only request `body_options` when the user explicitly ticks "give me body alternatives" (new `campaign.wantBodyAlternatives` flag, default false).
**Acceptance:** default generations omit body_options (~800–1,200 fewer output tokens/multi-segment brief); opt-in still works.

> **Net Phase-3 target:** ~2,000–3,500 fewer output tokens/brief — directly widening the completion headroom that causes truncation.

---

## PHASE 4 — Output QUALITY: wire in the real corpus & playbook learnings

This is where output gets demonstrably better, not just more reliable.

### P4-1 — One-time offline extraction of few-shot exemplars
**New:** `scripts/extract-exemplars.ts` (or Python) → `lib/config/exemplars.ts`
- The `Source/*.xlsx` files hold years of real campaigns in (almost) the exact GenBrief shape, but are 300MB+ — **never parse at runtime.** Offline, pull the **latest 2–3 strong sheets per brand** (2024-2026 format) and extract the **English copy fields only** (subject, preheader, per-segment body, product main/sub/USP/badge/review/CTA). Treat the Vietnamese Theme/Banner notes as design reference, not copy. Cross-reference `WinEmailTemps/` (positive) vs `FailedEmailTemps/` (negative) folders if present.
- Output a compact curated TS module: `EXEMPLARS[brandId][segmentCode] = { subject, preheader, bodyExcerpt, productPattern }` — each excerpt trimmed to ~60–90 words.
**Acceptance:** `lib/config/exemplars.ts` exists, < ~25KB, one curated exemplar per brand×key-segment.

### P4-2 — Inject ONE rotating exemplar into the prompt (not the whole bank)
**File:** `briefgen.ts buildSystemPrompt`
- Add a compact "How this brand/segment actually reads" block containing a **single** exemplar (rotated by the existing nonce so it varies run-to-run and never anchors to one template). This raises voice fidelity (Sandra's empathy + P.S. scarcity; GentsLux statistic-led hooks; LuxFitting fabric-tech USPs; SantaFare named handwritten reviews) while adding only ~150–250 tokens.
**Acceptance:** generated voice visibly matches brand exemplars in a blind side-by-side; token cost ≤ 250.

### P4-3 — Encode A/B-test learnings from RMKT Master Plan as design rules
**File:** `briefgen.ts` (design-brief / banner guidance layer) + `intelligence.ts`
- From `AB Test Planning` / `Observations` sheets, encode the validated findings as guardrails: prefer **image-based blocks**; **colored-background blocks = potential**; **single-column improves Access** (note the CR trade-off); **percent-discount slightly beats free-shipping**; **GIF blocks not worth it**; **birthday emails very effective**; **rebuy ~3 months, cross-buy ~2 months**.
**Acceptance:** design-brief output reflects these defaults; rules cite "RMKT A/B test" provenance in comments.

### P4-4 — Refresh `intelligence.ts` from `2025 Segment Analysis` + `Cross Sell Product`
**File:** `lib/config/intelligence.ts`, `lib/config/brands.ts`
- Replace thin hand-authored perf text with empirical per-brand × segment funnel signals (Open/Access/CR/AOV/CBH) and a **CBH-ranked hero/support/avoid product pool** (e.g. avoid zero-purchase items: BreezyBloom2, CushyCurves, HunkyWear3, SlimBoxers2, VentyFlex2). Feed segment `guidance` from the `Segmentation` content-strategy matrix (message intent + sample subject per segment).
**Acceptance:** Perf panel + prompt show data-backed segment guidance; hero recommendations match CBH ranking.

### P4-5 — Close playbook enforcement gaps in code (not prompt)
**File:** `lib/quality/deliverability.ts`, `briefgen.ts validateBrief`
Add the checks the playbook teaches but code doesn't yet enforce (so they can be *removed* from the prompt):
- **Dark-mode CSS presence** (`prefers-color-scheme: dark`) in rendered HTML — analysis found 0/46 templates have it despite ~49% Apple MPP.
- **Image-only CTA risk:** flag when a CTA exists only inside an image with no HTML/text fallback.
- **`role="presentation"` / ARIA** on layout tables; **`max-width:100%`** on product images.
- **Banner 3-beat progression:** warn if `main_text_1/2/3` are all discount headlines (no tension→proof→resolution arc).
- **First-200px CTA / above-the-fold** heuristic: primary CTA should appear in flow before the product grid.
**Acceptance:** new flags fire on known-bad fixtures; corresponding prose can be trimmed from the prompt.

### P4-6 — Strengthen A/B contrast from label-deep to idea-deep
**File:** `briefgen.ts briefContrastIssues` (2172-2238) + `anthropic.ts` contrast retry
- Current contrast is mostly string-similarity on labels. Add structural-distinctness scoring: subject *family* (strategic vs curiosity vs direct-response), banner *pattern* (3-beat vs proof-first vs loop), body *architecture family*, and per-segment angle freshness. Block the A/B pair (force retry) when structural distinctness is below threshold, not just when text overlaps.
**Acceptance:** the diversity eval `meanDistance` rises; A/B pairs differ in structure, not just wording.

---

## PHASE 5 — Innovative feature enrichment (data-backed, prioritized)

Ordered by impact-to-effort. Each is independently shippable.

### P5-1 — +Yahoo / segment-dilution warning ⭐ highest ROI
The single biggest finding in the perf data: **+Yahoo blasts suppress CBH/Delivered 40–60% in every brand every month**, and list dilution (155K high-value vs 385K broad = 4× higher CBH/Del) explains most performance swings.
- Add a Step-4 (segments) advisory: when the audience/segment rule implies +Yahoo or a broad/low-value list outside a proven peak event (Black Friday, Valentine), show a red warning with the expected CBH/Del penalty.
**File:** `app/studio/views/BuildView.tsx` (segment step) + a `lib/quality/listQuality.ts` rule. **Acceptance:** selecting +Yahoo on a non-peak date surfaces the warning.

### P5-2 — Trigger-email mode (birthday / back-in-stock / anniversary) ⭐
Trigger emails are top-3 Access/Open in 20/24 brand-months; BG birthday averages +45% CBH/Del vs generic.
- Add a campaign `type: "campaign" | "birthday" | "back_in_stock" | "anniversary"` with tailored prompt scaffolds and escalating-incentive logic for anniversaries.
**File:** `lib/config/types.ts`, `briefgen.ts`, build wizard. **Acceptance:** selecting "birthday" produces a birthday-structured brief with the right hook family.

### P5-3 — Cross-send fatigue guard (persisted) ⭐
The playbook's #1 anti-CTR-decay gate; today only `recentProductSlugs` exists.
- Persist per-send `{angle, framework, opener, emotionalArc, hero, visualPattern, segment, date}` (new RLS `send_history` table, or derive from `saved_versions`). On generate, inject an "avoid these recently-used levers" block and surface the existing `freshness.ts` score in the UI with a 14-day same-trigger guard.
**File:** `supabase/migrations/000X_send_history.sql`, `lib/history.ts`, `briefgen.ts`, `freshness.ts`. **Acceptance:** repeating a recent angle drops the freshness score and shows a rotate-creative warning.

### P5-4 — Pre-send quality gate before SendGrid sync
- Block `/api/sync-template` and `/api/sync-sendgrid` when the brief has unresolved **blocking** deliverability/validation findings (grade F or any `block` severity), with an explicit override.
**File:** `app/api/sync-*`, `PreflightPanel.tsx`. **Acceptance:** an F-grade brief cannot sync without override.

### P5-5 — Product-intelligence gate in Step 3
- Surface recommended hero / support pool / avoid-list (from P4-4 CBH ranking) in the product step; require a one-line reason when the user picks a low-CVR hero.
**File:** `BuildView.tsx` product step. **Acceptance:** picking a zero-purchase product as hero prompts a justification.

### P5-6 — Closed-loop send-result ingestion (makes model/lever choice measurable)
- Add a results table (CBH/Del, Access/Del, CR, optout per send) and a monthly recompute that updates best hero pools, avoid lists, and which angle/framework/provider actually won. Turns model selection from preference into evidence.
**File:** new `agents/analytics` job + `lib/performance/feedback.ts`. **Acceptance:** monthly job updates `intelligence.ts`-equivalent data; feedback loop shows winning levers.

### P5-7 — Live "Studio Health" artifact / dashboard
- A persisted Cowork artifact (or `data:build-dashboard`) showing generation success rate, truncation rate, mean diversity score, deliverability-grade distribution, and token cost per provider — so the prompt-compaction wins are measurable over time.
**Acceptance:** dashboard renders current-run metrics and refreshes.

### P5-8 — SantaFare seasonality guard
- Off-season (Mar–Oct) restrict to event triggers (birthday, gift-guide, major holidays); warn on broad always-on sends.
**File:** build wizard + a calendar rule. **Acceptance:** off-season broad SantaFare send shows a seasonality warning.

### P5-9 — Rate limit `/api/generate-copy`
- Documented cost-abuse risk: an approved user can loop generation. Add per-user/min rate limiting.
**File:** `app/api/generate-copy/route.ts`. **Acceptance:** exceeding the limit returns 429.

---

## 6. Enforcement map (what to move from prompt → code during Phase 2)

The validator already covers the bulk of the playbook, which is why the prompt can be cut safely. Keep in the **prompt** only generative guidance; rely on **code** for the rest.

| Rule area | Already in code | Action |
|---|---|---|
| Spam/AI-slop/weak/hard-sell phrases | `deliverability.ts` SPAM_PHRASES + `briefgen.ts` lists | **Remove lists from prompt** (P2-1) |
| Subject/preheader length, offer signal, {{first_name}} placement, new-beat | `briefgen.ts:1818-1830` | Keep 1-line spec only (P2-5) |
| Body opener mechanics, persona sign-off, word count, product link, hard-sell | `briefgen.ts:1964-2010` | Keep mechanic *choice* in prompt; drop the enumerated prohibitions |
| Product count/hero/USP/review/CTA/images | `briefgen.ts:2065-2104` | Keep brief style guidance; drop numeric repetition |
| Invented proof / supplied-only | `briefgen.ts UNSUPPLIED_PROOF` | One line in prompt |
| Dark mode, image-only CTA, ARIA, max-width, banner 3-beat, above-fold CTA | **NOT yet** | **Add to code** (P4-5), then trim from prompt |
| Segmentation/lifecycle psychology, +Yahoo, frequency cap | mostly prompt-only | Keep in prompt; add warnings in UI (P5-1/5-8) |

---

## 7. Suggested sequencing & verification

1. **Phase 1** (reliability) first — biggest user-visible pain. Ship P1-1, P1-3, P1-5 immediately; P1-2/P1-4 next.
2. **Phase 3** (schema slim) before/with **Phase 2** (prompt slim) — schema slimming has the larger truncation impact and is low-risk.
3. **Phase 4** (quality) — exemplars + intelligence refresh + contrast.
4. **Phase 5** features by ROI: P5-1, P5-2, P5-3 first.

**Verification harness for every phase:**
- `npx tsc --noEmit` and `npm run build` must pass (per `CLAUDE.md`).
- Run `app/api/eval` (golden set + diversity) before/after each phase; record `compliancePassRate` (must stay 1.0) and `meanDistance` (should rise or hold).
- Add a **token/completeness regression test**: a fixture campaign at 5 segments × 6 products must complete without truncation and stay within target output tokens. Log truncation rate before/after.
- For Phase 4, do a **blind voice A/B**: 5 generations per brand, human-rate against the `Source/*.xlsx` exemplars.

---

## 8. Open decisions for the owner (pick before building)

1. **Structured output (P1-2):** centralize one JSON schema shared across providers, or per-provider schemas? (Recommend shared, derived from TS types.)
2. **Send history (P5-3):** new `send_history` RLS table vs derive from `saved_versions`? (Recommend new table.)
3. **Exemplar refresh (P4-1):** how often re-extract from `Source/*.xlsx` — quarterly manual, or a scheduled job?
4. **Default output cap (P1-1):** 32k default acceptable for cost/latency, or keep lower with adaptive raise?
5. **A/B contrast blocking (P4-6):** hard-block low-distinctness pairs (forces a retry, more latency) or warn-only?

---

### Appendix A — Quick-win checklist (highest impact, lowest effort)
- [ ] P1-1 raise `AI_MAX_OUTPUT_TOKENS` to 32k (1 line)
- [ ] P1-5 batching threshold 2 → 1 (1 line)
- [ ] P3-1 remove duplicate banner fields
- [ ] P3-3 quality_checks → enums
- [ ] P2-1 remove phrase-bank lists from prompt
- [ ] P5-1 +Yahoo / dilution warning
- [ ] P5-9 rate-limit generate-copy
