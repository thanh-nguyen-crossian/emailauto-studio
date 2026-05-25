# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**EmailAuto** — a single-file React artifact (`email_template_studio.jsx`) that generates tier-aware, product-aware RMKT email HTML for four brands (BraGoddess, GentsLux, LuxFitting, SantaFare). It runs inside Claude's artifact sandbox; there is no build system, package manager, or server.

## Architecture

### Single-file, no bundler

The entire app lives in one JSX file. Tailwind utility classes are used inline via the artifact runtime. External fonts load from Google Fonts via `<link>` injected in the render. No `npm`, no `vite`, no tests.

### Data config (top of file)

Three static config objects drive everything:

| Object | Purpose |
|---|---|
| `BRANDS` | Per-brand identity: accent color, default layout/signature, `productSegments` map, voice brief, hero image URL |
| `TIER_PSYCHOLOGY` | Per-tier `S–J` mindset, pricing framing, tone, urgency, P.S. hint |
| `PRODUCT_PSYCHOLOGY` | Per product-segment copy guidance keyed by segment ID |

**Never duplicate brand/tier/product logic in copy prompts** — always derive it from these objects.

### Variant key system

A variant is a `tier × productType` pair. The key is `${tier}${productType}` (e.g., `"A21"`). All copy, preview, and export operations are keyed on this string.

```
campaign.tiers = ["A", "B"]
campaign.productTypes = ["21", "22"]
→ variants: A21, A22, B21, B22
```

`getAllVariants(campaign)` returns the full matrix. `generateAllVariants` makes **one Claude API call per tier** (not per variant) to keep prompts mindset-focused.

### HTML generation pipeline

```
renderNarrativeHTML / renderSimpleHTML
  └── htmlShell()          full DOCTYPE wrapper, dark-mode CSS, responsive breakpoints
        ├── heroBlock()    full-width linked banner image
        ├── textBlock()    body copy paragraph (calls paragraphsToHtml → parseInlineMarkdown)
        ├── productRow()   2-up 282px product cells
        └── footerBlock()  unsubscribe / privacy footer
```

`renderEmailHTML(campaign, products, variantCopy)` dispatches to `narrative` or `simple` based on `campaign.layout`.

**Narrative layout** (BraGoddess): hero → intro → row → middle → row → closing+signoff → row → P.S. → footer

**Simple layout** (others): hero → intro → row → row → middle → row → footer

### Markdown conventions in body copy

`parseInlineMarkdown()` converts these before emitting HTML:

| Syntax | Output |
|---|---|
| `[Name](slug:productslug)` | Product link with UTM + `{{paramurl}}` |
| `[text](home)` | Homepage link |
| `==text==` | Brand accent color + bold |
| `**text**` | `<strong>` |
| `*text*` | `<em>` |
| `__text__` | `<u>` |
| `ð²` instead of `$` | Spam filter dodge |

UTM params follow pattern: `?utm_term={slug}&{{paramurl}}` — `{{paramurl}}` is a SendGrid merge tag, never hardcode it.

### Claude API calls

`generateCopyForTier(campaign, products, brand, tier)` POSTs directly to `https://api.anthropic.com/v1/messages`. The response must be strict JSON matching the variant key schema — the parser strips markdown fences before `JSON.parse`. If generation fails for a tier, the whole batch throws.

`suggestProducts(campaign, brand)` also calls the API and returns 6 slugged products. Images are NOT suggested — they must be added manually.

### Storage

Uses `window.storage` (Claude artifact KV API). Draft keys follow `draft:{sendDate}-{brand}-{timestamp}`. The `refreshDrafts()` call uses `window.storage.list("draft:")` prefix scan.

### Stage flow

```
brief → products → copy → preview → export
```

State lives entirely in `EmailTemplateStudio` (parent): `campaign`, `products`, `copy`, `stage`, `activeVariant`. Each stage component receives only what it needs as props — no context, no global store.

## Key invariants

- `campaign.productTypes` must always be a subset of `Object.keys(BRANDS[campaign.brand].productSegments)` — `switchBrand()` resets them.
- Hero image URLs must not contain `"PLACEHOLDER"` to pass the pre-flight check.
- Subject line ≤ 50 chars; preview text 60–90 chars — enforced visually in the Pre-flight panel, not in code.
- The `closing` field is only present in narrative layout; simple layout ends on `middle`.
- Product slugs must be lowercase, no spaces (`/[^a-z0-9_-]/` stripped on input).
