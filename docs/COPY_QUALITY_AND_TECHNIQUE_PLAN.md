# EmailAuto Studio — Copy Quality, Technique Engine & Prompt Compaction Plan

**Audience:** an autonomous coding agent (Codex / Claude Code) working in this repo.
**This is plan #2.** It assumes plan #1 (`docs/QUALITY_OVERHAUL_PLAN.md`) and goes deeper on the
*copywriting* problem the owner still sees: bodies that are product/price recitals with no human
in them. It is grounded in three sources actually read during this audit:

1. **The variety corpus** — `Source/{BraGoddess,GentsLux,LuxFitting,SantaFare} Email Content.xlsx`
   (~1,300 real sends; sheet tab names are the historical subject lines, `sharedStrings.xml` holds
   the body copy).
2. **The dos/don'ts** — `docs/email-campaign-playbook.html` (the "22 Execution Rules" Win/Fail table
   + per-brand prompt templates + STAR analysis).
3. **The engine** — `lib/briefgen.ts` (prompt + validation), `lib/anthropic.ts` (orchestration).

> Hard constraints (do not violate): keep all brand/segment logic in `lib/config/*`; prompt edits
> only in `lib/briefgen.ts`; render edits only in `lib/render/*`; merge tags emitted literally;
> contributor agents **push a branch + PR, never deploy**. Run `npx tsc --noEmit` then `npm run
> build` before each commit. See `CLAUDE.md`.

---

## 0. The core insight (read this first)

The owner asked for bodies that pack in 17 techniques (storytelling, education, FOMO, puns,
questions, emojis, personalization, …). **But the playbook's #1 winning rule is "one send = one
angle; cut any hook with more than one reason to click,"** and its #1 *failure* pattern is
"stacking season + birthday + discount + countdown." The current tool fails the *opposite* way —
it stacks **product + price** on every line.

So the resolution is **not** "cram all 17 techniques into every email." It is a **layered technique
system**:

- **Always-on layer (the texture):** personalization, persona warmth, 1 question, light emoji, power
  verbs, concision, and a value/educational micro-payoff. These are *how* every email reads and do
  not compete for the hook.
- **Rotating lead (the hook):** exactly **one** primary device per send — occasion, story/UGC,
  curiosity gap, fact/data, pain→relief, or honor/VIP. This is the "one angle" the playbook demands,
  and it **rotates every send** (the playbook's explicit anti-fatigue instruction).
- **Seasoning (0–2 per send):** pun/wordplay, FOMO line, numbered list — used only when they serve
  the lead, never stacked.

This reframes the request from "more stuff" to "**one strong human hook, rendered with consistent
warm texture, rotated so it never gets stale**" — which is exactly what the GentsLux winners do
(GentsLux is the only brand with rising CTR: +71% Feb→May, per the playbook STAR summary).

The rest of this plan builds that system, encodes the playbook as the rulebook, mines the corpus
for the technique exemplars, and **compacts** the prompt while doing it.

---

# PART A — WHAT THE CORPUS PROVES (technique → real examples)

Every technique the owner listed already appears in the brands' own winning sends. The generator
should *imitate these patterns*, not invent a clinical style. Evidence (verbatim from the `.xlsx`
libraries and `.eml` winners):

| Technique | Real example from the brands' own emails |
|---|---|
| **Concise / dynamic** | Most winning bodies are **3 short paragraphs + signed sign-off (~60–110 words)** — far shorter than the tool's 180–230. |
| **Personal & warm** | "Hi lovely {{first_name}}", "Hey beauty {{first_name}}", "Hi good-looking {{first_name}}", "Hello, Dapper {{first_name}}!" |
| **Educational content** | GentsLux signs off **every** email with a tip: "#Tip: Did you know most men update their wardrobe every 7 years?", "#QuickTip: for a sharp collar, try a hair straightener", "#HemmingHack: double-sided tape as a temporary hem." |
| **UGC / emotional storytelling** | BraGoddess: "My best friend Shirley (she's 62) used to settle for painful underwires… 'Sandra, I feel 10 years younger.'" LuxFitting: "My friend will jump for joy if I bring her the fourth jumpsuit!" |
| **Pain → benefit** | "designed to prevent sagging, rubbing, chafing, and back pain"; "the wrong shorts make an outfit feel hot, stiff, unfinished." |
| **Data / facts** | High-Five fun facts: "first recorded high five was 1977… releases endorphins… been done in space." "Over 1,126 customers left positive reviews." |
| **FOMO / curiosity** | "🚨UH-oh. Your fav styles are (almost) gone"; "When they're gone, they're gone"; "😱{{first_name}}! And Your Newest Obsessions are…"; mystery boxes "Box A's retro rhythm or Box B's stylish symphony." |
| **Praise / honor / VIP / greed** | "Hello {{first_name}} and October Superstars — because you're special"; "as a token of appreciation"; "You've earned this freedom." |
| **Personalization** | `{{first_name}}` in nearly every subject; segment-aware ("your 4 Sunday items"). |
| **Emojis** | ❤️ 🎅 🔥 🌼 🌟 🎁 😱 🚨 ☀️ 🍂 in subjects and body. |
| **Numbers / lists** | "4 weekend items", "6 bras", "3 holiday must-haves", bulleted fun-fact lists. |
| **Trendy / occasion** | National Radio Day, National Just Because Day, National High Five Day, National Laundry Day, International Tea Day, Earth Day, Best Friends Day — a real "occasion calendar" engine. |
| **Wordplay / puns / idioms** | "tea-riffic", "brew-tiful", "spook-tacular", "monster-sized savings to-day. Just 4 you", "scary good deals", "Grab your savings before it's static" (radio pun). |
| **Actionable / power words** | "Grab", "Discover", "Hurry", "Unlock", "Treat yourself", "Don't miss out." |
| **Funny** | "It's April, so I'm calling it a birthday month for everyone — no candles required." |
| **Questions** | "are you there?", "So you think your bras couldn't be better?", "feeling the holiday shopping brain freeze?" |

**Per-brand voice cheat-sheet (mine deeper via the extraction script in A-T1; starter read below):**

- **GentsLux · Jordan** — dry, confident, *educational sign-off tip every send*; curiosity +
  scarcity subjects; understated. The CTR breakout brand → its template is the north star.
- **BraGoddess · Sandra** — warm best-friend confidante; emotional transformation + a named friend
  story; "lovely/beauty {{first_name}}"; comfort/relief; emotion first, offer second.
- **LuxFitting · Adele** — bright, playful, occasion-led with heavy pun usage ("tea-riffic"); fun
  facts; trend/seasonal.
- **SantaFare · Mary** — gifting concierge; "do the work for you"; suspended-loop/curiosity + reluctant
  deadline; VIP/birthday surprise framing.

---

# PART B — THE TECHNIQUE ENGINE (design)

Goal: make technique a **first-class, config-driven, rotating** part of generation — measurable,
not vibes. Three deliverables: a taxonomy, a per-send selector, and a coverage scorer.

## B1. Technique taxonomy as config  `lib/config/techniques.ts` (new)
Encode the 17 techniques as typed entries, each with: `id`, `layer` (`always_on | lead |
seasoning`), `one_line_rule` (terse, prompt-ready), and 2–3 `exemplars` mined from the corpus.
Example shape:

```ts
export type TechLayer = "always_on" | "lead" | "seasoning";
export interface Technique {
  id: string;            // "occasion", "ugc_story", "edu_tip", "curiosity_gap", ...
  layer: TechLayer;
  rule: string;          // "Open on a real calendar occasion; tie the product to it in 1 line."
  exemplars: string[];   // verbatim-style lines from the corpus, brand-tagged
  brands?: BrandId[];    // optional restriction (e.g. edu_tip strongest for GentsLux)
}
```

**Always-on (texture, ~6):** `personalization`, `persona_warmth`, `one_question`, `emoji_budget`,
`power_verbs`, `concision`, plus `value_payoff` (an educational/useful micro-line — the GentsLux
"#Tip" pattern, generalized per brand).

**Lead (pick exactly 1, rotate every send, ~8):** `occasion`, `ugc_story`, `curiosity_gap`,
`fact_data`, `pain_relief`, `honor_vip`, `fomo_scarcity`, `direct_offer`.

**Seasoning (0–2, only if they serve the lead, ~4):** `pun_wordplay`, `numbered_list`,
`question_hook`, `trend_tiein`.

## B2. Per-send technique selector  `lib/technique.ts` (new) or fold into existing `concept` step
At concept time (the engine already has a concept/route step — `selectCreativeRoute`,
`EMOTIONAL_ARCS`, `CREATIVE_ROUTE_BANK` in `lib/briefgen.ts`), also select a **TechniquePlan**:

```ts
interface TechniquePlan {
  lead: string;                 // one lead technique id
  seasoning: string[];          // 0–2 ids, compatible with lead
  alwaysOn: string[];           // resolved from brand (emoji budget, persona, value payoff on/off)
  occasion?: string;            // resolved from the occasion calendar if lead === "occasion"
}
```

Rules:
- **Option A vs B must use different `lead` techniques** (ties into the existing A/B contrast gate).
- **Across sends**, down-rank recently used `lead` values per brand (rotation memory — plan #1
  P2-3). This operationalizes the playbook's "rotate opener type every send."
- `value_payoff` defaults **on** for GentsLux (its signature), optional elsewhere.
- Emoji budget per brand from `lib/config/brands.ts` (BG/GL/LF: 1 lead emoji ok; SF sparing) and
  capped at the playbook's "≤2 emojis" subject rule.

## B3. Technique-coverage scorer (validation)  `lib/briefgen.ts → validateBrief`
Add a `techniqueScore` + per-technique booleans to `_flags`/`_score`:
- **Required (error if missing):** personalization present; persona sign-off present; exactly one
  clear lead device detectable; ≥1 question OR curiosity beat; concision within brand word band.
- **Rewarded (warn if absent):** value/educational payoff line; ≥1 power verb in CTA; emoji within
  budget; a concrete scene or named-person story when `lead ∈ {ugc_story, occasion}`.
- **Penalized (error/warn):** offer/price repeated > `MAX_OFFER_MENTIONS` (plan #1 P1-3); >1 lead
  device stacked (playbook fail pattern); mechanism phrase repeated >2×.

Feed low scores into the existing repair pass so the model self-corrects toward technique coverage.

**Acceptance (Part B):** Regenerating the GentsLux sample yields a body of ~80–130 words, one lead
device, a Jordan sign-off **with a styling tip**, ≤2 price mentions, 1 question or curiosity beat,
≤1 emoji, and a `techniqueScore` ≥ threshold. A and B use different lead devices.

---

# PART C — PROMPT COMPACTION (do this *with* the technique work, not after)

The static prompt prose in `lib/briefgen.ts` is **~7,200 tokens of backtick literals alone**
(measured), before `anthropic.ts` foundation prompts, the product list, segment context, and the
big route/arc tables (`CREATIVE_ROUTE_BANK`, `EMOTIONAL_ARCS`, per-route prose at ~`:975–1146`).
Much of it is verbose, duplicated across the chained layers, and re-states the playbook in prose.
We can **cut prompt tokens ~35–50%** while *raising* quality by switching from prose to terse,
referenced rules + a small rotating exemplar set.

## C1. Replace prose rules with rule tokens
Convert multi-sentence instructions into compact, scannable directives. Example transform:

*Before* (`COMPONENT_PROMPT_LAYER`, ~70 tokens):
> "SUBJECT / PREHEADER — for every segment write one primary pair plus 3 options. Subject 42-58
> chars (hard cap 60), must carry one offer signal, and {{first_name}} appears in subject OR
> preheader, never both. Preheader 60-90 chars and must add a new proof/deadline/product/tension
> beat."

*After* (~28 tokens):
> `SUBJ: 42–58c (≤60), 1 offer signal, {{first_name}} in subj XOR preheader. PREHDR: 60–90c, new
> beat (proof/deadline/price/tension). +3 alt subjects, distinct devices.`

Apply across `CORE_PROMPT_LAYER`, `CREATIVE_PROMPT_LAYER`, `COMPONENT_PROMPT_LAYER`,
`SENDGRID_HTML_PROMPT_LAYER`, `PERFORMANCE_PROMPT_LAYER`, and the brand-rule blocks.

## C2. One source of truth, referenced not repeated
The playbook rules are currently echoed in several layers + the brand blocks. Encode them **once**
in `lib/config/playbook.ts` (Part D) and have the prompt reference only the rule IDs relevant to the
current step (e.g. `Rules: hook=R1, subject=R2, body=R4/R5, products=R6/R7`). Drop the re-explanation.

## C3. Externalize exemplars; inject only a rotating few
Don't inline long style examples in the prompt. Keep exemplars in `lib/config/techniques.ts` (Part
B1) and inject **only the 2–3 for the selected lead technique + brand**, truncated. This gives the
model concrete, brand-true patterns *cheaply* and changes them per send (variety + compaction).

## C4. Collapse the chained layers for the common path
The layered foundation+patch design sends overlapping instructions per call. For the default path,
build **one compact system prompt** assembled from: `[role+persona] [hook contract] [selected
technique plan + 2 exemplars] [relevant playbook rule IDs] [schema]`. Reserve the verbose chained
prompts for the override/debug path only.

## C5. Token budget + telemetry
Add a dev-only logger that prints assembled prompt token counts per call (`AI_PROMPT_DEBUG=on`).
Targets: **system prompt ≤ ~3,500 tokens** (from ~7k+), **per-segment patch ≤ ~900 tokens**.
Add a unit test asserting the assembled default system prompt stays under budget so it can't
silently regrow.

**Acceptance (Part C):** Measured assembled default system-prompt tokens drop ≥35% vs. current;
output quality scores (Part B) hold or improve on the golden sample; budget test passes.

---

# PART D — PLAYBOOK AS CODE (compliance, single source of truth)

The owner requires output to "respect the dos and don'ts in `email-campaign-playbook.html`." Make
that *enforceable*, not aspirational.

## D1. Encode the 22 rules  `lib/config/playbook.ts` (new)
Transcribe the Win/Fail table into typed rules:

```ts
interface PlaybookRule {
  id: string;            // "R1".."R22"
  name: string;          // "Hook contract"
  scope: "ALL" | BrandId[];
  win: string;           // terse "do"
  fail: string;          // terse "avoid"
  enforce?: "prompt" | "validate" | "both";
}
```

Seed with the high-leverage rules already read from the playbook, e.g.:
- **R1 Hook contract:** lock one promise (segment insight + emotion/curiosity + hero + price/proof +
  urgency + avoid-rule); subjects generated **last** from it. Fail: deal-first, "don't let X go to
  waste," subject the body can't pay off.
- **R2 Subject formula (per brand):** BG emotion+offer (45–55); GL curiosity+scarcity (48–58); LF
  sensory+price (44–56); SF suspended-loop+urgency (42–56); name in subj XOR preheader; ≤2 emojis.
- **R4 Body opener + proof:** 2–3 sentence named micro-story tied to one pain/occasion/moment. Fail:
  bullet/checkmark opener, feature-list, standalone stats, fake metric-bearing reviews.
- **R5 Pain→relief:** every benefit names a concrete pain then the relieving mechanism. Fail: feature
  dump; hyperbole ("10 years younger in 5 minutes"); unsupplied medical claims.
- **R6 Hero lock / R7 product count (4–6, even):** lead with proven heroes; rotate support.
- **R8 Price/shipping/code:** specific price in subject/body/blocks; free-ship threshold once in body.
- **R10 CTA system:** one primary, 2–4 words, verb+object; one inline product link by paragraph 2.
- **R16 Trigger calendar / R18 Segment matching:** occasion priority + segment-specific copy.
- (Carry the rest as `enforce: "prompt"` references; promote to `"validate"` over time.)

## D2. Use it in both places
- **Prompt:** `buildSystemPrompt` pulls the terse `win` lines for the rules in scope (Part C2).
- **Validation:** `validateBrief` checks the machine-checkable ones (subject length/format, name
  XOR, product count/even, price visible, one inline link, ≤2 emoji, offer-repetition, opener type).
  Surface failures in `PreflightPanel` grouped as "Playbook compliance."

## D3. Keep it in sync
Add `docs/playbook-rules.md` generated from `lib/config/playbook.ts` so the human-readable doc and
the code never drift. (Optional: a test that the HTML playbook's rule count == config rule count.)

**Acceptance (Part D):** Pre-flight shows a "Playbook compliance" section; a deliberately
non-compliant draft (deal-first subject, 7 products, price hidden) fails specific rule IDs;
compliant drafts pass.

---

# PART E — VARIETY & ANTI-FATIGUE ENGINE

The playbook's root cause #2 is **body fatigue** from a repeated arc. Build variety as data.

## E1. Occasion calendar  `lib/config/occasions.ts` (new)
A dated list of the "trendy/occasion" hooks the brands actually win with (National Just Because Day,
Tea Day, High Five Day, Earth Day, Best Friends Day, holidays, birthdays, plus evergreen "Just
because Sunday"). Each entry: `date|window`, `name`, `tone`, `brands`, `pun_seeds`. The selector
(B2) prefers an in-window occasion when `lead === "occasion"`. Respect playbook R16 priority
(Birthday > Back-in-Stock > Early Access > seasonal-with-fit > generic) and the "off-theme holiday
pun" fail rule.

## E2. Pun / wordplay bank  (in `techniques.ts` or `occasions.ts`)
Seed from the corpus ("tea-riffic", "brew-tiful", "spook-tacular", "static" radio pun) as *patterns*
("{holiday} + product pun"), not fixed strings. Gate by brand (LF/SF pun-friendly; GL dry/sparse).

## E3. Educational "value payoff" library  `lib/config/valueTips.ts` (new)
Generalize the GentsLux "#Tip" signature into a per-brand pool of useful micro-payoffs (styling,
care, fit, gifting tips; "did you know" facts). The selector appends one when `value_payoff` is on.
This is pure added value — the technique most missing from current output.

## E4. Rotation memory  (plan #1 P2-3; reused here)
Persist `{lead, occasion, pun, value_tip}` per brand per send; down-rank recent picks so successive
weekly sends diverge. This is what stops the "every send looks the same" fatigue at the program
level, not just A vs B.

**Acceptance (Part E):** Generating 4 weekly GentsLux sends in a row yields 4 different lead
devices, 4 different value tips, and (where used) different occasions/puns.

---

# PART F — PHASED EXECUTION

**Phase 1 — copy texture + compaction (fast, high impact).**
- D1 playbook config + D2 validation hooks (machine-checkable rules).
- C1–C3 prompt compaction (rule tokens, single source, externalized exemplars).
- B1 technique taxonomy + B3 always-on coverage checks (personalization, persona sign-off,
  concision band, one question, ≤2 price mentions, value payoff for GL).
- E3 value-tip library (the educational sign-off) — biggest single quality lift.
Exit: regen golden GentsLux sample → short, warm, one tip, ≤2 price mentions, personalized,
playbook-compliant; prompt tokens −35%.

**Phase 2 — technique selection + variety.**
- B2 per-send TechniquePlan selector wired into the concept step; A/B forced to different leads.
- E1 occasion calendar + E2 pun bank.
- C4–C5 collapsed single-prompt path + token budget test.
- B3 full technique scorer + repair integration.
Exit: A/B differ by lead device; occasion/pun used appropriately; scorer gates quality.

**Phase 3 — program-level variety + learning.**
- E4 rotation memory (Supabase) across sends.
- Tie into plan #1 Track 4 feedback loop: weight lead-technique selection by historical CTR per
  brand (GentsLux's winning devices float up).
Exit: successive sends diverge; technique ranking is performance-weighted.

---

# PART G — TEST & QA CHECKLIST
1. `npx tsc --noEmit` + `npm run build` clean (stop `npm run dev` first).
2. New unit tests: technique-coverage scorer; playbook validators (subject len/format, name XOR,
   product count/even, price visible, ≤2 emoji, offer-repetition, opener-type detection); prompt
   token-budget test; occasion-calendar windowing.
3. **Golden regen, all 4 brands:** each body within brand word band; one lead device; persona
   sign-off; ≤2 price mentions; ≥1 question/curiosity beat; value payoff where configured; emoji ≤
   budget; **zero internal scaffolding** (carry plan #1 P1-1).
4. **Variety check:** 4 sequential sends/brand → distinct lead devices + value tips.
5. **A/B check:** different lead techniques; opener trigram Jaccard < 0.6 (plan #1 P1-5).
6. **Playbook compliance:** a deliberately stacked/deal-first draft fails the right rule IDs.
7. **No invariant/security regressions** (segments⊆brand; hero slot 0; merge tags literal; ≤6
   products; no new `NEXT_PUBLIC` secret; iframe `sandbox=""`).
8. High-stakes: spawn a verification subagent to read one generated brief per brand against this
   checklist before sign-off.

---

# PART H — APPENDIX: corpus extraction task (do first in Phase 1)

`agents/analytics/extract_corpus.py` (new): for each `Source/*Email Content.xlsx`, unzip and read
**only** `xl/sharedStrings.xml` (text) and `xl/workbook.xml` (tab names = historical subjects) —
**never** load media (files are 40–330 MB). Emit per brand:
- subject-line list (from tab names) with emoji/length/device tags;
- body paragraphs (filter Vietnamese design-note rows: they contain "Ảnh/ảnh/CTA riêng" etc.);
- the value-tip lines ("#Tip", "#QuickTip", "#Hack", "Did you know", fun-fact bullets);
- occasion mentions (National/International * Day, holidays);
- pun/idiom hits.
Write results to `docs/corpus/<brand>.json`. These feed `techniques.ts`, `occasions.ts`,
`valueTips.ts`, and the few-shot exemplar bank. **This grounds every later step in the brands' own
proven language** instead of invented mechanism copy.

## Notes / gotchas
- The engine already has `CREATIVE_ROUTE_BANK`, `EMOTIONAL_ARCS`, `selectCreativeRoute`, concept
  overlap + opener-mechanic contrast checks (`lib/briefgen.ts`). **Extend these, don't duplicate.**
  Map "lead technique" onto the existing concept/route tuple rather than adding a parallel system.
- BraGoddess historical copy is signed both "Sandra" and "Claire"; SantaFare "Mary" and "Miracle".
  Treat the playbook's canonical personas (Sandra, Jordan, Adele, Mary) as the source of truth via
  `lib/config/brands.ts`; don't learn the wrong sign-off from old rows.
- Don't let "more techniques" override playbook R1 (one hook). The scorer must **penalize stacking**,
  not just reward presence.
- Keep `app/api/generate-copy` returning `{ a, b }`; all of this happens inside generation +
  presentation layers.
