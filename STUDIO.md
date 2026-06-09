# EmailAuto Studio

AI-assisted RMKT email production for **BraGoddess · GentsLux · LuxFitting · SantaFare**.
A marketer fills a campaign brief and gets back on-brand, email-safe HTML variants that can be
previewed, exported, and pushed straight into SendGrid as a **Design** or **Dynamic Template** —
backed by user accounts, saved history, and admin approval.

- **Live:** https://emailauto-studio.vercel.app
- **Repo:** `minhhvle-crossian/emailauto-studio` (private)
- **Status:** Deployed to production on Vercel. Auth + history + admin live on Supabase.

---

## 1. Functions summary

### Studio flow — `Build brief → Review & generate → A/B output`
- **Build (6-step accordion wizard)** — ① Brand · Date · Theme (+ optional Hook Contract)
  ② Promo & Urgency ③ Products (up to 8 slots — pick product, set a Customer URL, tick the USPs
  that feed the copy, or **auto-extract** them from the URL, plus add custom USPs) ④ Segments
  (per-brand category segments; SantaFare = lifecycle tiers) ⑤ Last-send context ⑥ Winning reference.
  The brand **hero product is locked** into slot 1.
- **Review & generate** — a performance-intelligence panel, a pre-flight summary, and the **exact,
  editable** system + user prompts (what-you-see-is-what's-sent). One combined prompt generates
  **per-segment copy + the design brief together**, run twice for two contrasting options (**A/B**,
  forced to a different angle + framework; auto-retry on overlap).
- **A/B output** — switch **Option A/B** and **segment**; each shows:
  - **Preview** — live sandboxed `<iframe>` with a **product-layout picker** (stacked / 2-up /
    3-up / hero+grid), an **image panel** (paste SendGrid CDN URLs per block), an **editable-HTML**
    toggle, and a **quality score + flags** (`validateBrief`).
  - **Design brief** — creative direction, hook contract, banner, per-product blocks, self-QA;
    download as Markdown or **Excel (.xls, A + B)**.
  - **Export** — copy/download `.html` per option×segment or all as a `.zip`; **Save version** to
    history; **↗ Design** and **↗ Dynamic Template** sync to SendGrid.
- A **human is in the loop** at every step — nothing sends or schedules automatically.

### Copy quality (the playbook)
Personas (Sandra/Jordan/Adele/Mary), the **Hook Contract**, brand subject/urgency/preheader
formulas, per-brand segment definitions, performance intelligence, and the full WIN/FAIL
**DO/DON'T guardrails** are baked into the single combined prompt (`lib/briefgen.ts`), with a
post-generation **validation engine** (`validateBrief`) scoring each option 0–100 and flagging issues.

### SendGrid integration (v3 API, server-side)
- **Design** — `POST /v3/designs` (module-format HTML that round-trips into SendGrid's editor).
- **Dynamic Template** — runs the team's clean/optimize/QA pass (port of the Apps Script:
  strip builder metadata, click-tracking off, dark-mode CSS, `role="presentation"`, link
  formatter, preheader handling, size/CTA/unsubscribe QA) then creates the template + active
  version, returning the `d-…` Template ID.
- Naming convention: `Brand_Sun31May26_<segment>_<A|B>`.

### Accounts, history, admin
- **Auth** — email/password; new signups are **`pending`** until an admin approves.
- **History** — each user saves whole-campaign generations and re-opens them later (RLS-scoped).
- **Super Admin** console — approve signups, activate/deactivate users, reset passwords.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router, TypeScript) |
| UI | React 19, Tailwind CSS v4 |
| AI | Selectable **Claude · Gemini · ChatGPT/OpenAI** models; server-side provider routing |
| Email API | **SendGrid v3** via `@sendgrid/client` (Designs + Dynamic Templates) |
| Auth + DB | **Supabase** (Postgres + Auth) via `@supabase/supabase-js`, Row-Level Security |
| Export | `jszip` (client-side zip of variants) |
| Hosting | **Vercel** (manual maintainer deploy; Git auto-deploy is intentionally disabled) |

### Key modules
- `lib/config/` — `BRANDS` (persona, voice, layout, `productSegments`, catalog), `intelligence.ts`
  (performance data baked into the prompt), `types.ts` (source of truth).
- `lib/briefgen.ts` — the combined-prompt engine: `buildSystemPrompt`/`buildUserPrompt`,
  `validateBrief` (QA score), `contrastInstruction`, the `GenBrief` output shape + guardrails.
- `lib/anthropic.ts` — `generateOptions(campaign, products, overrides?, models?, revision?)`: two
  contrasting A/B generations requested in parallel, segment batching for large default-prompt runs,
  provider timeout handling, strict-JSON parse-retry, targeted playbook repair, and B-only contrast
  retry when needed.
- `lib/render/` — SendGrid module-format HTML renderer (per segment, selectable product layout) + inline-markdown.
- `lib/scrape.ts` — server-side USP extraction for the Customer URL field.
- `lib/exportExcel.ts` — SpreadsheetML (.xls) export of the A/B briefs (zero-dep).
- `lib/cleanEmail.ts` — Apps Script port (clean/optimize/QA for Dynamic Templates).
- `lib/sendgrid.ts` — Design + Dynamic Template creation.
- `lib/supabase.ts` / `lib/supabaseAdmin.ts` — browser client / server admin (service role).
- `lib/history.ts`, `lib/profile.ts` — saved versions (segments + A/B + edits), profile/status.
- `app/api/*` — `generate-copy`, `scrape-usps`, `sync-sendgrid`, `sync-template`, `admin/users`, `admin/password`.
- `supabase/migrations/` — `saved_versions` + `profiles` (+ auto-pending trigger) with RLS.

### Environment variables
| Var | Scope | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | Claude generation |
| `GEMINI_API_KEY` | server | Gemini generation |
| `OPENAI_API_KEY` | server | ChatGPT/OpenAI generation |
| `AI_PROVIDER_TIMEOUT_MS` | server | optional provider timeout override; default 145000 |
| `AI_QUALITY_REPAIR` | server | optional targeted playbook repair pass; set `off` to disable |
| `AI_QUALITY_REPAIR_THRESHOLD` | server | low-score repair threshold; default 78 |
| `AI_SEGMENT_BATCH_THRESHOLD` | server | auto-batch generation above this segment count; default 3 |
| `AI_SEGMENT_BATCH_SIZE` | server | segments per AI batch; default 2 |
| `AI_SEGMENT_BATCH_CONCURRENCY` | server | concurrent continuation batches after anchor; default 2 |
| `SENDGRID_API_KEY` | server | SendGrid Designs/Templates (needs Marketing + Templates scope) |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase publishable/anon key (browser-safe, RLS-gated) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Admin ops (approve/activate/reset) — never exposed to client |

> `NEXT_PUBLIC_*` are inlined at **build time** — changing them requires a redeploy.

---

## 3. Security

### Enforced (verified on production)
- **Auth on paid routes** — `generate-copy`, `sync-sendgrid`, `sync-template` require an
  **active** signed-in user (`requireActiveUser`); unauthenticated → **401**. Prevents anonymous
  abuse of the Anthropic/SendGrid keys.
- **Admin authorization** — `admin/*` routes require a valid token + `is_admin` + `status='active'`
  (`requireAdmin`); non-admin → **403**; an admin can't deactivate their own account.
- **Row-Level Security** — `saved_versions` and `profiles` scoped to `auth.uid()`; anonymous reads
  return `[]`. `profiles` has **no user-facing UPDATE policy**, so a user cannot self-grant admin.
- **No secret leakage** — service-role / SendGrid / Anthropic keys are server-only; the client
  bundle contains none of them (only the browser-safe Supabase anon key).
- **Preview XSS** — the email preview renders in a **`sandbox=""` iframe** (no scripts, unique
  origin); copy is HTML-escaped and user-pasted image URLs are attribute-escaped.
- **Approval gate** — open signups land `pending` and can do nothing until an admin approves.
- **Transport** — HTTPS + **HSTS** (preload); preview/unique deployment URLs are access-protected.
- **Security headers** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`.

### Recommendations (open)
- **Rotate** `SENDGRID_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` periodically; rotate now if they
  were ever shared in chat/logs.
- **Rate-limit** `/api/generate-copy` so an approved user can't loop it and run up Claude cost.
- Optional: a **Content-Security-Policy** header, email-domain allowlist on signup, and Supabase
  leaked-password protection.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the 5 vars
npm run dev                  # http://localhost:3000
```

Run the SQL in `supabase/migrations/` once (Supabase SQL editor), then grant your admin:
`update public.profiles set is_admin = true, status = 'active' where email = 'you@company.com';`

## Deploy

Deploy is maintainer-only and manual. Git pushes do not auto-deploy. Env vars are set in the Vercel
project (Production). `NEXT_PUBLIC_*` changes require a redeploy to take effect.
