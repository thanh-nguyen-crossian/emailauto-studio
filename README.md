# EmailAuto Studio

AI-assisted RMKT email production for **BraGoddess · GentsLux · LuxFitting · SantaFare**.

A marketer fills a 6-step campaign brief and gets back, for every selected **segment**, two
contrasting options (**A/B**) of **on-brand copy + a designer brief**, generated together by Claude.
Everything is previewable, editable, exportable (HTML / `.zip` / Excel), and one click away from a
SendGrid **Design** or **Dynamic Template**. Backed by user accounts, saved history, and admin approval.

- **Live:** https://emailauto-studio.vercel.app
- **Stack:** Next.js 15 (App Router, TS) · React 19 · Tailwind v4 · Anthropic Claude · SendGrid v3 · Supabase · Vercel

---

## Quick start

```bash
git clone https://github.com/minhhvle-crossian/emailauto-studio.git
cd emailauto-studio
npm install
cp .env.example .env.local      # fill in the keys (see below)
npm run dev                     # → http://localhost:3000
```

You'll need a Supabase project (auth + history) and an Anthropic key to generate. SendGrid is only
needed for the sync-to-SendGrid step.

### Environment (`.env.local`)

| Var | Scope | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | generation |
| `SENDGRID_API_KEY` | server | needs Marketing read/write for `/v3/designs` |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | admin + RLS bypass — never `NEXT_PUBLIC` |

`NEXT_PUBLIC_*` are inlined at build time → changing them on Vercel requires a redeploy.

---

## How it works (user flow)

```
Build brief (6-step wizard)  →  Review & generate  →  A/B output
```

1. **Build** — an accordion wizard: ① Brand · Date · Theme ② Promo & Urgency ③ Products
   (8 slots: pick product, set a customer URL, tick/scrape USPs) ④ Segments ⑤ Last-send context
   ⑥ Winning reference.
2. **Review & generate** — performance-intelligence panel + a pre-flight summary + the **exact,
   editable** system/user prompts. One combined prompt → per-segment copy **and** design brief,
   run twice for two contrasting options (**A/B**, forced to different angle + framework).
3. **A/B output** — switch Option A/B and segment; live email **preview** (with a product-layout
   picker and editable HTML), the **design brief**, and a **quality score + flags**. Export each
   as HTML / `.zip`, export the brief to Excel, save to history, or sync to SendGrid.

A human is in the loop at every step — nothing is sent or scheduled automatically; the SendGrid
sync only creates a Design / Dynamic Template draft.

---

## Project layout

```
app/            Next.js App Router — page.tsx (the Studio), components/, api/ routes
lib/            config/ (brands, types, intelligence) · briefgen.ts (prompt engine) ·
                anthropic.ts (generation) · render/ (email HTML) · sendgrid.ts · history.ts · supabase*
supabase/       SQL migrations (saved_versions, profiles_admin)
docs/           analysis, playbook, architecture, presentations
CLAUDE.md       architecture + conventions for coding agents — start here when editing
CONTRIBUTING.md dev workflow, branch/PR conventions, deploy
```

## Scripts

| Command | What |
|---|---|
| `npm run dev` | local dev server |
| `npm run build` | production build (don't run while `dev` is up) |
| `npm run lint` | ESLint |
| `npx vercel --prod --yes` | deploy to production |

## For contributors

Read **[CLAUDE.md](CLAUDE.md)** (architecture, the segment/A-B model, invariants, security) and
**[CONTRIBUTING.md](CONTRIBUTING.md)** (workflow + conventions) before making changes. The product
spec lives in **[STUDIO.md](STUDIO.md)**.
