# EmailAuto Studio

Hosted web app (Next.js) that generates on-brand, **email-safe** RMKT email HTML for the four
brands — BraGoddess, GentsLux, LuxFitting, SantaFare. A marketer fills a campaign brief and gets
back preview-ready HTML variants with win-pattern pre-flight checks.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

## How it works

Flow: **brief → products → copy → preview → export**.

- **Config** (`lib/config/`): `BRANDS`, `TIER_PSYCHOLOGY`, `PRODUCT_PSYCHOLOGY` — derived from
  `docs/email-template-analysis.md` and the `Source/WinEmailTemps/*.eml` extraction. All copy and
  layout logic derives from these; never duplicate brand/tier rules elsewhere.
- **Copy generation** (`lib/anthropic.ts`, `lib/prompts.ts`, `app/api/generate-copy`): one Claude
  call **per tier** (`claude-sonnet-4-6`), brand system prompt prompt-cached, returns strict JSON
  keyed by the `${tier}${productType}` variant key.
- **Render** (`lib/render/`): pure-TS pipeline reproducing the proven WIN email shell (600px
  container, 2-up product grid, MSO conditionals, 480px mobile stacking) plus the four fixes the
  analysis flagged as missing in all 46 source templates: dark-mode CSS, bulletproof HTML CTA
  buttons, `role="presentation"`, and responsive images.
- **Pre-flight** (`lib/preflight.ts`): subject/preview length, single-hook story opener, locked
  hero product, max 6 products, on-brand accent range, banned-phrase blocklist, placeholder image.

## Deploy (Vercel)

Set `ANTHROPIC_API_KEY` in the Vercel project env, then `vercel --prod`.

## Scope

PoC — copy generation, preview, export only. SendGrid push (Single Send drafts), saved history,
and the analytics agent are deferred (see the project plan).
