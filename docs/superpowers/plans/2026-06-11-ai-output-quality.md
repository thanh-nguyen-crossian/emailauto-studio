# AI Output Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the four named output-quality problems: generic/similar cross-segment copy, missed playbook violations, weak A/B contrast, and weak subjects/hooks.

**Architecture:** All prompt changes in `lib/briefgen.ts`. All generation/contrast changes in `lib/anthropic.ts`. Render fixes in `lib/render/email.ts` and `lib/render/markdown.ts`. Type changes in `lib/config/types.ts` and `lib/config/brands.ts`. No new files. Each batch passes `tsc --noEmit` + `npm run build` before commit.

**Tech Stack:** Next.js 15, TypeScript, `@anthropic-ai/sdk`, Tailwind CSS v4, Supabase.

---

## Batch 1 — Prompt Surgery

### Task 1.1: Replace vague "differ by four" A/B rule with structural prohibition

**Files:** `lib/briefgen.ts` — `CREATIVE_PROMPT_LAYER` (~line 904)

- [ ] **Replace** the existing `A/B options must differ by at least four:` sentence in `CREATIVE_PROMPT_LAYER` with:

```ts
const CREATIVE_PROMPT_LAYER = `Guardrails are constraints, not a script. Let the model write fresh language.
A and B are STRUCTURALLY DIFFERENT emails — not synonym swaps. They must differ in ALL of: angle, framework, opener mechanic, body opening sentence, banner headline family, and product-grid pattern. Changing only wording, tone, or surface phrasing while keeping the same paragraph structure IS NOT a valid A/B contrast. If Option A opens with a named micro-story, Option B must not. If Option A uses PAS, Option B must use a different framework. State the structural differences in creative_direction BEFORE writing any copy.
Rotate opener mechanics: story, fact, question, occasion, re-engagement, insider reveal, or direct problem. Avoid repeating the last-send structure.
Segment versions keep one hook but adapt motivation: loyal = recognition/first access; at-risk = proof/friction removal; new = quick education/next product; lapsed = low-risk return reason; high-return-risk = fit/material clarity.
Multi-segment body copy must not be cloned paragraph skeletons. Change the first sentence, proof/risk reducer, product bridge, and final line for every segment.`;
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.2: Fix segment body direction lines with reader-position anchors and negative constraint

**Files:** `lib/briefgen.ts` — `segmentBodyDirectionLines()` (~line 765)

- [ ] Replace the return line inside `segmentBodyDirectionLines` with:

```ts
return `• body.${segJsonKey(id)} (${id} ${label}${meta ? ` — ${meta}` : ""}): audience motive: ${guidance} Entry point for THIS segment: ${move.directive} Do NOT start with the same first 8 words as any other segment body in this option — the opener must name a situation specific to this segment's motive ("${guidance || label}"), not a generic pain. Soft-sell mode: ${softSell}`;
```

- [ ] Also append a reader-position mandate at the end of `segmentBodyMandate` in `buildUserPrompt`, after the `segmentBodyDirectionLines(campaign)` call:

```ts
const segmentBodyMandate = campaign.segments.length > 1
  ? `\nSEGMENT BODY DIFFERENTIATION — required:
Keep one Hook Contract across all segments, but body text must be meaningfully different by segment. Do not rewrite the same paragraph skeleton with different nouns.
${segmentBodyDirectionLines(campaign)}
For every segment body, change all four: first sentence entry point, proof/risk reducer, product bridge sentence, and final sign-off/CTA sentence.
Reader-position rule: each segment must anchor the reader at a DIFFERENT position in their brand relationship. Loyal/high-freq segments: reader is in the middle of a use moment. At-risk/lapsed segments: reader who has not engaged — open with the gap before the product. New/browse segments: reader who is uncertain — open with a product truth before any social proof. Never let two segments begin from the same reader position.`
  : "";
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.3: Elevate subject/preheader to a priority section in COMPONENT_PROMPT_LAYER

**Files:** `lib/briefgen.ts` — `COMPONENT_PROMPT_LAYER` (~line 910)

- [ ] Replace `COMPONENT_PROMPT_LAYER` with:

```ts
const COMPONENT_PROMPT_LAYER = `SUBJECT / PREHEADER — write these FIRST, before body copy:
For EVERY segment write 3 paired options with distinct style lenses (strategic/curiosity/direct-response). Each pair MUST: (1) subject 42-60 chars, preheader 60-90 chars — count characters literally; (2) preheader introduces a NEW beat not in the subject (different proof, deadline, product angle, or emotion — not a paraphrase); (3) no two options share the same opening verb or emotional frame; (4) include an offer signal (price, %, o.f.f, 💲, or shipping cue) in every subject; (5) {{first_name}} in subject OR preheader, not both. Write subjects before body — subjects inform the hook, not the reverse.
Body: 120-150 words per segment, persona-signed, selected opener in 2-3 sentences, product-name markdown link by paragraph 2, 2-4 bold/accent/link beats, P.S. 10-15 words. Tone is personal-note first: product fit before promo, one calm urgency beat, no hard-sell command stack.
Banner: main_text_1 must be a tension or hook statement (not a discount headline). main_text_2 must name the product mechanism or proof (not a brand tagline). main_text_3 resolves with the offer or CTA. The banner tells a 3-beat story: tension → proof → resolution. If all three lines follow the same discount-headline pattern, rewrite. main_text_1/2/3 and sub_text_1/2/3 each use distinct angles; image_guidance is 4-6 compact bullets covering first 200px, product, offer, palette, crop, CTA path.
Products: 4-6 products, even count preferred; SantaFare defaults to 4. main_text <=5 words, CTA 2-4 words plain text, USPs <=5 words. HTML product modules use linked images only, so product text/CTA should be written as text to bake into each image.
${PRODUCT_IMAGE_BRIEF_RULES}`;
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.4: Make body architecture a literal paragraph-order constraint in creativeRoutePrompt

**Files:** `lib/briefgen.ts` — `creativeRoutePrompt()` (~line 708)

- [ ] Replace the last line of the template string returned by `creativeRoutePrompt`:

```ts
// Old:
Write creative_direction.branch="${route.branch}", creative_direction.brief_route="${route.route}", and creative_direction.source_pattern="${route.sourcePattern}". This route is a hard A/B separation control, not a decorative label.`;

// New:
The body architecture "${route.bodyArchitecture}" is a LITERAL paragraph order, not a suggestion. The first paragraph executes stage 1, the second paragraph stage 2 — do not invert or collapse stages.
Write creative_direction.branch="${route.branch}", creative_direction.brief_route="${route.route}", and creative_direction.source_pattern="${route.sourcePattern}". Deviating from this body architecture is INVALID.`;
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.5: Operationalise "one promise" rule and add shared-thread definition to CORE_PROMPT_LAYER

**Files:** `lib/briefgen.ts` — `CORE_PROMPT_LAYER` (~line 897)

- [ ] Append to `CORE_PROMPT_LAYER` (inside the template string, after the existing "One send = one promise" sentence):

```
The shared thread is: ONE hero product by name + ONE specific proof or price figure + ONE concrete reader situation. All seven copy surfaces (subject, preheader, banner, body, product lead, CTA, P.S.) must reference at least two of these three elements. A thread tied only by brand name or discount percentage is NOT a shared thread.
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.6: Fix B variety seed so A and B get different opener mechanics and arcs

**Files:** `lib/briefgen.ts` — `buildUserPrompt()` (~line 1055)

The `variety` object passed to `buildUserPrompt` is the same object for both A and B — so both get identical opener mechanic, arc, pain, sensory phrase.

- [ ] In `buildUserPrompt`, add a shifted-seed variety derivation for Option B:

```ts
// Replace the existing variety cast at the top of buildUserPrompt:
const variety = campaign.bodyVariety as (BodyVarietyProfile & { _openerDirective?: string; _arcDirective?: string }) | undefined;

// After it, add:
// For Option B, shift the variety profile so the opener mechanic and arc diverge from A.
// We re-derive by shifting key array indices rather than recomputing the full seed.
let effectiveVariety = variety;
if (isB && variety) {
  const lastMechanic = variety.openerMechanic;
  const lastArc = variety.emotionalArc;
  const availMechanics = OPENER_MECHANICS.filter((m) => m.key !== lastMechanic);
  const availArcs = EMOTIONAL_ARCS.filter((a) => a.key !== lastArc);
  const seed2 = hashSeed([campaign.brandId, campaign.sendDate, campaign.theme, "_B"].join("::"));
  const banks = VARIETY_BANKS[campaign.brandId] || VARIETY_BANKS.bra_goddess;
  const persona = BRANDS[campaign.brandId]?.persona || "Sandra";
  const mechB = availMechanics[seed2 % availMechanics.length];
  const arcB = availArcs[(seed2 >> 5) % availArcs.length];
  const charB = banks.characters[(seed2 >> 3) % banks.characters.length];
  const painB = banks.painPoints[(seed2 >> 7) % banks.painPoints.length];
  const sensoryB = banks.sensoryPhrases[(seed2 >> 11) % banks.sensoryPhrases.length];
  effectiveVariety = {
    ...variety,
    openerMechanic: mechB.key,
    openerMechanicLabel: mechB.label,
    namedCharacter: charB.name,
    characterRole: charB.role,
    painPoint: painB,
    sensoryPhrase: sensoryB,
    emotionalArc: arcB.key,
    emotionalArcLabel: arcB.label,
    _openerDirective: mechB.directive(charB.name, charB.role, painB, persona),
    _arcDirective: arcB.directive,
  } as typeof variety;
}
```

- [ ] Replace all references to `variety` inside `buildUserPrompt`'s variety mandate block with `effectiveVariety`.
- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.7: Fix creative route offset so CD/GH/KL routes are reachable as Option B

**Files:** `lib/briefgen.ts` — `selectCreativeRoute()` (~line 700)

Currently B uses `offset = 2 + (seed % 4)` on a 6-item bank — always picks even-index routes, making routes at indices 1, 3, 5 (CD, GH, KL) unreachable.

- [ ] Replace lines 700-706 with:

```ts
function selectCreativeRoute(campaign: Campaign, isOptionB: boolean): CreativeRouteProfile {
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
    campaign.lastSend?.angle || "",
  ].join("::"));
  const aIndex = seed % CREATIVE_ROUTE_BANK.length;
  if (!isOptionB) return CREATIVE_ROUTE_BANK[aIndex];
  // Always pick an odd offset so B always lands on the opposite parity from A,
  // guaranteeing all 6 routes are reachable and no two consecutive sends share a route pair.
  const half = Math.floor(CREATIVE_ROUTE_BANK.length / 2);
  const oddOffset = ((seed % half) * 2) + 1;
  return CREATIVE_ROUTE_BANK[(aIndex + oddOffset) % CREATIVE_ROUTE_BANK.length];
}
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 1.8: Add opener fallback when bodyVariety is absent + add arc-to-route compatibility filter

**Files:** `lib/briefgen.ts` — `buildUserPrompt()` and `selectVarietyProfile()`

- [ ] In `buildUserPrompt`, after the `effectiveVariety` block, add fallback:

```ts
const openerFallback = !effectiveVariety
  ? `\nOPENER MECHANIC — required: choose one opener from: story (named person discovers a solution to their specific pain), fact (one concrete product truth), question (natural question about reader's pain answered by sentence 2), direct_problem (name the pain in sentence 1), occasion (tie pain to a named moment), re_engagement (acknowledge the gap — no apology), or insider_reveal (exclusive early access framing). Do NOT open with a gratitude statement, bullet list, "Meet X", or "Introducing X". Record your choice in quality_checks.opener_mechanic.`
  : "";
```

- [ ] Include `openerFallback` in the `renderPromptLayers` call within `buildUserPrompt`.

- [ ] In `selectVarietyProfile()`, after the arc selection, add compatibility filter:

```ts
// Arc-to-route compatibility: block arcs that conflict with the selected route's framework.
const routeForA = selectCreativeRoute(campaign, false);
const incompatibleArcs: Partial<Record<string, BodyVarietyProfile["emotionalArc"][]>> = {
  "BAB": ["gratitude_surprise"],
  "Short Sale": ["curiosity_reveal"],
  "Suspended Loop": ["pain_relief"],
};
const frameworkKey = routeForA.frameworkBias.split(" ")[0];
const blockedArcs = incompatibleArcs[frameworkKey] || [];
const compatibleArcs = availableArcs.filter((a) => !blockedArcs.includes(a.key));
const arc = (compatibleArcs.length ? compatibleArcs : availableArcs)[(seed >> 5) % (compatibleArcs.length || availableArcs.length)];
```

(Replace the existing `const arc = availableArcs[...]` line.)

- [ ] Run `npx tsc --noEmit` then `npm run build` — expect clean.
- [ ] `git add lib/briefgen.ts && git commit -m "feat(prompt): structural A/B prohibition, segment reader-position anchors, subject elevation, B variety seed shift, route offset fix"`

---

## Batch 2 — Validation Hardening

### Task 2.1: Add offer signal check on primary subjects

**Files:** `lib/briefgen.ts` — `validateBrief()`, inside `Object.entries(sl).forEach` loop (~line 1180)

- [ ] After the existing `first_name` pair check and before the `similarity` check, add:

```ts
if (s && !hasOfferSignal(s + " " + (p || ""), campaign)) {
  addFlag(brief, "warn", `${seg} subject/preheader missing offer signal — include price, %, o.f.f, 💲, or shipping cue`);
}
```

- [ ] Add `subject\/preheader missing offer signal` to `SERIOUS_FLAG` regex (it's a playbook hard requirement):

```ts
// In SERIOUS_FLAG, append to the pattern:
|subject\/preheader missing offer signal
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 2.2: Add preheader "new beat" check

**Files:** `lib/briefgen.ts` — `validateBrief()`, same `Object.entries(sl).forEach` loop

- [ ] After the offer signal check, add:

```ts
if (s && p) {
  const subjectSigWords = new Set(significantWords(s));
  const preheaderNewWords = significantWords(p).filter((w) => !subjectSigWords.has(w));
  if (preheaderNewWords.length < 2) {
    addFlag(brief, "warn", `${seg} preheader adds no new beat beyond the subject — add deadline, proof, or tension the subject omitted`);
  }
}
```

- [ ] Add `preheader adds no new beat` to `STRUCTURAL_FLAG` regex.
- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 2.3: Add {{first_name}} in body check + body.base presence check

**Files:** `lib/briefgen.ts` — `validateBrief()`, inside `Object.entries(body).forEach` loop

- [ ] After the word-count and offer-signal body checks, add:

```ts
if (/{{\s*first_name\s*}}/i.test(String(text || ""))) {
  addFlag(brief, "warn", `${seg} body contains {{first_name}} — personalisation token belongs in subject or preheader only`);
}
```

- [ ] Also add `body contains \{\{first_name\}\}` to `SERIOUS_FLAG` regex.

- [ ] Before the `Object.entries(body).forEach` loop, add body.base check:

```ts
if (!body.base || wordCount(String(body.base)) < 30) {
  addFlag(brief, "error", "Missing required field: body.base (fallback body must be present and non-trivial)");
}
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 2.4: Add hook_contract hero_product validation against slot-0

**Files:** `lib/briefgen.ts` — `validateBrief()`, after hook contract field loop (~line 1245)

- [ ] After the `(["segment_insight", "emotion", ...]).forEach` hook contract check, add:

```ts
if (hc.hero_product && products[0]?.name && !containsSignificantReference(hc.hero_product, products[0].name) && !containsSignificantReference(products[0].name, hc.hero_product)) {
  addFlag(brief, "warn", `Hook contract hero_product "${hc.hero_product.slice(0, 40)}" does not match slot-0 product "${products[0].name.slice(0, 40)}" — hero lock may be broken`);
}
```

- [ ] Add `hook contract hero_product .* does not match` to `SERIOUS_FLAG` regex.
- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 2.5: Add brand-specific subject minimum length

**Files:** `lib/config/brands.ts` and `lib/briefgen.ts`

- [ ] In `lib/config/brands.ts`, add `subjectMin` to each brand object:
  - BraGoddess: `subjectMin: 45`
  - GentsLux: `subjectMin: 48`
  - LuxFitting: `subjectMin: 44`
  - SantaFare: `subjectMin: 42`

- [ ] In `lib/config/types.ts`, add `subjectMin?: number` to the `Brand` type.

- [ ] In `validateBrief()`, find the line `if (s && s.length < 42)` and replace with:

```ts
const subjectMin = BRANDS[campaign.brandId]?.subjectMin || 42;
if (s && s.length < subjectMin) {
  addFlag(brief, "warn", `${seg} subject may be too short for ${campaign.brandId} (${s.length} chars, min ${subjectMin})`);
}
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 2.6: Add option-level subject validation (offer signal, min-length, first_name)

**Files:** `lib/briefgen.ts` — `validateBrief()`, inside `opts.forEach` block (~line 1187)

- [ ] After the existing option preheader length check (end of `opts.forEach`), add:

```ts
if (o.subject && o.subject.length < subjectMin) {
  addFlag(brief, "warn", `${seg} option ${i + 1} subject too short (${o.subject.length} chars, min ${subjectMin})`);
}
if (o.subject && !hasOfferSignal(o.subject + " " + (o.preheader || ""), campaign)) {
  addFlag(brief, "warn", `${seg} option ${i + 1} subject/preheader missing offer signal`);
}
if (o.subject && o.preheader && !/{{\s*first_name\s*}}/i.test(o.subject + " " + o.preheader)) {
  addFlag(brief, "warn", `${seg} option ${i + 1} missing {{first_name}} in subject/preheader pair`);
}
if (o.subject && similarity(o.subject, s) > 0.78) {
  addFlag(brief, "warn", `${seg} option ${i + 1} subject duplicates the primary subject — options must be genuinely distinct variants`);
}
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 2.7: Add opener mechanic mismatch check + banner CTA word count + product sub_text + reactivation guilt

**Files:** `lib/briefgen.ts` — `validateBrief()`

- [ ] After the `PLAYBOOK_REQUIRED_QA.forEach` block, add opener mechanic mismatch:

```ts
const mandatedMechanic = campaign.bodyVariety?.openerMechanicLabel;
const reportedMechanic = (brief.quality_checks as Record<string, string>)?.opener_mechanic || "";
if (mandatedMechanic && reportedMechanic && !reportedMechanic.toLowerCase().includes(mandatedMechanic.toLowerCase())) {
  addFlag(brief, "warn", `Opener mechanic mismatch: brief mandated "${mandatedMechanic}" but quality_checks reports "${reportedMechanic}"`);
}
```

- [ ] After the `banner.cta` WEAK_CTA check, add banner CTA word count:

```ts
if (banner.cta && (wordCount(banner.cta) < 2 || wordCount(banner.cta) > 4)) {
  addFlag(brief, "warn", `Banner CTA should be 2-4 words (got "${banner.cta}")`);
}
```

- [ ] Inside the per-segment body loop, add reactivation guilt check:

```ts
if (/\b(?:we missed you|sorry (?:we|for)|apologi[sz]e|been a while and we)/i.test(String(text || ""))) {
  addFlag(brief, "warn", `${seg} body uses a reactivation guilt/apology opener — acknowledge the gap without apologising`);
}
```

- [ ] Add `reactivation guilt\/apology opener` to `STRUCTURAL_FLAG` regex.

- [ ] Inside the `prods.forEach` loop, after the `main_text` word count checks, add:

```ts
if (!p.sub_text) {
  addFlag(brief, "warn", `Product ${i + 1} sub_text is empty — should carry price, proof, or deadline`);
}
if (p.sub_text && wordCount(p.sub_text) > 12) {
  addFlag(brief, "warn", `Product ${i + 1} sub_text over 12 words — image overlay copy must stay concise`);
}
```

- [ ] Run `npx tsc --noEmit` then `npm run build` — expect clean.
- [ ] `git add lib/briefgen.ts lib/config/brands.ts lib/config/types.ts && git commit -m "feat(validation): offer signal on subjects, preheader new beat, first_name in body, hero_product lock, brand subject mins, option-level checks, opener mismatch, banner CTA, product sub_text"`

---

## Batch 3 — A/B Contrast + Generation Parameters

### Task 3.1: Per-call temperature + move B contrast to user prompt (cache fix)

**Files:** `lib/anthropic.ts`

- [ ] Add `temperature` parameter to `callClaude`, `callGemini`, `callOpenAI` with default 0.65:

```ts
async function callClaude(system: string, user: string, model: string, temperature = 0.65): Promise<string>
async function callGemini(system: string, user: string, model: string, temperature = 0.65): Promise<string>
async function callOpenAI(system: string, user: string, model: string, temperature = 0.65): Promise<string>
```

- [ ] Thread `temperature` through `createText` and `createAndParseWithModel`:

```ts
async function createText(system: string, user: string, selection: AIModelSelection, temperature = 0.65): Promise<string>
async function createAndParseWithModel(system: string, user: string, selection: AIModelSelection, temperature = 0.65): Promise<Record<string, unknown>>
```

- [ ] In `generateOptionsSingle`, when calling Option B's initial generation, pass `temperature: 0.75`:

```ts
// Option A call:
const aPromise = createAndParseWithModel(sysA, usrA, selA); // default 0.65
// Option B call:
const bPromise = createAndParseWithModel(sysBInitial, usrBInitial, selB, 0.75);
```

- [ ] For the contrast retry call, pass `temperature: 0.80`:

```ts
const bRaw = await createAndParseWithModel(sysB, usrBRetry, selB, 0.80);
```

- [ ] Move `OPTION_B_INITIAL_CONTRAST` and `contrastInstruction` from system to user prompt:

```ts
// Remove + OPTION_B_INITIAL_CONTRAST suffix from sysBInitial (keep sysB === sysA)
// Prepend to usrBInitial:
const usrBInitial = OPTION_B_INITIAL_CONTRAST + "\n\n" + usrB;
// For retry, prepend contrast instruction to user message not system:
const usrBRetry = contrastInstruction(a.creative_direction) + "\n\n" + usrB;
// sysBRetry = sysA (identical, will hit cache)
```

- [ ] For the repair call in `repairBriefIfNeeded`, pass `temperature: 0.30` to `createAndParseWithModel`.

- [ ] Add `store: true` to the OpenAI Responses API payload in `callOpenAI` for automatic prefix caching.

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 3.2: Tighten contrast thresholds + add opener-mechanic equality check

**Files:** `lib/briefgen.ts` — `briefContrastIssues()` (~line 1490)

- [ ] Lower body Jaccard threshold from `0.62` to `0.50`:

```ts
// Old:
if (phraseOverlap(aBase, bBase, 5) > 0.62)
// New:
if (phraseOverlap(aBase, bBase, 5) > 0.50)
```

- [ ] After the existing similarity checks, add opener-mechanic equality check:

```ts
if (a.body_variety?.openerMechanic && b.body_variety?.openerMechanic &&
    a.body_variety.openerMechanic === b.body_variety.openerMechanic) {
  issues.push(`A/B options share the same opener mechanic (${a.body_variety.openerMechanic}) — retry B with a different opener`);
}
```

- [ ] Add `same opener mechanic` to the `STRUCTURAL_FLAG` regex so the repair pass can catch it.

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 3.3: Build minimal repair system prompt (10× token reduction)

**Files:** `lib/anthropic.ts` — `repairBriefIfNeeded()` (~line 489)

- [ ] Replace the repair system prompt construction with a minimal version:

```ts
function buildRepairSystem(campaign: Campaign, brand: { name: string; persona: string; voice: string }): string {
  return [
    "You are a strict email-copy editor. Fix ONLY the listed playbook violations in the supplied brief JSON.",
    "Return the COMPLETE corrected brief JSON in the same schema. Keep all valid facts, product URLs, prices, and supplied reviews unchanged.",
    "No prose, no markdown fences. Return valid JSON only.",
    `Brand: ${brand.name}. Persona: ${brand.persona}. Voice: ${brand.voice}.`,
    BRAND_PLAYBOOK_RULES[campaign.brandId] || "",
    CORE_PROMPT_LAYER,
  ].filter(Boolean).join("\n\n");
}
```

- [ ] Import `BRAND_PLAYBOOK_RULES` and `CORE_PROMPT_LAYER` exports from briefgen (or export them), and use `buildRepairSystem(campaign, brand)` instead of `${system}\n\nQUALITY REPAIR MODE:...`.

- [ ] Run `npx tsc --noEmit` then `npm run build` — expect clean.
- [ ] `git add lib/anthropic.ts lib/briefgen.ts && git commit -m "feat(generation): per-call temperature (A=0.65/B=0.75/retry=0.80/repair=0.30), B contrast to user prompt for cache reuse, tighter contrast thresholds, minimal repair system prompt"`

---

## Batch 4 — Render Pipeline + Variety Fixes

### Task 4.1: Add _openerDirective/_arcDirective to BodyVarietyProfile type

**Files:** `lib/config/types.ts` — `BodyVarietyProfile` interface

- [ ] Add the two fields to the interface:

```ts
export interface BodyVarietyProfile {
  openerMechanic: string;
  openerMechanicLabel: string;
  namedCharacter: string;
  characterRole: string;
  painPoint: string;
  sensoryPhrase: string;
  emotionalArc: string;
  emotionalArcLabel: string;
  creativeLens: string;
  proofRole: string;
  subjectStyle: string;
  visualDirection: string;
  // Computed directives — preserved through serialization so history loads get full mandates
  _openerDirective?: string;
  _arcDirective?: string;
}
```

- [ ] Remove the `as BodyVarietyProfile & { _openerDirective?: string; _arcDirective?: string }` casts in `lib/briefgen.ts` (they're now unnecessary).

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 4.2: Fix cross-brand character/phrase collisions in VARIETY_BANKS + add namedCharacter rotation

**Files:** `lib/briefgen.ts` — `VARIETY_BANKS` and `lib/config/types.ts`

- [ ] In `VARIETY_BANKS.lux_fitting.characters`, rename:
  - `"Michelle"` → `"Rachel"`
  - `"Diane"` → `"Joanne"`

- [ ] In `VARIETY_BANKS.lux_fitting.sensoryPhrases`, replace:
  - `"moves with you, not against you"` → `"follows every move without bunching"`

- [ ] In `lib/config/types.ts`, add `namedCharacter?: string` to the `lastSend` sub-type of `Campaign`.

- [ ] In `selectVarietyProfile()`, add character rotation (analogous to opener mechanic rotation):

```ts
const lastChar = campaign.lastSend?.namedCharacter;
const availableChars = banks.characters.filter((c) => c.name !== lastChar);
const char = (availableChars.length ? availableChars : banks.characters)[(seed >> 3) % (availableChars.length || banks.characters.length)];
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 4.3: Fix segment key case-insensitive fallback in render/email.ts

**Files:** `lib/render/email.ts` — `renderEmailHTML()` (~line 289)

- [ ] Replace the body + subject key lookups with case-tolerant versions:

```ts
// Body lookup:
const rawKey = segJsonKey(segment);
const bodyText =
  brief.body?.[rawKey] ??
  brief.body?.[segment] ??
  brief.body?.[rawKey.toLowerCase()] ??
  brief.body?.base ?? "";

// Subject lookup (find the subject_lines entry):
const subjectEntry =
  brief.subject_lines?.[rawKey] ??
  brief.subject_lines?.[segment] ??
  brief.subject_lines?.[rawKey.toLowerCase()];
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 4.4: Fix escapeHtml ordering in parseInlineMarkdown

**Files:** `lib/render/markdown.ts` — `parseInlineMarkdown()` (~line 36)

The current code runs `escapeHtml(input)` before the `==accent==` regex substitution. This double-encodes `&` inside accent spans (e.g. `==Bras & Sets==` → `Bras &amp; Sets` in the span instead of `Bras & Sets`).

- [ ] Restructure `parseInlineMarkdown` to escape only plain-text segments, not the full input:

```ts
export function parseInlineMarkdown(input: string): string {
  if (!input) return "";
  // Process markdown spans first (on raw text), then escape remaining plain-text runs.
  let result = input;
  // 1. Accent spans: ==text== → <strong class="accent">text</strong>
  result = result.replace(/==([^=]+)==/g, (_, t) => accentSpan(escapeHtml(t)));
  // 2. Bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${escapeHtml(t)}</strong>`);
  // 3. Italic: *text*
  result = result.replace(/\*([^*]+)\*/g, (_, t) => `<em>${escapeHtml(t)}</em>`);
  // 4. Underline: __text__
  result = result.replace(/__([^_]+)__/g, (_, t) => `<span style="text-decoration:underline">${escapeHtml(t)}</span>`);
  // 5. Links: [text](slug:x) and [text](home)
  result = result.replace(/\[([^\]]+)\]\(slug:([a-z0-9_-]+)\)/gi, (_, label, slug) => buildUrl(escapeHtml(label), slug));
  result = result.replace(/\[([^\]]+)\]\(home\)/gi, (_, label) => buildUrl(escapeHtml(label), "home"));
  // 6. Escape remaining plain-text (anything not inside a tag)
  // Split on HTML tags and escape only non-tag segments.
  return result.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => tag || escapeHtml(text));
}
```

- [ ] Run `npx tsc --noEmit` — expect clean.

### Task 4.5: Guard splitForScannability from running on banner text

**Files:** `lib/render/markdown.ts` — `paragraphsToHtml()` and `lib/render/email.ts` — `bannerCaptionBlock()`

- [ ] Add an optional `noSplit` parameter to `paragraphsToHtml`:

```ts
export function paragraphsToHtml(text: string, noSplit = false): string {
  const paras = noSplit
    ? [text.trim()]
    : splitForScannability(text.trim());
  return paras.filter(Boolean).map((p) => `<div ...>${parseInlineMarkdown(p)}</div>`).join("");
}
```

- [ ] In `bannerCaptionBlock()` (or wherever banner text is rendered via `paragraphsToHtml`), pass `true` for `noSplit`.

- [ ] Run `npx tsc --noEmit` then `npm run build` — expect clean.
- [ ] `git add lib/briefgen.ts lib/config/types.ts lib/render/email.ts lib/render/markdown.ts && git commit -m "feat(variety+render): BodyVarietyProfile directive fields, character rotation, cross-brand collision fixes, segment key case fallback, escapeHtml ordering fix, banner split guard"`

---

## Verification

- [ ] Run `npm run dev`
- [ ] Generate a BraGoddess campaign (3 segments, 4 products) — check A vs B: different openers, different arcs, different routes
- [ ] Generate a GentsLux campaign (2 segments) — check subject offer signals, preheader new beats, preflight score
- [ ] Confirm preflight panel shows tier labels and that the new flags (offer signal, new beat, hero_product) appear when violated
- [ ] `git push origin main`
