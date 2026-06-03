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

### Studio pipeline — `Brief → Products → Prompts → Copy → Preview → Export`
- **Brief** — pick brand, send date, target tiers (A/B/C/D/F = lifecycle/recency), product
  segments, the offer, and an optional **Hook Contract** (the single source of truth for all copy).
- **Products** — choose products; the brand's **hero product is locked** into position 1.
- **Prompts** — shows the exact **system + per-tier user prompts** before they're sent to Claude;
  fully editable (what you see is what's sent), with copy/reset per prompt.
- **Copy** — generates copy for every `tier × segment` variant; **one Claude call per tier**,
  returning strict JSON keyed `${tier}${segment}` (e.g. `A21`). Inline-editable per variant.
- **Preview** — live `<iframe>` render (sandboxed) with mobile/desktop width toggle, an
  **image panel** (paste SendGrid CDN image URLs per block; logo optional), and a **pre-flight
  panel** enforcing win-patterns (subject/preview length, single hook, hero-first, ≤6 products,
  on-brand accent range, banned-phrase blocklist, hero image set).
- **Export** — copy/download `.html` per variant or all as a `.zip`; **Save version** to history;
  **↗ Design** and **↗ Dynamic Template** sync to SendGrid.

### Copy quality (the playbook)
Personas (Sandra/Jordan/Adele/Mary), the **Hook Contract**, brand-specific subject/urgency/
preheader formulas, corrected per-brand segment IDs, and the full WIN/FAIL **DO/DON'T guardrails**
from the campaign playbook are baked into the prompts.

### SendGrid integration (v3 API, server-side)
- **Design** — `POST /v3/designs` (module-format HTML that round-trips into SendGrid's editor).
- **Dynamic Template** — runs the team's clean/optimize/QA pass (port of the Apps Script:
  strip builder metadata, click-tracking off, dark-mode CSS, `role="presentation"`, link
  formatter, preheader handling, size/CTA/unsubscribe QA) then creates the template + active
  version, returning the `d-…` Template ID.
- Naming convention: `Brand_Sun31May26_<segment>`.

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
| AI | **Anthropic Claude** (`claude-sonnet-4-6`) via `@anthropic-ai/sdk`, prompt-cached system prompts |
| Email API | **SendGrid v3** via `@sendgrid/client` (Designs + Dynamic Templates) |
| Auth + DB | **Supabase** (Postgres + Auth) via `@supabase/supabase-js`, Row-Level Security |
| Export | `jszip` (client-side zip of variants) |
| Hosting | **Vercel** (auto-deploy from `main`) |

### Key modules
- `lib/config/` — `BRANDS`, `TIER_PSYCHOLOGY`, per-segment guidance (source of truth).
- `lib/prompts.ts` — Hook-Contract system/user prompts + guardrails.
- `lib/anthropic.ts` — per-tier generation, strict-JSON parsing.
- `lib/render/` — SendGrid module-format HTML renderer + inline-markdown.
- `lib/cleanEmail.ts` — Apps Script port (clean/optimize/QA for Dynamic Templates).
- `lib/sendgrid.ts` — Design + Dynamic Template creation.
- `lib/supabase.ts` / `lib/supabaseAdmin.ts` — browser client / server admin (service role).
- `lib/history.ts`, `lib/profile.ts` — saved versions, profile/status.
- `app/api/*` — `generate-copy`, `sync-sendgrid`, `sync-template`, `admin/users`, `admin/password`.
- `supabase/migrations/` — `saved_versions` + `profiles` (+ auto-pending trigger) with RLS.

### Environment variables
| Var | Scope | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | Claude generation |
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

Pushing to `main` auto-deploys on Vercel. Env vars are set in the Vercel project (Production).
`NEXT_PUBLIC_*` changes require a redeploy to take effect.
