# EmailAuto Studio — Output Quality Overhaul & Feature Enrichment Plan

**Audience:** an autonomous coding agent (Codex / Claude Code) working inside this repo.
**Status:** ready to execute. Phased. Each task lists *files to touch* and *acceptance criteria*.
**Author context:** written after auditing a real generated brief
(`GentsLux_brief_Wed24Jun26.xls`, 3 segments × 6 products, A/B) against the human "winning"
emails in `Source/WinEmailTemps/*.eml` and the prompt engine in `lib/briefgen.ts` /
`lib/anthropic.ts` / `lib/render/email.ts`.

> Read `CLAUDE.md` first — it is the source of truth for the segment-based A/B model, the
> `GenBrief` schema, the markdown conventions, and the invariants. **Do not regress any invariant
> or security guardrail listed there.** Prompt changes go in `lib/briefgen.ts` only; email-HTML
> changes go in `lib/render/*`. Run `npx tsc --noEmit` then `npm run build` before every commit.

---

## 0. How to read this document

The plan has three layers:

1. **Part A — Problem audit.** Every defect, with concrete evidence quoted from the actual
   output, and the root cause traced to a file/function. This is the "why".
2. **Part B — Phased fixes.** Phase 1 is incremental, surgical, low-risk (ship in days). Phase 2 is
   the deeper re-architecture of the generation flow. Phase 3+ are the new feature tracks
   (win-template learning, creativity engine, designer-ready output, feedback loop).
3. **Part C — Reference appendix.** The voice gap quantified, a "winning-pattern" spec mined from
   the `.eml` files, and the full test/QA checklist.

Each fix is tagged `[P1]`, `[P2]`, etc. and carries an **Acceptance criteria** block. Treat those
as the definition of done.

---

# PART A — PROBLEM AUDIT (evidence-based)

The audit is grounded in two artifacts:

- **The tool output:** `GentsLux_brief_Wed24Jun26.xls` — Option A sheet and Option B sheet.
- **The human winners:** `Source/WinEmailTemps/Gentslux 8 Apr 2026.eml`,
  `Source/WinEmailTemps/BraGoddess 19 Apr 2026.eml`, and siblings.

## A1. The two AI versions (A & B) are near-duplicates

**Evidence.** Both options resolve to the *same campaign idea*:

| Surface | Option A | Option B |
|---|---|---|
| Core angle | "Your tops deserve a bottom half" (wardrobe completion) | "Bottoms deal to finish your top rotation" (wardrobe completion) |
| Hero product | IcyShorts | IcyShorts |
| Mechanism | ice silk cooling, quick-dry 4× faster | ice silk cooling, quick-dry 4× faster |
| Offer line | 70% O.F.F · Free Shipping $40+ | 70% O.F.F · Free Shipping 💲40+ |
| Product grid | same 6 products, same order | same 6 products, same order |
| Opener (SEG 71) | "You have the tops handled…" | "you've already got a consistent tops rotation…" |

The only real differences are surface wording and the persona sign-off (B prepends "Jordan here —").
This violates `CLAUDE.md`'s own rule that "B is forced to a different angle + framework than A."

**Root cause.** Two compounding issues in the engine:

1. **`contrastInstruction()` (`lib/briefgen.ts:1517`)** tells the model to pick a different
   angle/framework/route, but the *layered* path (`lib/anthropic.ts`, foundation A → foundation B)
   builds Option B's foundation seeded from Option A's, so it converges. The hero product and
   product grid are passed in identically, so both options anchor on IcyShorts.
2. **`briefContrastIssues()` (`lib/briefgen.ts:2201`)** only checks *string equality* of
   `angle` and `framework`. A model can rename the angle ("wardrobe completion" → "bottom-half
   offer") and pass the check while producing the same email. There is no check on **hero product
   divergence, opener mechanic, product-set, or offer framing**.

## A2. No creativity / formulaic sameness

**Evidence.** Every paragraph in both options is the same shape: *situation line → "IcyShorts
are built on ice silk cooling fabric… quick-dry 4× faster…" → Frank D. quote → price line →
product list with prices*. The mechanism phrase "quick-dry 4× faster" appears **8+ times** across
the brief. There is no story, no scene, no surprise, no emotional turn — just a feature spec
repeated per segment.

Contrast with the human winner (`Gentslux 8 Apr 2026.eml`): it opens with a *playful conceit*
("It's April, so I'm calling it a birthday month for everyone — no candles required"), tells a
*single* product story, and never repeats the offer more than once.

**Root cause.** The prompt rewards mechanism + proof + offer density (see the route definitions
`lib/briefgen.ts:1001-1090` and the body rule at `:1466` "product-name markdown link by paragraph
2"). There is no concept-diversity pressure: no rotation memory across sends, no "pick a creative
device" step, no anti-repetition scoring. The route picker is largely deterministic per brand, so
successive sends look identical too.

## A3. Body copy is too salesy

**Evidence.** Look at SEG 72 (Option A):

> "…now 💲18.98 with 70% O.F.F + Free Shipping 💲40+." then a bulleted product list where **every
> single line repeats the price and "Free Shipping $40+"**:
> `JettJeans — … · $32.99 · Free Shipping $40+ · "Comfortable all day." — Terry D.`
> `MeshIrons — … · $24.99 · Free Shipping $40+ · …` (×5 more)

The offer is stated in the opener, in the hero bridge, on every product line, and again in the P.S.
That is a "command stack / price wall," exactly what the human emails avoid — the BraGoddess winner
mentions the discount **once** and spends the rest of the email on a friend's story ("My best
friend Shirley (she's 62)…").

**Root cause.** `validateBrief` *does* have a "sounds too salesy / hard-sell command" flag
(`lib/briefgen.ts:2036-2038`) but it is a **warn**, not an **error**, and it only scans for command
verbs — it does not detect *offer repetition* (the same price/shipping string repeated N times).
The product-grid rule explicitly asks for "visible price anchor on every slot"
(`body.base` ZONE 3, and `:2111`), which manufactures the price wall.

## A4. The brief/script is almost unusable for a designer

**Evidence.** The exported "Body | Base" cell contains raw engineering scaffolding:

> `LAYOUT & PLACEMENT PLAN — segment copy generated separately.`
> `[ZONE 1 — OPENER BLOCK] … injected here by seg_71 / seg_72 / seg_73 calls.`
> `[ZONE 3 — PRODUCT GRID] … rendered as headline_winner template rows … resolves SERIOUS QA
> flags on Products 2–6.`

A designer reading the brief sees internal terms (`seg_71`, `headline_winner`, "SERIOUS QA flags",
"ESP renderer"). The subject-line cells leak provider labels too:

> `Option 1 (Claude strategic — named mechanism + wardrobe completion frame): …`
> `Option 2 (Gemini curiosity — …): …`  `Option 3 (ChatGPT direct-response — …): …`

The image guidance is abstract design-speak ("deep navy #002850–#1d3d56 gradient", "macro flat-lay
… subtle flex ripple to cue stretch") with no relationship to how the *winning* templates actually
look (story header + single hero lifestyle shot + persona sign-off, per the `.eml` files).

**Root cause.**
- `foundationBodyBase()` (`lib/anthropic.ts:791`) + `foundationOutputSchema` (`:766`) instruct the
  model to put a "layout/placement plan" into `body.base`, and the Excel exporter dumps `body.base`
  verbatim. The scaffolding is an *internal* generation artifact that should never reach the
  deliverable.
- The subject schema carries `model_hint: "Claude strategic" | "Gemini curiosity" | "ChatGPT
  direct-response"` (`lib/briefgen.ts:1539`, `lib/anthropic.ts:874`) and the exporter renders the
  hint into the option label. These are internal A/B/C provenance tags, not customer-facing copy.

## A5. Data-integrity / offer-math holes

**Evidence.** Product 3 ArcticMove is listed at **`$4.00`** ("💲4 | 70% O.F.F") sitting next to
products at $24.99–$32.99. Either the source price is wrong or the discount math is inconsistent,
and the tool passes it straight through with an image note ("Price $4.00 must be clearly visible…
to close SERIOUS QA flag"). There is no plausibility check.

Separately, **Option A uses raw `$` ("$18.98", "$32.99")** while **Option B correctly uses `💲`**.
`CLAUDE.md` mandates `$` → `💲` in promo copy. The substitution is only a *prompt instruction*
(`lib/briefgen.ts:1456`) plus a validation flag — there is no deterministic sanitizer, so Option
A's foundation simply didn't comply.

**Root cause.** Promo-symbol masking and price sanity are advisory (prompt + warn), not enforced by
a deterministic post-processor over the emitted JSON.

## A6. Subject/preheader quality

**Evidence.** Generated subjects: "{{first_name}}, your tops deserve a bottom half" /
"{{first_name}}, these fit different — here's why". Functional, but flat. The human winners that
actually got sent: "🎂 Not your b-day? Who cares! Grab 70% SAVING quick, son.nln!" and
"1 sec… son.nln, haven't grabbed your 80% o.f.f yet? 🧐" — curiosity, emoji, pattern-interrupt,
personality. Also: three sub-options per subject are emitted with provider labels (see A4), which
clutters the deliverable.

**Root cause.** Subject style guidance (`lib/briefgen.ts:180-192`, `lib/anthropic.ts:612-621`) is
mechanism/offer-anchored and omits the pattern-interrupt / emoji / playful-curiosity register the
brand actually wins with. No emoji budget, no "open loop" device library.

## A7. Over-stuffing products

**Evidence.** Both options render a 6-product grid. The winning `.eml` emails feature **one** hero
product with a story; supporting products are minimal or absent. The grid wall dilutes the hero and
amplifies the price-repetition problem (A3).

**Root cause.** Product count is driven by UI slot selection with a soft cap of 6 (`CLAUDE.md`
invariant) and no "editorial focus" mode that subordinates or drops support products in the copy.

---

# PART B — PHASED FIX PLAN

Phasing: **Phase 1** = surgical, ship-fast quality fixes (no architecture change). **Phase 2** =
re-architect the generation flow for genuine A/B divergence and creativity. **Phase 3** = the four
enrichment tracks (win-template learning, creativity engine, designer-ready output, feedback loop).
Phases 1 and 2 are separated by a clean seam: Phase 1 changes prompts, validation, and a new
deterministic post-processor; Phase 2 changes how foundations/segments are orchestrated.

---

## PHASE 1 — Surgical quality fixes (low risk, high visible gain)

### [P1-1] Stop leaking internal scaffolding into the deliverable
**Problem:** A4. `body.base` placement plan, `seg_71`, "SERIOUS QA flags", `headline_winner`, and
provider `model_hint` labels appear in the exported brief.

**Do:**
1. Add a **presentation layer** between `GenBrief` and the exporters. Create
   `lib/present/cleanBrief.ts` exporting `toDeliverableBrief(brief: GenBrief): DeliverableBrief`.
   It strips/translates every internal token before export:
   - Remove `body.base` from the deliverable entirely **or** replace it with a short, human
     "Layout summary" written in plain language (no `ZONE`, no `seg_*`, no "QA flag", no
     "renderer"). Recommended: drop the raw `body.base` and synthesize a 2–3 sentence layout note.
   - Map subject `options[].model_hint` ("Claude strategic"/"Gemini curiosity"/"ChatGPT
     direct-response") → neutral labels `A / B / C` (or remove the parenthetical entirely).
   - Strip any line matching `/seg_\d|SERIOUS|QA flag|headline_winner|ESP renderer|generated
     (separately|later)|injected here|patch call/i` from all emitted copy fields.
2. Route **both** exporters through it: `lib/exportExcel.ts` (`exportBriefsToExcel`) and
   `app/components/BriefView.tsx` (`briefToMarkdown`).
3. Keep the raw `GenBrief` for the in-app review/debug view behind a dev/admin toggle only.

**Files:** new `lib/present/cleanBrief.ts`; edit `lib/exportExcel.ts`, `app/components/BriefView.tsx`.
**Acceptance:**
- Re-export the same campaign; grep the `.xls`/markdown for `ZONE`, `seg_`, `SERIOUS`,
  `headline_winner`, `Claude strategic`, `Gemini`, `ChatGPT` → **zero matches**.
- The "Body" section reads as human copy + an optional plain-English layout note.

### [P1-2] Deterministic promo-symbol + offer sanitizer
**Problem:** A5. `$`→`💲` and `off`→`o.f.f` are advisory, so Option A shipped raw `$`.

**Do:** Add `lib/present/sanitizeCopy.ts` with a pure function applied to **every** customer-facing
string field of the brief (subjects, preheaders, banner text, body per segment, product
main/sub/badge/usps, P.S.):
- Replace `$` with `💲` in promo/price context (keep `{{merge_tags}}` and URLs untouched).
- Normalize discount word to the brand's configured form (`o.f.f` / `O.F.F` / `SAVING`) per
  `lib/config/brands.ts`.
- De-spam against `SPAM_WORDS` (`lib/briefgen.ts`) by applying the approved substitutions.
- Idempotent (running twice changes nothing). Unit-test this.

Apply the sanitizer in the generation pipeline (after parse, before validation) so the in-app
preview, SendGrid push, and export are all consistent — not only at export time.

**Files:** new `lib/present/sanitizeCopy.ts`; call site in `lib/anthropic.ts` `generateOptions`
after each option is parsed; add `tests/sanitizeCopy.test.ts`.
**Acceptance:** No raw `$` (outside merge tags/URLs) in either option for any brand; running the
sanitizer twice is a no-op; existing tests + `npx tsc --noEmit` + `npm run build` pass.

### [P1-3] Kill offer repetition (de-salesy pass)
**Problem:** A3. Price/shipping repeated on every product line and in every paragraph.

**Do:**
1. **Prompt rule (`lib/briefgen.ts`):** change the body contract (around `:1466`) so the offer
   (price + shipping) is stated **at most twice** in body copy: once at the hero reveal, once in the
   P.S. Support-product lines name the product + one differentiator, **not** the price and not
   "Free Shipping" on every row. Move per-product price to the *product-image overlay spec* (image
   copy), where it belongs, not the body prose.
2. **Validation (`lib/briefgen.ts` `validateBrief`):** upgrade the salesy heuristic to count
   *offer-token repetition*. Add an **error** (not warn) when the same price string or
   "free shipping" phrase appears more than `MAX_OFFER_MENTIONS` (default 2) in a segment body.
   Add a warn when discount-% appears >3× total in the body.
3. Feed the new flag into the existing repair pass (`AI_QUALITY_REPAIR`) so it self-corrects.

**Files:** `lib/briefgen.ts` (prompt text + `validateBrief` + the repair-eligible regex at `:1738`).
**Acceptance:** For the GentsLux test campaign, each segment body mentions the price ≤2× and "free
shipping" ≤1×; support products carry a differentiator, not a price wall; salesy flag clears.

### [P1-4] Price/offer sanity validation
**Problem:** A5. ArcticMove `$4.00` passed through unquestioned.

**Do:** In `validateBrief` (or a new `validateProductData` in `lib/briefgen.ts`), flag any product
whose price is an outlier vs. the campaign set (e.g. < 25% of the median, or < a configurable
floor). Emit a **warn** surfaced in the Pre-flight panel: "Product price 💲4.00 looks implausible —
confirm source data." Do **not** auto-edit prices (source-of-truth is the catalog), just surface it.

**Files:** `lib/briefgen.ts`; surface in `app/components/PreflightPanel.tsx`.
**Acceptance:** ArcticMove at $4.00 raises a visible pre-flight warning; normal price spreads do not.

### [P1-5] A/B contrast validation at the *idea* level
**Problem:** A1. Contrast check is string-equality on angle/framework only.

**Do:** Extend `briefContrastIssues()` (`lib/briefgen.ts:2201`) to compare **structural** signals,
not just names:
- **Hero product:** if both options lead with the same hero product *and* same opener mechanic →
  error "A/B share hero + opener; force divergence."
- **Opener n-gram overlap:** compute trigram Jaccard similarity between A and B segment openers;
  error if > 0.6.
- **Offer framing & banner headline family** already partially checked — keep.
- **Product-set / order:** warn if identical ordering and identical emphasis.

Wire these as **hard** contrast errors that trigger the existing Option-B contrast retry
(`AI_TEMP_B_RETRY`) before returning. (Phase 2 makes the *generation* actually diverge; this phase
makes the *gate* honest.)

**Files:** `lib/briefgen.ts` (`briefContrastIssues`, `validateBriefPair`), retry wiring in
`lib/anthropic.ts`.
**Acceptance:** Two options that share hero+opener+offer (like the current sample) fail the pair
check and trigger a retry; genuinely divergent options pass.

### [P1-6] Subject-line register upgrade
**Problem:** A6. Subjects are flat/mechanism-led; winners use curiosity + emoji + pattern interrupt.

**Do:** In `lib/briefgen.ts` subject guidance (`:180-192`) and `lib/anthropic.ts` (`:612-621`):
- Add a **device library** the model must rotate through: open-loop/curiosity, pattern interrupt,
  playful conceit, social proof tease, deadline whisper, "1 sec…" check-in. (Mine exact patterns
  from `Source/WinEmailTemps` — see C2.)
- Add a per-brand **emoji budget** (0–1 leading emoji where on-brand; GentsLux/BraGoddess yes,
  SantaFare sparing) sourced from `lib/config/brands.ts`.
- Require the 3 sub-options to use *different devices*, not three phrasings of the same line.

**Files:** `lib/briefgen.ts`, `lib/anthropic.ts`, `lib/config/brands.ts` (add `emojiPolicy`,
`subjectDevices` to the brand config).
**Acceptance:** For one campaign, the 3 subject options use 3 distinct devices; at least one
option uses a curiosity/pattern-interrupt frame; emoji usage respects brand policy.

### [P1-7] Editorial-focus mode (tame the product grid)
**Problem:** A7. 6-product grid dilutes the hero.

**Do:** Add a campaign option `bodyFocus: "hero" | "grid"` (default `hero`). In `hero` mode the
**body copy** features the hero product as a story and references support products as a single
compact "rest of the collection" line (no per-product paragraphs). The product *image grid* can
still render all slots (that's a layout decision in `lib/render/email.ts`), but the prose stops
trying to sell all six. This directly de-salesifies (A3) and sharpens contrast (A1).

**Files:** `lib/config/types.ts` (`Campaign.bodyFocus`), `lib/briefgen.ts` (body prompt),
`app/page.tsx` (wizard toggle).
**Acceptance:** In `hero` mode, support products get ≤1 combined sentence in body; hero gets the
narrative; grid images unaffected.

**Phase 1 exit criteria:** Regenerate the GentsLux sample. The deliverable has no internal tokens,
consistent 💲 symbols, ≤2 offer mentions per body, a flagged implausible price, A/B that fail the
old "twins" test, livelier subjects, and a hero-focused body. Ship it.

---

## PHASE 2 — Re-architect the generation flow for real divergence + creativity

The Phase-1 gates make bad output *fail*; Phase 2 makes good, divergent output *happen* by design.

### [P2-1] Concept-selection step before copy
Introduce an explicit, cheap **"concept" pass** that runs *before* foundations. For each option it
chooses, from libraries, a tuple: `{ angle, framework, creative_device, hero_product, format }`.
- Option B's concept is generated with a **hard constraint to differ on ≥3 of the 5 axes** from
  Option A's concept (not a soft prompt clause). Pick deterministically in code when the model
  returns a colliding tuple (e.g. rotate hero_product to the next-best catalog item, swap framework
  family).
- Persist the chosen concepts on the brief (`creative_direction`) and show them in review.

**Files:** new `lib/concept.ts`; integrate in `lib/anthropic.ts` before `foundation*`; types in
`lib/briefgen.ts`.
**Acceptance:** A and B differ on ≥3 axes by construction; the concept tuple is visible in the
review step.

### [P2-2] Decouple Option B's foundation from Option A's
Today B's foundation is seeded from A and converges. Generate B's foundation **from B's concept**,
not from A's foundation. Keep `AI_AB_FAST_PARALLEL` off (per `CLAUDE.md`) but ensure the only thing
B "sees" from A is the *anti-collision* constraint, not A's content.

**Files:** `lib/anthropic.ts` (foundation A/B builders ~`:830`).
**Acceptance:** B foundation references B's hero/angle/device; no copied phrasing from A.

### [P2-3] Anti-repetition memory across sends
Persist the last N sends' `{angle, framework, device, hero_product}` per brand (reuse Supabase
`saved_versions` / add a small `send_concepts` table). At concept-selection time, **down-rank**
recently used tuples so successive weekly sends rotate. This fixes "every send looks the same," not
just A vs B.

**Files:** `supabase/migrations/0003_send_concepts.sql`, `lib/history.ts`, `lib/concept.ts`.
**Acceptance:** Generating 3 campaigns in a row for one brand yields 3 different angle/device
combinations.

### [P2-4] Creativity scoring + targeted creative repair
Add a `creativityScore` to validation that penalizes: mechanism-phrase repetition, template-shaped
paragraphs, absence of a concrete scene/story, generic openers ("You have the tops handled…"). When
below threshold, run one **creative** repair pass (distinct from the compliance repair) that asks
for a scene/story rewrite while preserving facts and offer.

**Files:** `lib/briefgen.ts` (scoring), `lib/anthropic.ts` (repair branch), env
`AI_CREATIVE_REPAIR_THRESHOLD`.
**Acceptance:** The current formulaic sample scores low and is rewritten with a concrete opening
scene; facts/offer preserved.

---

## PHASE 3 — Enrichment tracks (all four requested)

### Track 1 — Win-template learning  `[P3-W]`
Turn the human winners into machine-usable guidance the generator must follow.

**Do:**
1. **Extract corpus.** Script `agents/analytics/extract_win_corpus.py` that parses
   `Source/WinEmailTemps/*.eml` (sent winners) and `Source/FailedEmailTemps/*.eml` (losers) into
   structured JSON: subject, preheader, body text, persona, opener device, offer-mention count,
   word count, product count, emoji use. Also pull copy from the 4 `*Email Content.xlsx` libraries
   (text only — they are 40–330 MB with embedded images; read the sheet XML, skip media).
2. **Synthesize a pattern spec** per brand: `lib/config/winPatterns.ts` (or JSON in
   `docs/win-patterns/`) capturing what winners do that losers don't (see appendix C2 for the
   GentsLux/BraGoddess findings already extracted). Include: target word count band, max offer
   mentions, opener devices that won, persona-voice exemplars (2–3 verbatim opener lines).
3. **Feed into the prompt** as few-shot exemplars + hard constraints (word band, offer-mention cap),
   derived from config — never hard-code brand logic in the prompt (per `CLAUDE.md`).
4. **Win/lose contrast doc** in `docs/` for human reference.

**Acceptance:** Generated body word-count and offer-mention count fall inside the brand's
winner band; at least one winner-style opener device is used; spec is config-driven.

### Track 2 — Creativity / variety engine  `[P3-C]`
This is Phase 2's concept/rotation work, productized:
- A **"Surprise me" / variety slider** in the wizard (low = safe/on-brand, high = bolder devices).
- A visible **"Concept" card** per option in review (angle · framework · device · hero) so the
  marketer sees *why* A and B differ.
- **Regenerate-this-option** that re-rolls one option's concept while keeping the other.

**Files:** `app/page.tsx`, `app/components/BriefView.tsx`, `lib/concept.ts`.
**Acceptance:** Marketer can dial variety, see concept cards, and re-roll one option independently.

### Track 3 — Designer-ready output  `[P3-D]`
Make the brief directly usable by a designer or an image model.
1. **Structured image spec** per product/banner: a typed object (`subject`, `composition`,
   `background`, `lighting`, `overlay_text`, `aspect_ratio`, `must_include`, `must_avoid`) instead
   of a prose blob — rendered cleanly in export and optionally as a ready-to-paste **image-gen
   prompt** (one per image).
2. **Reference the winning visual structure** (story header → single hero lifestyle shot → persona
   sign-off) from Track 1, not abstract studio specs disconnected from what ships.
3. Optional: integrate an image-gen step (there is an `imagegen` user-skill pattern referenced in
   the environment) to produce mock hero images attached to the brief.
4. Clean Excel export: one tab "Copy" (customer-facing only), one tab "Design brief" (image specs),
   one tab "Build notes" (the internal stuff, clearly separated) — instead of mixing all three.

**Files:** `lib/briefgen.ts` (image-spec schema in `GenBrief.products[].image_spec`),
`lib/exportExcel.ts`, `lib/present/cleanBrief.ts`.
**Acceptance:** Export has separated Copy/Design/Build tabs; each image has a structured spec and a
copy-pasteable prompt; no internal jargon in Copy/Design tabs.

### Track 4 — Feedback & performance loop  `[P3-F]`
Close the loop so the tool learns from results.
1. **Capture outcomes.** Add a `send_results` table (open rate, CTR, revenue, send date, the
   concept tuple used). Let the marketer log results, or import the `Page performance *.csv` files
   already in `Source/`.
2. **Score & surface.** A dashboard (reuse the `data:build-dashboard` skill or the existing
   `Source/rmkt_email_dashboard.html` as a model) showing which angles/devices/personas win per
   brand.
3. **Feed back.** Promote winning concept tuples in `lib/concept.ts` ranking; demote losers. This is
   the payoff of Tracks 1+2 — the rotation library becomes performance-weighted.
4. **Self-eval harness.** Extend `lib/quality/eval.ts` with a regression set of "good vs bad"
   examples so prompt changes can be scored automatically before deploy.

**Files:** `supabase/migrations/0004_send_results.sql`, `lib/history.ts`, new dashboard,
`lib/concept.ts`, `lib/quality/eval.ts`.
**Acceptance:** Results can be logged/imported; dashboard ranks devices by performance; concept
ranking consumes the performance weights; eval harness runs in CI.

---

# PART C — REFERENCE APPENDIX

## C1. Root-cause → file map (quick index for the agent)

| Problem | Primary file(s) | Symbol |
|---|---|---|
| A1 A/B twins | `lib/anthropic.ts`, `lib/briefgen.ts` | foundation A/B, `briefContrastIssues:2201`, `contrastInstruction:1517` |
| A2 no creativity | `lib/briefgen.ts` | route defs `:1001-1090`, body rule `:1466` |
| A3 too salesy | `lib/briefgen.ts` | `validateBrief:2036`, product rule `:2111` |
| A4 scaffolding leak | `lib/anthropic.ts`, exporters | `foundationBodyBase:791`, `foundationOutputSchema:766`, `model_hint:1539` |
| A5 price/symbol | `lib/briefgen.ts` | `$`→`💲` rule `:1456` (advisory only) |
| A6 subjects | `lib/briefgen.ts`, `lib/anthropic.ts` | subject guidance `:180-192`, `:612-621` |
| A7 product stuffing | `lib/render/email.ts`, `app/page.tsx` | product layout, slot selection |

## C2. The voice gap, quantified (mined from the .eml winners)

**Human winner — GentsLux 8 Apr 2026:**
- Opener is a *playful conceit*: "It's April, so I'm calling it a birthday month for everyone — no
  candles required."
- ~150 words, **one** product story, offer stated **once** ("up to 70% SAVING sitewide, plus
  freeship over 💲40. No code. No exclusions."), warm persona sign-off "— Jordan".
- Subject: "🎂 Not your b-day? Who cares! Grab 70% SAVING quick, son.nln!" (emoji + pattern
  interrupt + name).

**Human winner — BraGoddess 19 Apr 2026:**
- Leads with empathy + transformation: "We've traded the heels for comfort… now it's time to trade
  those 'back-bulges' and red marks for a smooth silhouette."
- Tells a **named friend story** ("My best friend Shirley (she's 62)…") with a verbatim quote.
- Offer mentioned **once**; emotional payoff "You've earned this freedom."
- Subject: "1 sec… son.nln, haven't grabbed your 80% o.f.f yet? 🧐" (curiosity check-in + emoji).

**Tool output (for contrast):** mechanism-led, offer repeated 5–8×, 6-product price wall, no scene,
no story, internal scaffolding visible. → This gap is the north star for the prompt/few-shot work in
Tracks 1–2.

**Winner pattern spec (starting values — refine via the extraction script in Track 1):**

| Signal | Winner band | Current tool |
|---|---|---|
| Body word count | ~120–170 | ~180–230, segmented |
| Offer mentions in body | 1 | 5–8 |
| Products featured in prose | 1 (hero) | 6 |
| Opener type | conceit / empathy / story | situation→feature |
| Emoji in subject | usually 1 | 0 |
| Persona warmth | high (first person, named) | low ("Jordan here —" then spec) |

## C3. Test & QA checklist (run before any commit; high-stakes work → spawn a verifier subagent)

1. `npx tsc --noEmit` and `npm run build` both clean (stop `npm run dev` first — see `CLAUDE.md`).
2. New unit tests pass: `sanitizeCopy` idempotency, offer-mention counter, contrast-similarity,
   price-outlier detector.
3. **Golden regen:** regenerate the exact GentsLux 3-seg/6-product campaign and diff the deliverable
   against the Phase-1 exit criteria checklist (no internal tokens; consistent 💲; ≤2 offer
   mentions; price warning; divergent A/B; emoji-bearing subject; hero-focused body).
4. **A/B divergence metric:** opener trigram Jaccard(A,B) < 0.6 and hero/framework differ.
5. **No invariant regressions:** segments ⊆ brand segments; hero locked to slot 0; subject 42–58
   (≤60); `{{first_name}}` in subject XOR preheader; merge tags emitted literally; ≤6 products.
6. **Security:** no new `NEXT_PUBLIC` secret; paid/admin routes still guarded; preview iframe still
   `sandbox=""`.
7. Manual read-through of one brief per brand by a human before sign-off.

## C4. Suggested execution order (dependency-aware)

```
P1-1 ─┐
P1-2 ─┤ (independent, do first; pure post-processing + presentation)
P1-4 ─┘
P1-3 ── depends on validation refactor (do alongside P1-5)
P1-5 ─┐
P1-6 ─┤ prompt/validation; can parallelize
P1-7 ─┘
  ↓  (Phase-1 exit: regen golden sample, ship)
P2-1 → P2-2 → P2-3 → P2-4   (concept layer is the spine of Phase 2)
  ↓
Track 1 (win corpus) → feeds Track 2 (variety) & Track 3 (design)
Track 4 (feedback loop) → re-weights Track 2's rotation library
```

## C5. Notes / gotchas for the implementing agent

- **Do not deploy.** You are a contributor agent: push a branch + open a PR. Only the owner deploys
  (`CLAUDE.md` → Deploy). Do not touch `vercel.json` or add deploy CI.
- The 4 `*Email Content.xlsx` files are huge (40–330 MB) with embedded images — when mining them,
  unzip and read only `xl/sharedStrings.xml` + sheet XML; never load the media. Prefer streaming.
- Keep all brand/segment/product logic in `lib/config/*` and reference it; never duplicate it inside
  prompt strings (hard `CLAUDE.md` rule).
- Prompt schema and the `GenBrief` TS type must stay in sync whenever you add a field
  (e.g. `image_spec`, concept tuple).
- Phase 1 should not change the public API shape of `app/api/generate-copy` (still returns
  `{ a, b }`); the presentation layer is applied inside, and the cleaned brief is what exporters
  consume.

