# Release Notes — 2026-06-04

## Highlights

Multi-provider AI model selection, revision/feedback regeneration loop, composable offer fields, enriched GenBrief schema with subject options and structured banner, and full playbook rule integration into the system prompt.

---

## New Features

### Multi-provider AI model selection
Option A and Option B can now each use a different AI provider and model. Supported providers: **Claude** (`claude-sonnet-4-6`, `claude-opus-4-8`, `claude-haiku-4-5`), **Gemini** (`gemini-2.5-pro`, `gemini-2.5-flash`), **OpenAI** (`gpt-4o`, `gpt-4o-mini`). Provider routing uses server-side environment variables (`GEMINI_API_KEY`, `OPENAI_API_KEY`). The selected provider and model are recorded in `GenBrief._provider` / `._model` for traceability.

New env vars (optional, Claude is still the default):
- `GEMINI_API_KEY` — enables Gemini routing
- `OPENAI_API_KEY` — enables OpenAI routing

### Revision / feedback regeneration
The generate-copy API now accepts `feedback` (free text) plus `existingOptions` (current A/B snapshot) in the POST body. The server appends the feedback and a condensed JSON summary of the current options to the generation prompts, then produces updated briefs that preserve what works and address the feedback. The A/B contrast requirement is maintained across revisions.

### Composable offer fields
`Campaign` gains `offerShipping?: string` so a shipping bonus (e.g. "Free Shipping $35+") can stack independently alongside a discount or price-point offer. Both appear in the prompt and are expected to surface in body and product block copy.

### Body layout control
`Campaign.bodyLayout` accepts `"continuous"` (default — all body copy before products) or `"interspersed"` (one opener paragraph before products, remaining paragraphs after). The email renderer splits the body accordingly.

### Product copy style
`Campaign.productCopyStyle` accepts `"headline_winner"` (default), `"benefit_pair"`, or `"proof_badge"`. The value is injected into the system prompt and drives how the model structures product block `main_text`, `sub_text`, and `usps` fields.

### Custom performance context
`Campaign.customPerfContext?: string` lets the review step pass edited performance guidance directly into the system prompt — useful for overriding the default `BRAND_INTELLIGENCE` block with session-specific notes.

### HtmlFormatEditor component
New `app/components/HtmlFormatEditor.tsx` — a textarea with a toolbar for applying inline markdown tokens (`==accent==`, `**bold**`, `*italic*`, `__underline__`, product links) to selected text in the HTML output editor.

---

## GenBrief Schema Changes

| Field | Change |
|---|---|
| `subject_lines[seg].options[]` | NEW — 3 options per segment with `style`, `model_hint`, `shared_thread`, `subject`, `preheader`. Best pair promoted to top-level `subject`/`preheader`. |
| `banner.main_text_1/2`, `sub_text_1/2` | NEW — split headline/subheadline for multi-beat banners. Renderer falls back to `main_text`/`sub_text` if absent. |
| `banner.review_texts[]` | NEW — multiple review lines; renderer falls back to `review_quote`. |
| `banner.main_image`, `sub_image` | NEW — separate image guidance for hero vs. support/close-up image. |
| `banner.trust_booster` | NEW — supplied proof or risk reducer, rendered bold before reviews. |
| `banner.emergency` | NEW — urgency/deadline line, rendered accent after trust_booster. |
| `products[].template_style` | NEW — echoes the productCopyStyle applied per block. |
| `ps` | NEW — P.S. line (10–15 words), rendered after the product grid. |
| `_provider` / `_model` | NEW — provider label and model ID used to generate this option. |
| `quality_checks.playbook_dos_donts` | NEW — QA field. |
| `quality_checks.brand_rule_alignment` | NEW — QA field. |
| `quality_checks.accessibility_layout` | NEW — QA field. |

TypeScript types in `lib/briefgen.ts` updated to match all new fields.

---

## Prompt Engineering

Eight new rule blocks added to the system prompt in `lib/briefgen.ts`:

- **`BRAND_COLOR_GOVERNANCE`** — per-brand hex palette + model/composition rules.
- **`EMAIL_CAMPAIGN_PLAYBOOK_RULES`** — 14 hard rules from the playbook (hook contract, subject generation order, body opener, product grid count, proof constraints, first-200px spec).
- **`WIN_EMAIL_FORMATTING_RULES`** — SendGrid rhythm, inline markdown token usage, accent beat count, link discipline, P.S. trigger criteria.
- **`CONTENT_CREATION_CHAIN_RULES`** — promise-to-USP mapping, insight ↔ mechanism alignment, consistent hook across all email zones.
- **`SUBJECT_OPTION_RULES`** — requires 3 subject/preheader options per segment with distinct `model_hint` lenses; enforces `shared_thread` between subject and banner/body.
- **`BODY_COPY_RULES`** — ≤150 words per segment, `bodyLayout`-aware paragraph splits, P.S. rule.
- **`PRODUCT_BLOCK_TEMPLATE_RULES`** — defines `headline_winner`, `benefit_pair`, `proof_badge` patterns.
- **`BANNER_BRIEF_FORMAT`** — requires `image_guidance` as a 4–6 bullet list; documents all split banner fields.

Per-brand `BRAND_PLAYBOOK_RULES` added for all four brands (DO/DON'T/SUBJECT rules per brand).

`validateBrief` extended to accept `products` for price/offer visibility checking.

---

## Email Renderer

- `bodyLayout` respected: interspersed mode emits one opener paragraph before the product grid and remaining paragraphs + P.S. after.
- P.S. (`brief.ps`) rendered as "P.S. …" after the product grid, merged with any interspersed body tail.
- Banner caption: supports `main_text_1/2`, `sub_text_1/2`, `trust_booster` (bold), `emergency` (accent), `review_texts[]`.
- `clicktracking="off"` added to all footer, unsubscribe, homepage, policy, and CTA links to prevent SendGrid from wrapping them with its redirect URLs.
- `aria-label` added to image anchors and CTA buttons.
- `attr()` URL escaping applied consistently across all `href` attributes.

---

## Bug Fixes / Cleanup

- `gridRows` renamed to `pushGridRows` in `renderEmailHTML` to avoid shadowing the outer grid variable.
- `briefRevisionSummary` strips `_flags`/`_score`/`_provider`/`_model` before truncating to 7 000 chars for revision context to avoid wasting token budget on metadata.
- `createAndParse` renamed `createAndParseWithModel` to make the model parameter visible at call sites.
- Footer link URLs now go through `attr()` to prevent injection via brand domain config.

---

## Files Changed

```
lib/config/aiModels.ts       NEW — AI provider/model registry + normalization helpers
lib/config/types.ts          AIProvider, AIModelSelection, AIModelPair; Campaign: offerShipping, bodyLayout, productCopyStyle, customPerfContext; BodyLayout, ProductCopyStyle types
lib/anthropic.ts             Multi-provider dispatch (callClaude/callGemini/callOpenAI); revision support; model provenance in GenBrief
lib/briefgen.ts              Extended GenBrief types; 8 new prompt rule blocks; per-brand rulebook; validateBrief accepts products
lib/render/email.ts          bodyLayout split; P.S. rendering; split banner fields; clicktracking=off; aria-label; attr() on hrefs
app/api/generate-copy/route.ts  models param; revision param; offerShipping/bodyLayout/productCopyStyle/customPerfContext forwarding
app/components/HtmlFormatEditor.tsx  NEW — markdown toolbar component
docs/workflow-performance-insights-2026-06-04.md  NEW — analysis doc
docs/superpowers/            NEW — planning specs for email-brief-generator integration
```
