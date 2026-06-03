# Contributing

Thanks for jumping in. This is a small Next.js app; the goal is to keep it on-brand, email-safe,
and secure. Start by reading **[CLAUDE.md](CLAUDE.md)** — it's the architecture + conventions doc
(written for coding agents, but useful for humans too).

## Setup

```bash
npm install
cp .env.example .env.local   # ask the maintainer for working keys, or use your own Supabase/Anthropic
npm run dev                  # http://localhost:3000
```

A first-time signup lands in `pending` status — an existing admin must approve it (Admin panel),
or set `profiles.status = 'active'` + `is_admin = true` directly in Supabase for your own account.

## Workflow

1. Branch off `main`: `git checkout -b feat/<short-name>` (or `fix/…`).
2. Make the change. Keep it small and focused.
3. **Before committing, both must pass:**
   ```bash
   npx tsc --noEmit     # types
   npm run build        # prod build = lint + type-check + route collection
   ```
   ⚠️ Stop `npm run dev` before `npm run build` — running both corrupts the `.next` cache.
4. Open a PR to `main` describing what + why. Don't commit secrets or `.env.local`.

## Conventions

- **TypeScript, no `any`** unless unavoidable; match the surrounding style.
- **Never hardcode brand/segment/product logic** — it lives in `lib/config/*`; derive from it.
- Prompt changes go in **`lib/briefgen.ts`** (the single source of the generation prompt). The
  output shape is `GenBrief` (snake_case) — keep the prompt schema and the TS type in sync.
- Email HTML changes go in **`lib/render/email.ts`** / `markdown.ts`. Keep it SendGrid-module-format
  and email-safe (tables, inline styles, `{{paramurl}}` / `{{unsubscribe}}` merge tags emitted literally).
- Respect the guardrails in CLAUDE.md (subject/preheader lengths, hero-locked slot 0, ≤6 products,
  spam-safe `💲` / `o.f.f`, no invented proof).

## Security (must not regress)

- `.env.local` is gitignored — never commit it. `SUPABASE_SERVICE_ROLE_KEY` is **server-only**.
- New API routes that cost money or touch user data must call `requireActiveUser` (or `requireAdmin`).
- RLS scopes saved versions per user — don't bypass it from the client.

## Deploy

Production is Vercel. After merging to `main`:

```bash
npx vercel --prod --yes
```

Then smoke-test: `curl -s -o /dev/null -w "%{http_code}" https://emailauto-studio.vercel.app/` → `200`.
Env vars are managed in the Vercel dashboard; `NEXT_PUBLIC_*` changes need a redeploy to take effect.

## Gotchas

- Generation is slow (~60s/segment; A then B run sequentially). The `generate-copy` route sets
  `maxDuration = 300`; multi-segment sends legitimately take 1–3 minutes.
- If a serverless function times out, Vercel returns a non-JSON error page — the client handles
  this gracefully, but it's a signal to reduce segments or revisit timeouts.
