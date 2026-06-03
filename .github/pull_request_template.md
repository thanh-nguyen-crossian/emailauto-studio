## What & why

<!-- One or two sentences: what does this change and why. Link any issue. -->

## Area touched

<!-- Tick the parts of the app this PR changes -->
- [ ] Prompt engineering (`lib/briefgen.ts` — playbook rules, prompt wording, output schema)
- [ ] Generation (`lib/anthropic.ts`)
- [ ] Email render (`lib/render/*`)
- [ ] Brand / segment / product config (`lib/config/*`)
- [ ] UI (`app/page.tsx`, `app/components/*`)
- [ ] API routes (`app/api/*`)
- [ ] Docs / infra

## Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes (ran with `next dev` stopped)
- [ ] No secrets committed (`.env.local` stays local)
- [ ] If `lib/briefgen.ts` changed: the prompt's JSON schema and the `GenBrief` TS type are still in sync
- [ ] If render/UI changed: screenshot or generated `.html` attached
- [ ] Respected the guardrails in [CLAUDE.md](../CLAUDE.md) (subject/preheader lengths, hero-locked slot 0, ≤6 products, spam-safe `💲`/`o.f.f`, no invented proof)

## Notes for review

<!-- Anything the reviewer should focus on, test, or be aware of. -->
