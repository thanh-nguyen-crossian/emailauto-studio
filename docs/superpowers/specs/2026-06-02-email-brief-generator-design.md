# Email Brief Generator — Design Spec
**Date:** 2026-06-02  
**Status:** Approved  
**Author:** Son Nguyen + Claude Sonnet 4.6

---

## Overview

A standalone HTML tool (`docs/email-brief-generator.html`) that generates complete email campaign briefs/scripts for 4 brands (BraGoddess, GentsLux, LuxFitting, SantaFare). Users fill a 6-step guided wizard, the tool calls an AI model (Claude / Gemini / OpenAI) and returns 2 fully-formed creative options, then exports to Excel in the exact format of the existing `Source/[Brand] Email Content.xlsx` sheets.

**Primary users:** Email marketing team members sharing the file via Google Drive or Git. No installation required.

---

## Goals

- Replace manual brief-writing with a guided, AI-assisted workflow
- Produce output that matches existing Excel brief format exactly (designers receive same format they already know)
- Generate 2 genuinely contrasting creative options per send (different angle + framework) with creative direction stated explicitly
- Support all 4 brands with segment-aware copy and product-aware USPs/reviews
- Work for all teammates — open in any browser, no server, no build step

---

## Out of Scope

- Scheduling or sending emails
- Image generation or asset management
- Analytics / performance tracking
- SantaFare briefs before Nov 2026 (campaigns paused — tool warns, does not block)

---

## Architecture

### File
`docs/email-brief-generator.html` — single standalone HTML file, ~1,800–2,200 lines.

### Dependencies (CDN, no install)
| Library | Purpose |
|---|---|
| SheetJS `xlsx.full.min.js` | Excel export |
| Google Fonts: Plus Jakarta Sans + JetBrains Mono | Matches playbook styling |

### State
All state lives in `localStorage`:
- API keys (one per provider) — stored in `sessionStorage`, cleared on tab close
- Last wizard inputs per brand — restored on return visit for same brand
- Generated brief drafts — keyed by `{brand}-{date}`

### Page Layout
```
┌─────────────────────────────────────────────────────┐
│  Header: "Email Brief Generator"                    │
│  [Model: Claude Sonnet ▾] [API Key ••••] [Save]    │
│  Language toggle: [EN] [VI]                         │
├─────────────────────────────────────────────────────┤
│  WIZARD CARDS (Steps 1–6, collapsible)              │
│  Each card: header (step + status) + body (inputs)  │
│  Completed cards collapse to one-line summary        │
│  [Edit] on any completed card re-opens it           │
├─────────────────────────────────────────────────────┤
│  OUTPUT PANEL (appears after generation)            │
│  ≥1100px: Side-by-side columns Option A | Option B  │
│  <1100px: Tabs Option A / Option B                  │
│  [📋 Copy full Option A] [📋 Copy full Option B]   │
│  [⬇ Export to Excel] [🔄 Regenerate]               │
└─────────────────────────────────────────────────────┘
```

---

## Wizard Step Flow

### Step 1 — Brand · Date · Theme · Language
| Input | Type | Notes |
|---|---|---|
| Brand | Radio pills: BraGoddess / GentsLux / LuxFitting / SantaFare | Drives segment list + product catalog |
| Send date | Date picker | Auto-computes day name (e.g. "Wednesday, Jun 11 2026") |
| Campaign theme | Text | e.g. "Summer Flash Sale", "Thank You — 70% OFF" |
| Output language | Toggle EN / VI | EN = English copy; VI = Theme/designer notes in Vietnamese. Default: VI for Theme row, EN for all copy |

**SantaFare warning:** If brand = SantaFare AND send date < 2026-11-01, show: *"SantaFare campaigns are paused through Oct 2026 — are you sure?"* (warning only, not a block).

Collapsed summary: `BraGoddess · Wed Jun 11 2026 · "Summer Flash Sale"`

---

### Step 2 — Promo & Urgency
**First visit:** inputs appear one by one (guided mode).  
**Return visit (same brand, wizard previously completed):** all 3 inputs shown simultaneously with last-used values pre-filled. `[Use guided mode]` link restores step-by-step.

| # | Question | Type |
|---|---|---|
| 1 | Offer type | Radio: Sitewide % OFF / Fixed price point / Free shipping threshold / No promo |
| 2 | Offer value | Text: e.g. "70% OFF" or "$12.99" *(hidden if No promo)* |
| 3 | Urgency window | Radio: 24 hrs (ends midnight) / 48 hrs / Weekend only / No urgency |

Collapsed summary: `70% OFF sitewide · 24 hrs (ends midnight)`

---

### Step 3 — Products (8 slots)
- Brand-filtered product catalog loads from `PRODUCT_CATALOG` const
- 2-up grid of 8 slots; Slot 1 = Hero (starred)
- Each slot: product name dropdown + `[Change]` + `[+ Custom URL]`
- Custom URL: fetch attempt on blur (async, with loading indicator per slot)
  - Success → scraped USPs populate below slot
  - CORS blocked / fetch error → "Could not scrape — enter USPs manually" + 3 text inputs appear
- Return visit: slots pre-filled from last saved draft for this brand

Collapsed summary: `Daisy Bra (hero) · SonaShape · Posy Bra · Activa Bra · ZipLacy · ZenaLift · IvyLift · HoneyCurve`

---

### Step 4 — Segments *(skippable)*
Pre-checked checkboxes per brand:

| Brand | Segments |
|---|---|
| BraGoddess | ✅ 21 Bralettes/Comfort · ✅ 22 Contour/Push-Up · ✅ 45 Shapers/Panties · ✅ 8 Sleepwear/Tights · ✅ 3 Strapless/Special-Occasion |
| GentsLux | ✅ 71 Men's Tops · ✅ 72 Men's Bottoms · ✅ 73 Men's Others |
| LuxFitting | ✅ 61 Women's Tops · ✅ 62 Women's Bottoms · ✅ 63 Women's Dresses · ✅ 64 Women's Others |
| SantaFare | Segment 1 (Personalized Gifts) with tiers: ✅ 1-A Active <90d · ✅ 1-B Drifting 90-180d · ✅ 1-C Lapsed >180d · ✅ 1-D VIP 2+ orders |

`[Skip — use all]` advances without unchecking anything.

Collapsed summary: `Segments: 21 · 22 · 45 · 8 · 3 (all)`

---

### Step 5 — Last Send Context *(optional)*
| Input | Type |
|---|---|
| Last send CTR | Number %, e.g. 0.84 |
| Last hero product | Text |
| Last angle used | Dropdown: Pain-First / Desire-First / Occasion / Social Proof / Mechanism / Identity / Unknown |
| Note | Text, e.g. "3rd consecutive Customer Reviews arc" |

`[Skip this step]` always visible. If skipped, AI generates without fatigue context.

Collapsed summary: `Last CTR 0.84% · Hero: Daisy Bra · Angle: Pain-First`

---

### Step 6 — Generate
Shows a pre-flight summary card:
```
Brand:      BraGoddess
Date:       Wed Jun 11 2026
Theme:      Summer Flash Sale
Promo:      70% OFF sitewide · 24 hrs
Products:   Daisy Bra (hero) + 7 support
Segments:   21 · 22 · 45 · 8 · 3
Last send:  CTR 0.84% · Pain-First · Daisy Bra
Est. output: ~5,200 tokens (2 calls)
```

Token estimate shown. If estimated output > 4,000 tokens per call, yellow warning: *"Consider reducing segments or products for faster generation."*

`[✨ Generate Brief]` triggers generation.

---

## AI Generation Architecture

### Two Parallel API Calls
- **Call 1 (Option A):** Full brief — creative direction + all copy sections
- **Call 2 (Option B):** Full brief — system prompt explicitly states Option A's angle and framework and requires different choices on both dimensions

Both calls fire simultaneously (Promise.all). Total wall-clock time = time for the slower of the two calls.

### Progress Display
Replaces spinner with step-by-step status, updated by streaming response parser:
```
Option A: Subject lines ✅ · Theme ✅ · Banner ⏳ · Body ○ · Products ○
Option B: Subject lines ✅ · Theme ✅ · Banner ✅ · Body ⏳ · Products ○
```

### System Prompt Structure
```
[BRAND IDENTITY] — persona, voice, accent color, layout type
[TIER/SEGMENT PSYCHOLOGY] — per-segment mindset, pricing framing, tone
[PRODUCT CONTEXT] — each product's USPs and top review
[PLAYBOOK RULES] — dos/don'ts from email-campaign-playbook.html
[OUTPUT SCHEMA] — exact JSON schema with field-level constraints (see below)
[CONTRAST INSTRUCTION] — Option B only: "Option A used angle={X}, framework={Y}. You MUST choose a different angle AND a different framework."
```

### Output JSON Schema
```json
{
  "creative_direction": {
    "angle": "Pain-First|Desire-First|Occasion|Social-Proof|Mechanism|Identity",
    "framework": "PAS|BAB|4U|Social-Proof+CTA|3-Reasons-Why",
    "flow": "One sentence describing the copy journey banner→body→CTA",
    "differentiator": "What makes this option distinct from the other"
  },
  "subject_lines": {
    "seg_21": { "subject": "≤50 chars", "preheader": "60-90 chars" },
    "seg_22": { "subject": "...", "preheader": "..." }
  },
  "theme": "Designer visual brief (language per toggle)",
  "banner": {
    "main_text": "...", "sub_text": "...",
    "image_guidance": "...", "review_quote": "...", "cta": "..."
  },
  "body": {
    "base": "Full persona-signed body copy",
    "seg_21": "Segment 21 variant",
    "seg_22": "Segment 22 variant"
  },
  "products": [
    {
      "slot": 1, "name": "Daisy Bra",
      "main_text": "CAPS HEADLINE",
      "sub_text": "Product descriptor",
      "popup_badge": "BESTSELLER|LOW STOCK|98% LOVED|...",
      "usps": ["USP 1", "USP 2"],
      "review": "Quote — Name",
      "cta": "GET DAISY BRA"
    }
  ]
}
```

### Post-Parse Validation
Run after JSON.parse before rendering:
| Check | Action |
|---|---|
| Subject line ≤50 chars | Flag in red inline |
| Preheader 60–90 chars | Flag if out of range |
| Spam trigger words | Flag and list offending words |
| Segment count matches selected | Error if mismatch |
| Option B angle ≠ Option A angle | Auto-retry Option B call once if equal |

### Provider Abstraction Layer
Same prompt text, thin adapter per provider:

| Provider | Adapter |
|---|---|
| Claude | `{ model, system: systemPrompt, messages: [{role:"user", content: userPrompt}] }` → `https://api.anthropic.com/v1/messages` |
| Gemini | `{ contents: [{role:"user", parts:[{text: systemPrompt + "\n\n" + userPrompt}]}] }` → `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| OpenAI | `{ model, messages: [{role:"system", content: systemPrompt}, {role:"user", content: userPrompt}] }` → `https://api.openai.com/v1/chat/completions` |

### Supported Models
| Provider | Models |
|---|---|
| Claude | claude-sonnet-4-6 (default), claude-opus-4-8, claude-haiku-4-5 |
| Gemini | gemini-2.0-flash, gemini-2.5-pro |
| OpenAI | gpt-4o, gpt-4o-mini |

---

## Output Format

### On-Screen Rendering (per option)
```
CREATIVE DIRECTION
  Angle:     Pain-First
  Framework: PAS (Problem → Agitate → Solution)
  Flow:      Hook pain in banner → validate in body → product as escape → urgency CTA
  Differentiator: "Before/after visual contrast; body opens with cost of inaction"
  [📋 Copy section]

SUBJECT LINES & PREHEADERS
  Seg 21: Subject / Preheader
  ...
  [📋 Copy section]

THEME (visual brief)          [📋 Copy section]
BANNER                        [📋 Copy section]
BODY COPY (base + all segs)   [📋 Copy section]
PRODUCT BLOCKS (2-up grid)    [📋 Copy section]
  Product 1 | Product 2
  Product 3 | Product 4
  ...

[📋 Copy full Option A brief]  [⬇ Export to Excel]  [🔄 Regenerate]

──────────────────────────────────────────────────────
REFINE THIS BRIEF
┌────────────────────────────────────────────────────┐
│ Describe your changes...                           │
│ e.g. "Make subject lines more urgent"              │
│      "Rewrite seg 22 body — shorter, no P.S."      │
│      "Change banner headline to focus on price"    │
│      "Swap Option B angle to Social Proof"         │
└────────────────────────────────────────────────────┘
Scope: ● Both options  ○ Option A only  ○ Option B only
[✨ Apply Changes]
```

`[🔄 Regenerate]` passes a `seed_hint` string in the prompt to force genuine variation.

### Iterative Refinement Loop

After the initial generation, a **Refine** panel appears below the output. It allows the user to describe targeted changes in plain language and re-run generation without re-filling the wizard.

**Scope selector:**
- **Both options** — same change instruction applied to both calls; each option re-generates independently so they still diverge
- **Option A only / Option B only** — only that call re-fires; the other option is preserved as-is

**How the refinement call works:**

The follow-up prompt sends:
1. The full existing brief JSON for the targeted option(s) as `[CURRENT BRIEF]`
2. The user's plain-language change description as `[REQUESTED CHANGES]`
3. The instruction: *"Return the full brief JSON with ONLY the sections affected by the requested changes updated. All other sections must be returned verbatim from [CURRENT BRIEF]."*

This minimises re-generation cost — if the user only asks to change subject lines, only `subject_lines` is rewritten; body, banner, and products come back unchanged.

**Revision history:**

Each time `[Apply Changes]` is clicked, the previous output is pushed to a revision stack (max 5 deep). A `[↩ Undo last change]` button appears after the first refinement. Revision stack is stored in memory only (not persisted to localStorage).

**Change description examples shown as placeholder hints:**
- `"Make subject lines more urgent for seg 45"`
- `"Shorten the body copy — max 3 paragraphs"`
- `"Replace P.S. with a scarcity line about low stock"`
- `"Rewrite banner headline to focus on the price point"`
- `"Switch Option B angle to Social Proof"`
- `"Add a before/after image guidance note to the banner"`

---

## Excel Export

### Sheet Name
Format: `{emoji}{Brand}_{DayDate}` — e.g. `⭐BraGoddess_Wed11Jun26`  
Emoji drawn from tested-safe SheetJS set: ⭐ ✅ 🦆 🌸 🧤 🌀 🐏 🦆  
Plain-name fallback toggle: `BraGoddess_Wed11Jun26` (no emoji)

### Row Mapping (matches existing sheets exactly)
| Row label | Content |
|---|---|
| Subject {seg} | Subject line per segment |
| PreHeader {seg} | Preheader per segment |
| Theme | Visual brief |
| Banner | Full banner copy block |
| Body | All body copy (base + segment variants inline) |
| Ảnh sản phẩm | Product layout note |
| Product 1–8 | Alternating product row + CTA row |

Two sheets created per export: one for Option A, one for Option B. Sheet names suffixed `_A` and `_B`.

---

## Product Catalog Structure

Lives at top of file in a clearly marked const block:

```javascript
// ─────────────────────────────────────────────────
// PRODUCT_CATALOG — update here when products change
// ─────────────────────────────────────────────────
const PRODUCT_CATALOG = {
  BraGoddess: [
    {
      name: "Daisy Bra",
      slug: "daisy-bra",
      url: "https://bragoddess.com/products/daisy-bra",
      usps: ["Easy snap front closure", "Wire-free lift", "Breathable fabric"],
      review: "Forgot it's there! — Helen R."
    },
    // ... other BG products
  ],
  GentsLux: [ ... ],
  LuxFitting: [ ... ],
  SantaFare: [ ... ]
};
```

---

## Security & Storage

| Concern | Mitigation |
|---|---|
| API keys | Stored in `sessionStorage` (clears on tab close), never echoed to DOM, never in error messages or console.log |
| Multiple keys | Each provider key stored separately; only the active provider's key is used per call |
| Scraped HTML | Fetched content used only for text extraction (USP/review parsing); never injected as innerHTML |
| Rate limiting | `[🔄 Regenerate]` disabled for 10s after each call to prevent accidental rapid re-firing |

---

## Draft Persistence

On each wizard step completion, the current wizard state is saved to `localStorage` under key `draft_{brand}`. On next visit with same brand selected, Step 3 product slots and Step 2 promo values are pre-filled from this draft. Step 5 last-send context always starts fresh.

---

## Spec Self-Review Checklist
- [x] No TBD or incomplete sections
- [x] Architecture matches feature descriptions
- [x] JSON schema is complete and unambiguous
- [x] SantaFare segment structure is correct (1 segment, 4 tiers)
- [x] Security concerns addressed (sessionStorage, no innerHTML injection)
- [x] Token budget concern addressed (estimate + warning)
- [x] Option A/B contrast mechanism defined (parallel calls + angle diff check + auto-retry)
- [x] Excel format maps to existing sheet structure
- [x] Provider abstraction layer covers all 3 providers
- [x] Language toggle defined (EN/VI)
- [x] Product catalog update path defined
- [x] Iterative refinement loop defined (scope selector, partial-update prompt, revision stack, undo)
