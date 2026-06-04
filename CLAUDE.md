# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**EmailAuto Studio** — a deployed **Next.js 15** web app that turns a campaign brief into
on-brand, email-safe HTML for four RMKT brands (**BraGoddess, GentsLux, LuxFitting, SantaFare**),
plus a matching **designer brief**. A marketer fills a 6-step brief, reviews the exact prompts,
and gets back **two contrasting options (A/B)** with **per-segment** copy + a design brief, which
they preview, edit, export, and push into SendGrid. Backed by Supabase auth/history/admin.

- **Live:** https://emailauto-studio.vercel.app
- **Hosting:** Vercel. **Deploys are maintainer-only** (see Deploy) — Git is *not* connected to Vercel, so pushes never auto-deploy and contributors cannot deploy.

> ⚠️ This app was **rewritten** from an earlier single-file React artifact. Ignore any old mention
> of `TIER_PSYCHOLOGY`, `${tier}${productType}` variant keys, `window.storage`, or "one call per
> tier" — none of that exists anymore. The current model is **segment-based A/B**, described below.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript), React 19 |
| UI | Tailwind CSS v4, light theme (palette in `app/globals.css`) |
| AI | Anthropic Claude `claude-sonnet-4-6` via `@anthropic-ai/sdk`, prompt-cached system prompt |
| Email API | SendGrid v3 via `@sendgrid/client` (Designs + Dynamic Templates) |
| Auth + DB | Supabase (Postgres + Auth), Row-Level Security, `@supabase/supabase-js` |
| Export | `jszip` (zip of HTML); SpreadsheetML (hand-written, zero-dep Excel) |

## Commands

```bash
npm run dev          # local dev server — http://localhost:3000
npm run build        # production build (stop dev first — running both corrupts .next cache)
npm run lint         # ESLint
npx tsc --noEmit     # type-check without emitting
```

**Before every commit, both must pass:** `npx tsc --noEmit` then `npm run build`.
**Do not deploy** unless you are the maintainer with Vercel access — see Deploy.

## Environment variables

| Var | Scope | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | Claude generation |
| `SENDGRID_API_KEY` | server | needs Marketing + Templates scopes for `/v3/designs` |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | anon/publishable key — browser-safe, RLS-gated |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | admin + RLS bypass — never `NEXT_PUBLIC` |

`NEXT_PUBLIC_*` are inlined at **build time** — changing them on Vercel requires a redeploy.

**First-time Supabase setup:** run `supabase/migrations/` once in the Supabase SQL editor, then grant yourself admin:
```sql
update public.profiles set is_admin = true, status = 'active' where email = 'you@company.com';
```

## Core model: segments + A/B (read this carefully)

A **variant is a segment**, not a tier×product matrix. Each brand defines its segments in
`lib/config/brands.ts → productSegments` (`{ code, label, meta, guidance }`):

- BraGoddess: `21, 22, 45, 8, 3` · GentsLux: `71, 72, 73` · LuxFitting: `61, 62, 63, 64`
- SantaFare: lifecycle tiers `1-A, 1-B, 1-C, 1-D`

The user selects N segments + up to 8 product slots. **One combined prompt** produces, in a
single Claude call, the per-segment copy **and** the design brief. That call is run **twice** to
get two contrasting options (**A** and **B**) — B is forced to a different angle + framework than A.

### Generation flow (`lib/anthropic.ts → generateOptions`)

1. Build system + user prompt from the campaign (`lib/briefgen.ts`).
2. Generate **Option A** → `validateBrief` (attaches `_flags` + `_score`).
3. Generate **Option B** with `contrastInstruction(A.creative_direction)` appended ("A used angle
   X / framework Y — pick different ones"). If B still overlaps A, retry once.
4. Optional `PromptOverrides {system?, user?}` (from the user-edited review step) replace the
   generated prompts; B's contrast clause is appended to the edited system prompt so divergence
   survives edits.
- Model: `claude-sonnet-4-6`, `max_tokens: 8192`, system prompt `cache_control: ephemeral`.
- `createAndParse` retries **once** on a JSON parse failure with a correction note.
- **Sequential A→B is slow** (~60s/segment). Route `maxDuration = 300`. Multi-segment sends take
  1–3 min — this is expected, not a bug.

### The generated object — `GenBrief` (`lib/briefgen.ts`, snake_case to match the prompt schema)

```
creative_direction { angle, framework, hook_contract{…}, flow, differentiator }
subject_lines      { [segKey]: { subject, preheader } }   // segKey = "seg_" + code.replace(/-/g,"_")
theme              string (visual brief)
banner             { logo_stars, main_text, sub_text, image_guidance, review_quote, cta }
body               { base, [segKey]: "<per-segment body copy>" }
products           [ { slot, name, main_text, sub_text, popup_badge, usps[], review, cta } ]
quality_checks     { click_reason, hook_alignment, proof_safety, spam_risk, … }
_flags / _score    // added by validateBrief (validation engine, 0–100)
```

Use `segJsonKey(code)` whenever mapping a segment code to its key in `subject_lines` / `body`.

## Module map

```
lib/config/brands.ts     BRANDS (persona, voice, layout, accent, heroSlug, productSegments, catalog),
                         BRAND_LIST, brandCatalog(); catalog products carry usps[]/review/url/price
lib/config/types.ts      Brand, Product, ProductSegment, Campaign, OfferType, Urgency, ImageOverrides …
lib/config/intelligence.ts  BRAND_INTELLIGENCE perf data → intelligencePromptBlock() (prompt) + Perf panel
lib/briefgen.ts          THE prompt engine: buildSystemPrompt / buildUserPrompt / validateBrief /
                         contrastInstruction, PLAYBOOK_RULES / PROMPT_CONTRACT / PLAYBOOK_ENFORCEMENT,
                         GenBrief types, segJsonKey
lib/anthropic.ts         getClient, createAndParse (parse-retry), generateOptions(campaign, products, overrides?)
lib/render/email.ts      renderEmailHTML(brand, campaign, products, brief, segment, images, opts)
                         → SendGrid module HTML for ONE segment. ProductLayout: stack|two|three|hero_grid
lib/render/markdown.ts   parseInlineMarkdown / paragraphsToHtml / buildUrl (markdown → SendGrid HTML)
lib/scrape.ts            extractUSPs(html) — USP scraping heuristic (JSON-unescape + li/strong + noise filter)
lib/exportExcel.ts       exportBriefsToExcel — SpreadsheetML (.xls), one sheet per option, zero deps
lib/cleanEmail.ts        cleanForTemplate — Dynamic Template HTML cleanup (port of the team's Apps Script)
lib/sendgrid.ts          SendGrid v3 client helpers (Designs, Templates)
lib/history.ts           VersionPayload + saveVersion/listVersions/deleteVersion (RLS-scoped)
lib/supabase.ts          browser client (anon key)        lib/profile.ts  accessToken(), Profile
lib/supabaseAdmin.ts     service-role client; requireActiveUser() / requireAdmin() route guards

app/page.tsx             the whole Studio: 3 views — build (6-step accordion wizard) → review
                         (editable prompts + pre-flight) → output (A/B preview, design brief, export)
app/components/          Auth (dark, branded), History, AdminPanel, ImageEditor, Preview,
                         PreflightPanel, BriefView (+ briefToMarkdown)
app/api/generate-copy    POST → generateOptions, returns { a, b }   (auth: requireActiveUser)
app/api/scrape-usps      POST { url } → { usps }                     (auth: requireActiveUser)
app/api/sync-sendgrid    POST → create a SendGrid Design             (auth)
app/api/sync-template    POST → clean + create a Dynamic Template, returns the d-… id (auth)
app/api/admin/*          user approval / password reset              (auth: requireAdmin)
supabase/migrations/     0001 saved_versions, 0002 profiles_admin (already applied)

agents/automation/       Python scripts for campaign generation + flow management (separate from the
agents/analytics/        Next.js studio — not deployed by Vercel; see agents/README.md)
docs/                    Analysis, playbook, architecture, presentations (reference only)
```

## Markdown conventions in body copy (`parseInlineMarkdown`)

| Syntax | Output |
|---|---|
| `[Name](slug:productslug)` | product link → `https://{domain}/{slug}?{{paramurl}}` |
| `[text](home)` | homepage link |
| `==text==` | brand accent + bold · `**b**` `*i*` `__u__` |
| `💲` instead of `$` | spam-filter dodge |

`{{paramurl}}` and `{{unsubscribe}}` are **SendGrid merge tags — emit literally, never hardcode a value.**

## Invariants & guardrails

- `campaign.segments` must be a subset of `brand.productSegments[].code` (`switchBrand` resets them).
- Hero product (`brand.heroSlug`) is **locked into slot 0** and rendered first.
- Subjects 42–58 chars (hard cap 60); preheaders 60–90; `{{first_name}}` in subject **or** preheader, not both.
- Products ≤ 6 (SantaFare defaults to 4) — `validateBrief` warns at 7+.
- Promo copy: write `$` as `💲`, "off" as `o.f.f`; no spam words (see `SPAM_WORDS` in `briefgen.ts`).
- Never invent proof/scarcity/reviews not supplied in the product data.
- **Never duplicate brand/segment/product logic in prompts** — derive it from `lib/config/*`.
- Prompt changes go in `lib/briefgen.ts` only; keep the prompt schema and `GenBrief` TS type in sync.
- Email HTML changes go in `lib/render/email.ts` / `markdown.ts`; keep it SendGrid-module-format and email-safe (tables, inline styles, merge tags emitted literally).

## Coding conventions

- **TypeScript, no `any`** unless truly unavoidable; match surrounding style.
- New API routes that cost money or touch user data must call `requireActiveUser` (or `requireAdmin`).

## Security (do not regress)

- Secrets live in `.env.local` (gitignored).
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only** — never `NEXT_PUBLIC`, never sent to the client.
- Paid/admin routes are guarded: `requireActiveUser` (generate-copy, scrape-usps, sync-*) and
  `requireAdmin` (admin/*). RLS scopes each user's saved versions.
- Preview iframes use `sandbox=""` so pasted/edited HTML can't run scripts.

## Deploy — who can, and who can't

**Only the repo owner deploys, and only manually.** Git is intentionally **not** connected to
Vercel, so no push (to any branch, including `main`) triggers a deployment. The Vercel project
lives under the owner's account; contributors have **no Vercel access**.

- **Contributors / contributor agents:** do **not** run `vercel`. It will fail (no auth) and is not
  your job. Your workflow ends at: push your branch and open a PR. The owner reviews, merges, and
  deploys. Don't add deploy steps, GitHub Actions that deploy, or `vercel.json` deploy hooks.

- **Maintainer (owner) only** — after merging, ship manually:
  ```bash
  git checkout main && git pull
  npm run build
  npx vercel --prod --yes        # aliases emailauto-studio.vercel.app
  curl -s -o /dev/null -w "%{http_code}" https://emailauto-studio.vercel.app/   # expect 200
  ```

**Gotcha:** if a Vercel serverless function times out, it returns a non-JSON error page. The client
handles this gracefully, but it means the selected segment count is too high — reduce segments or
revisit the `maxDuration` limit.
