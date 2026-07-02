# EmailAuto Studio — Master Improvement Plan (2026-07-02)

**Audience:** an executing coding agent (Claude Code / Codex) working in this repo.
**Scope:** code refactoring · output quality · UI/UX overhaul · **feature expansion (incl. the SendGrid performance feedback loop — top priority)**.
**Relation to prior plans:** this plan **supersedes** `docs/IMPLEMENTATION-PLAN-2026-07.md` phases 3–5 and extends `docs/QUALITY_OVERHAUL_PLAN.md` / `docs/optimization-roadmap.md`. Phases 1–2 of the July plan are already implemented (`lib/config/playbook.ts` R23 exists; `ProductCopyStyle` includes `persona_pick` at `lib/config/types.ts:98`). **Before starting any ticket, verify it isn't already done** — several older plans were partially executed.

## How to use this plan

- Work phase by phase, ticket by ticket. Each ticket is: **Why → Files → Do → Acceptance → Verify.**
- Line numbers were captured 2026-07-02 and are indicative — **always re-locate symbols by name** before editing.
- Before every commit: `npx tsc --noEmit` → `npm run build` → `npm run lint` → `npx vitest run`. All must pass.
- **Do not deploy.** Workflow ends at branch pushed + PR opened (Vercel is maintainer-only, per `CLAUDE.md`).
- Never regress the invariants in `CLAUDE.md` (segment-based A/B model, merge tags emitted literally, spam-token rules, brand logic derived from `lib/config/*`, auth guards on paid routes, service-role key server-only).
- Effort tags: **[S]** ≤ half day · **[M]** 1–2 days · **[L]** 3–5 days · **[XL]** 1–2 weeks.
- Priority tags: **P0** (do first) · **P1** · **P2** (later-phase / big bet).

---

# PART 1 — Codebase audit (state as of 2026-07-02)

## 1.1 Size & shape

| File | Lines | Problem |
|---|---|---|
| `lib/briefgen.ts` | 3,292 | Prompt layers + validation + scoring + variety banks + playbook constants + types in one file |
| `lib/anthropic.ts` | 2,345 | Provider adapters + layered orchestration + retry/repair + merge logic + prompt assembly mixed |
| `app/studio/StudioApp.tsx` | 2,310 | Entire Studio shell: ~33 state hooks, 8+ async flows, all three views |
| `app/studio/StudioPanels.tsx` | 1,621 | Grab-bag component library with duplicated Field/ChoiceGroup patterns |
| `app/components/BriefView.tsx` | 854 | Brief render + local undo/redo refs (lost on refresh) |
| `lib/render/email.ts` | ~670 | Fine size; hardcoded widths, a11y gaps (see 1.4) |

Tests exist (Vitest, 8 files) and CI runs `tsc` + `build` — but **no tests for the most critical gates**: `briefContrastIssues` (`lib/briefgen.ts:3137`), `validateBriefPair` (`:3285`), salvage-JSON recovery, variety-collision logic, and no E2E/render tests.

## 1.2 Prompt/generation engine — key weaknesses

1. **A/B contrast is enforced post-hoc, not at generation time.** `contrastInstruction` (`lib/briefgen.ts:~1889`) steers B, but if `briefContrastIssues` finds a hard collision there is exactly **one** retry at `AI_TEMP_B_RETRY=0.9` and **no fallback** if that also fails. The retry doesn't inject A's actual copy patterns as explicit "forbidden" constraints.
2. **Validation blind spots.** `validateBrief` (`lib/briefgen.ts:2491`) does not check: per-segment body differentiation (rule exists in prompt only), cross-segment subject consistency, accent-color adherence, and `lib/quality/deliverability.ts` is **not integrated** into the score.
3. **No copy exemplars in prompts.** `docs/corpus/*.json` (mined winning subjects/openers per brand, built by `agents/analytics/extract_corpus.py`) is **static reference data never loaded by the app**. Brand voice is 1–2 sentences; no few-shot examples of winning copy.
4. **Deadline fallbacks ship silently.** When a segment patch exceeds the soft deadline, `fallbackSegmentPatch` (`lib/anthropic.ts:~1366`) writes generic template copy and the email still ships — flagged only in `_advisory`.
5. **PromptOverrides are blunt.** A single system/user override applies globally to foundation **and** every segment patch (`lib/anthropic.ts:~1100`); repair prompts (`buildQualityRepairPrompt`) don't include the overrides, so repair can undo user steering; no per-segment overrides; no sanitization against JSON-breaking characters.
6. **Performance feedback is scaffolded but empty.** `lib/performance/feedback.ts` defines `SendOutcome`/`SendMetrics`/`derivePerformanceSignal`/`performanceFeedbackPromptBlock`, and Supabase has `send_history` (migration 0003) — but **nothing hydrates metrics from SendGrid**. The loop is open.

## 1.3 Frontend — key weaknesses

1. `StudioApp.tsx` mixes wizard state, generation streaming, history, auth, export, and SendGrid sync. Prop-drilling into `StudioPanels.tsx`.
2. Draft autosave is localStorage-only (600ms debounce); Supabase save is manual; BriefView undo/redo stacks are in-memory refs.
3. Silent failures in async flows (scrape, auth refresh); no error boundaries; limited mobile responsiveness; a11y gaps (contrast, keyboard nav, focus management in the accordion wizard).
4. `Preview.tsx` is only 39 lines — a sandboxed iframe with no device-width toggle, no dark-mode simulation, no client-rendering warnings.

## 1.4 Rendering/SendGrid/API — key weaknesses

1. `renderEmailHTML` (`lib/render/email.ts:~392`): hardcoded 600px shell and column widths; no 1+2/2+1 asymmetric grids; dark-mode is a generic overlay injected by `cleanEmail.ts` (no brand-accent adaptation); no aria-labels on CTA links; alt-text falls back to product name.
2. `lib/sendgrid.ts` (106 lines) supports only Design + Dynamic Template creation. **No** send, schedule, Single Send stats, click-tracking stats, Event Webhook ingestion, contact/segment sync, or native A/B test creation.
3. Rate limiting only on `/api/generate-copy` (in-memory, lost on restart); none on `/api/scrape-usps`, `/api/sync-sendgrid`, `/api/extract-tone`.
4. Supabase: 3 tables (`saved_versions`, `profiles`, `send_history`). `send_history` has **no metrics columns** and no link to a SendGrid single-send id. No tables for templates, comments, or performance snapshots.
5. No structured logging/observability (no Sentry); no background job mechanism (generation blocks the request up to 300s).

---

# PART 2 — PHASED EXECUTION PLAN

Recommended order: **R (refactor foundation) → F1 (feedback loop) → Q (output quality) → U (UI/UX) → F2 (feature expansion)**. R first because every later phase touches `briefgen.ts`/`anthropic.ts`/`StudioApp.tsx`, and splitting them first makes all later diffs reviewable. F1 before Q because Q's biggest lever (data-driven prompts) depends on F1's data.

---

# Phase R — Refactoring foundation (P0)

### R1 — Split `lib/briefgen.ts` into a `lib/prompt/` package [L]
- **Why:** 3,292 lines mixing 5 concerns blocks safe iteration on prompts and validation.
- **Files:** `lib/briefgen.ts` → new `lib/prompt/schema.ts` (GenBrief types, `segJsonKey`), `lib/prompt/layers.ts` (`buildSystemPrompt`, `buildUserPrompt`, all layer fns, `contrastInstruction`), `lib/prompt/variety.ts` (VARIETY_BANKS, `selectVarietyProfile:1326`, contrast-variety helpers), `lib/prompt/validation.ts` (`validateBrief:2491`, `validateBriefPair:3285`, `briefContrastIssues:3137`, scoring), `lib/prompt/playbook.ts` (BRAND_PLAYBOOK_RULES + pattern layers).
- **Do:** pure mechanical move — no behavior change. Keep `lib/briefgen.ts` as a barrel re-export so all existing imports (`lib/anthropic.ts`, tests, routes) keep working. Move matching tests alongside.
- **Acceptance:** zero behavior diff; `git diff --stat` shows only moves + barrel; all existing tests pass unmodified.
- **Verify:** `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Snapshot the assembled system prompt for one brand before/after (`AI_PROMPT_DEBUG=on`) and diff — must be byte-identical.

### R2 — Split `lib/anthropic.ts` into `lib/generation/` [L]
- **Why:** provider I/O, orchestration, retry policy, and merge logic are interleaved; the file is untestable as a unit.
- **Files:** → `lib/generation/providers.ts` (Claude/Gemini/OpenAI adapters, `createTextWithProviderRetry`, streaming), `lib/generation/parse.ts` (`parseStrictJson`, `salvagePartialJson`, compact recovery), `lib/generation/orchestrator.ts` (`generateOptions:2315`, foundation + segment-patch flow, `mergeOptionBatches`), `lib/generation/repair.ts` (`repairBriefIfNeeded`, `repairCreativityIfNeeded`, keep-heuristics). Keep `lib/anthropic.ts` as barrel.
- **Do:** mechanical move; extract the env-config constants block (timeouts, temps, thresholds) into `lib/generation/config.ts` with one documented object instead of ~25 loose module constants.
- **Acceptance/Verify:** same bar as R1.

### R3 — Decompose `StudioApp.tsx` + extract hooks [XL]
- **Why:** 2,310 lines / ~33 state hooks; every UI ticket in Phase U depends on this.
- **Files:** `app/studio/StudioApp.tsx`, `app/studio/StudioPanels.tsx` → new `app/studio/views/BuildWizard.tsx`, `views/ReviewView.tsx`, `views/OutputView.tsx`; hooks `app/studio/hooks/useGenerationStream.ts` (SSE consumption, stage/progress/partial/error events), `useDraftPersistence.ts` (localStorage autosave + restore), `useSlotEditing.ts`, `useHistoryPanel.ts`, `useSendgridSync.ts`; shared primitives `app/studio/ui/Field.tsx`, `ChoiceGroup.tsx`, `CollapsibleSection.tsx` (currently duplicated across StudioPanels).
- **Do:** introduce a single store (Zustand, add as dependency — or React context + `useReducer` if avoiding deps) holding `campaign`, `products`, `view`, `generation` slices. Move state down incrementally: one view per PR-sized commit. No visual changes in this ticket.
- **Acceptance:** `StudioApp.tsx` < 300 lines (routing between views + providers); no view file > 700 lines; identical UI behavior (manually walk build→review→output→export).
- **Verify:** type-check/build/lint; record a manual smoke checklist in the PR (draft restore, generation stream, history save/load, SendGrid sync, Excel/zip export).

### R4 — Test the critical gates [M]
- **Why:** contrast retry, JSON salvage, and merge are the highest-blast-radius code paths and have zero coverage.
- **Files:** new `lib/prompt/validation.contrast.test.ts`, `lib/generation/parse.test.ts`, `lib/generation/merge.test.ts`.
- **Do:** unit-test `briefContrastIssues` + `isHardContrastIssue` (identical A/B → hard issues; properly contrasted pair → none), `salvagePartialJson` against 3–4 real truncated LLM outputs (capture fixtures from logs), `mergeOptionBatches` (missing segment keys flagged, anchor-only merge), and `validateBrief` edge cases (null subject_lines, malformed hook_contract, empty products).
- **Acceptance:** ≥ 25 new assertions; all pass; CI green.
- **Verify:** `npx vitest run --coverage` — new files ≥ 80% line coverage on the moved modules.

### R5 — Consistent API error envelope + rate limiting + observability [M]
- **Why:** routes return mixed error shapes; only generate-copy is rate-limited; failures are invisible in production.
- **Files:** new `lib/api/respond.ts`, `lib/api/rateLimit.ts`; all `app/api/*/route.ts`; `package.json` (add `@sentry/nextjs` — confirm with maintainer before adding).
- **Do:** (1) standard JSON error envelope `{ error: { code, message, advisory? } }` used by every route; (2) extract the in-memory limiter from generate-copy into `lib/api/rateLimit.ts` and apply to `scrape-usps` (10/min), `extract-tone` (10/min), `sync-sendgrid` + `sync-template` (10/min); (3) wire Sentry (server + client) with sampling, scrubbing request bodies; log generation stage timings behind `AI_GENERATION_TELEMETRY`.
- **Acceptance:** every route returns the envelope on failure; 429s carry `Retry-After`; Sentry captures a thrown test error in dev.
- **Verify:** curl each route unauthenticated/malformed and assert envelope shape; unit test the limiter window math.

### R6 — Runtime schema validation with Zod at trust boundaries [M]
- **Why:** `JSON.parse(...) as GenBrief` appears in merge and parse paths with no runtime checks; API route bodies are also hand-validated.
- **Files:** `package.json` (add `zod`), new `lib/prompt/schema.zod.ts` (GenBrief schema mirroring the TS types), `lib/generation/parse.ts`, `app/api/generate-copy/route.ts` (request body), `lib/history.ts` (VersionPayload on load).
- **Do:** validate LLM output post-parse with `safeParse`; on failure, route into the existing FIX_JSON retry with the Zod error list appended to the correction note (this **improves** parse retry quality). Validate request bodies and history payload restores.
- **Acceptance:** malformed LLM JSON produces a targeted correction retry listing the failing paths; invalid POST bodies → 400 envelope; `GenBrief` TS type and Zod schema are asserted in-sync via a type-level test (`z.infer` equality).
- **Verify:** unit tests with malformed fixtures.

---

# Phase F1 — SendGrid performance feedback loop (P0 — user's top priority)

**Goal:** close the loop: *generate → send → measure → learn → generate better*. The scaffolding (`lib/performance/feedback.ts`, `send_history` table, `performanceFeedbackPromptBlock`) already exists — this phase hydrates it with real SendGrid data and feeds it back into prompts and the UI.

### F1.1 — Schema: metrics + send linkage [S]
- **Why:** `send_history` (migration 0003) stores creative levers but no metrics and no SendGrid id.
- **Files:** new `supabase/migrations/0004_send_metrics.sql`.
- **Do:** add columns to `send_history`: `singlesend_id text`, `design_id text`, `template_id text`, `delivered int`, `unique_opens int`, `unique_clicks int`, `bounces int`, `unsubscribes int`, `spam_reports int`, `clicks_by_url jsonb default '{}'`, `stats_synced_at timestamptz`, `revenue numeric null`. Add index on `(singlesend_id)`. Also create `performance_snapshots` table (`id, user_id, brand_id, period_start, period_end, payload jsonb, created_at`) for aggregated brand-level rollups. RLS: same owner-scoped policies as existing tables.
- **Acceptance:** migration runs clean on a fresh DB; RLS verified (user A cannot read user B rows).
- **Verify:** run in Supabase SQL editor on a branch project; document in PR that the maintainer must apply it (migrations are manual, per `CLAUDE.md`).

### F1.2 — Capture the send linkage at sync time [S]
- **Why:** stats can only be joined back if we record which SendGrid object a brief became.
- **Files:** `app/api/sync-sendgrid/route.ts`, `app/api/sync-template/route.ts`, `lib/history.ts`, `app/studio/views/OutputView.tsx`.
- **Do:** after a successful Design/Template creation, upsert a `send_history` row per synced segment×option with `design_id`/`template_id`, creative levers (already computed for `send_history` writes), and `source_version_id`. Add a small "Link Single Send" input in the output view where the marketer pastes the Single Send URL/id after they schedule it in SendGrid (until F1.5 automates sending) — store as `singlesend_id`.
- **Acceptance:** syncing a design creates linked rows; pasting a Single Send id updates them.
- **Verify:** integration test with SendGrid client mocked; manual walkthrough.

### F1.3 — Stats ingestion route + scheduled pull [M]
- **Why:** the core of the loop. SendGrid exposes per-Single-Send stats and click-tracking stats via the Marketing Campaigns Stats API.
- **Files:** `lib/sendgrid.ts` (add `getSingleSendStats(id)` → `GET /v3/marketing/stats/singlesends/{id}`, `getSingleSendClickStats(id)` → `GET /v3/marketing/stats/singlesends/{id}/links`, plus `listSingleSends()` → `GET /v3/marketing/singlesends` for the picker in F1.2); new `app/api/performance/sync/route.ts` (auth: `requireActiveUser`).
- **Do:** the route iterates the caller's `send_history` rows with a `singlesend_id` and `stats_synced_at` older than 6h, pulls stats, writes metrics columns, and recomputes a `performance_snapshots` rollup per brand. Handle SendGrid 429s with backoff. Also add `GET app/api/performance/summary` returning lever-level aggregates via `derivePerformanceSignal` (`lib/performance/feedback.ts:102`).
- **Acceptance:** calling sync fills metrics for a real linked send; summary returns `LeverStat[]` per brand; repeat calls are idempotent.
- **Verify:** unit tests with mocked SendGrid responses (fixture the documented response shape); manual run against the team's SendGrid account.
- **Note:** an Event Webhook (`POST` receiver at `app/api/webhooks/sendgrid`) is the richer long-term source (per-recipient opens/clicks with `singlesend_id`); implement it in F1.6 — polling first because it needs no SendGrid-side configuration.

### F1.4 — Feed real metrics into generation [M]
- **Why:** `performanceFeedbackPromptBlock` (`lib/performance/feedback.ts:157`) currently receives whatever the client has; it should receive DB-backed truth.
- **Files:** `app/api/generate-copy/route.ts`, `lib/generation/orchestrator.ts`, `lib/config/intelligence.ts`.
- **Do:** at generation time, server-side load the caller's last N (default 20) `send_history` rows **with metrics** for the campaign's brand, map to `SendOutcome[]` (CTR = unique_clicks/delivered — deliberately click-based, since Apple MPP inflates opens; see `docs/optimization-roadmap.md` T1-01), and pass into the prompt pipeline. Extend `derivePerformanceSignal` to emit both "lean into" (top-quartile levers) and "avoid" (bottom-quartile, min 3 samples) directives. Cap the block at ~600 tokens.
- **Acceptance:** with `AI_PROMPT_DEBUG=on`, the assembled prompt shows a "Performance signal" layer with real lever stats; generation without history behaves exactly as today.
- **Verify:** unit test `derivePerformanceSignal` quartile logic; snapshot the prompt layer with fixture history.

### F1.5 — Performance dashboard view [L]
- **Why:** the marketer should see what's winning without leaving the Studio; it also builds trust in the AI's "avoid/lean-into" steering.
- **Files:** new `app/studio/views/PerformanceView.tsx` + nav entry; uses `GET /api/performance/summary`.
- **Do:** per brand: (1) trend of click rate (clicks/delivered) over sends; (2) lever leaderboards (angle, framework, opener_mechanic, subjectStyle, hero) with sample counts; (3) A vs B win-rate table; (4) per-segment engagement comparison; (5) "insights" strip that verbalizes the current `PerformanceSignal` (the same text injected into prompts — transparency). Keep it read-only, client-rendered from the summary endpoint, styled with the existing light theme.
- **Acceptance:** view renders with real data; empty state explains how to link sends; no layout break at 1280/768 widths.
- **Verify:** manual review; component test for the empty state.

### F1.6 — Event Webhook ingestion (per-recipient granularity) [L] (P1)
- **Why:** polling gives aggregates; the Event Webhook delivers `open`/`click`/`unsubscribe`/`spamreport` events tagged with `singlesend_id` in near-real-time and enables segment-level and link-level analysis beyond what stats endpoints aggregate.
- **Files:** new `app/api/webhooks/sendgrid/route.ts`; migration `0005_send_events.sql` (`send_events(id, singlesend_id, event, email_hash, url, sg_timestamp, raw jsonb)` — store a **hash** of the recipient email, not the address, to keep PII out); `lib/sendgrid.ts`.
- **Do:** implement SendGrid's signed-webhook verification (ECDSA public key check per Twilio docs) — reject unsigned payloads; batch-insert events; nightly job folds events into `send_history` metrics. Document the SendGrid-side setup (enable webhook, subscribe engagement events) in `docs/` for the maintainer.
- **Acceptance:** signature verification rejects tampered payloads (unit test with the documented test vectors); events appear in the table from a SendGrid test send.
- **Verify:** unit tests; manual test-send.

### F1.7 — Corpus auto-refresh from winners [M] (P1)
- **Why:** `agents/analytics/extract_corpus.py` mines winning copy from static XLSX; once F1.3 knows which sends won, the app can maintain a live winner corpus and use it for few-shot exemplars (see Q3).
- **Files:** new `lib/performance/corpus.ts`; `app/api/performance/sync/route.ts`.
- **Do:** when a send's click rate lands in the brand's top quartile (min 5 sends history), store its subjects/banner/body-opener into a `winning_corpus` jsonb blob in `performance_snapshots`. Expose `getWinningExemplars(brandId, segment?)` returning up to 5 subject lines + 3 openers.
- **Acceptance:** exemplars accumulate as sends are synced; retrieval capped and deduplicated.
- **Verify:** unit tests.

---

# Phase Q — Output quality (P0/P1)

### Q1 — Enforce A/B contrast structurally, not just by retry [M] (P0)
- **Why:** today B gets one retry at temp 0.9 with a problem list; if it fails again the pair ships colliding. The retry also never tells B what A actually wrote.
- **Files:** `lib/generation/orchestrator.ts`, `lib/prompt/layers.ts` (`contrastInstruction`).
- **Do:** (1) on contrast retry, inject a **negative constraint layer** built from A's concrete output: A's subject openers (first 6 words per segment), banner main_text, body opening sentence per segment, product order — each listed under "FORBIDDEN — Option A already used these; produce structurally different alternatives." (2) Add a second retry that additionally swaps B's variety profile (`withContrastingOptionVariety`) to a fresh draw. (3) If both retries fail, surface a **blocking warning** in the output view ("Options are too similar — regenerate B") instead of silently shipping.
- **Acceptance:** simulated collision (feed A as B) triggers the forbidden layer; UI shows the blocking warning when contrast remains hard-failed.
- **Verify:** unit test the forbidden-layer builder; manual generation spot-check on 3 brands.

### Q2 — Close the validation blind spots [M] (P0)
- **Why:** the four gaps in audit §1.2.2 mean the score can be high while output violates core playbook goals.
- **Files:** `lib/prompt/validation.ts`, `lib/quality/deliverability.ts`.
- **Do:** add checks to `validateBrief`/`validateBriefPair`: (1) **segment differentiation** — pairwise trigram-overlap between segment bodies; > 60% overlap → structural flag; (2) **subject-set consistency** — same persona name or contradictory urgency across segments → cosmetic flag; (3) **deliverability integration** — run the existing deliverability heuristics and fold the result into `_score` (weight ~10%) and `_flags`; (4) **accent adherence** — `==highlight==` present in each segment body at least once, absent more than 4× → cosmetic flag.
- **Acceptance:** fixtures demonstrating each new flag; scores shift accordingly; no false positives on 3 known-good briefs from history.
- **Verify:** extend `lib/quality/validation.test.ts`.

### Q3 — Few-shot winning exemplars in the prompt [M] (P1, unlocked by F1.7)
- **Why:** models imitate examples far better than they follow adjectives. Klaviyo/Jasper-class tools all ground generation in brand exemplars.
- **Files:** `lib/prompt/layers.ts`, `lib/generation/orchestrator.ts`, seed data `lib/config/exemplars.ts` (bootstrap from `docs/corpus/*.json` until F1.7 supplies live winners).
- **Do:** new prompt layer "Winning exemplars (imitate the *shape*, never the words)": up to 5 winning subjects + 3 body openers for the brand (+ segment-specific if available). Explicitly forbid copying phrases (n-gram guard already exists in creativity scoring — extend it to check against the exemplars themselves). Budget ≤ 500 tokens; drop layer first if over prompt budget.
- **Acceptance:** prompt shows the layer when exemplars exist; creativity validator flags ≥ 4-gram matches against exemplars.
- **Verify:** prompt snapshot test + validator unit test.

### Q4 — Overrides that survive repair + per-segment steering [M] (P1)
- **Why:** audit §1.2.5 — repair passes can silently undo the user's edits; multi-segment campaigns can't steer one segment.
- **Files:** `lib/generation/repair.ts`, `lib/prompt/layers.ts`, `app/studio/views/ReviewView.tsx`, `app/api/generate-copy/route.ts` (extend `PromptOverrides` type to `{system?, user?, segments?: Record<string,string>}`).
- **Do:** (1) include the override text in `buildQualityRepairPrompt`/creative-repair prompts as immutable constraints; (2) allow an optional per-segment note (≤ 300 chars) in the review step, injected only into that segment's patch call; (3) sanitize all overrides (strip unbalanced braces/backticks, collapse whitespace) before injection.
- **Acceptance:** repair output still honors an override like "British spelling only"; per-segment note visibly steers only its segment.
- **Verify:** unit tests for sanitizer; manual generation check.

### Q5 — Kill silent fallback copy [S] (P0)
- **Why:** deadline-pressure fallbacks (audit §1.2.4) ship generic copy without the marketer noticing.
- **Files:** `lib/generation/orchestrator.ts`, `app/studio/views/OutputView.tsx`, SSE events in `app/api/generate-copy/route.ts`.
- **Do:** when `fallbackSegmentPatch` fires, (1) mark the segment in the brief (`_flags` error-tier, not advisory), (2) emit an SSE `warning` event naming the segment, (3) render a prominent per-segment "Fallback copy — regenerate this segment" badge with a one-click **segment-only regenerate** action (reuses the segment-patch path with the existing foundation — cheap and fast).
- **Acceptance:** simulated timeout produces the badge; segment regenerate replaces only that segment's subject/body.
- **Verify:** unit test the flagging; manual test with `AI_SOFT_DEADLINE_MS=1000`.

### Q6 — Model-based rubric judge (optional second opinion) [L] (P2)
- **Why:** heuristic validation can't judge persuasiveness, voice fidelity, or hook strength. A cheap-model rubric pass (Haiku-class) scoring 6 dimensions gives a quality signal heuristics can't.
- **Files:** new `lib/quality/judge.ts`, `lib/generation/orchestrator.ts` (behind `AI_JUDGE=on`, default off), output view score display.
- **Do:** single call scoring each option 1–10 on: hook strength, voice match (include brand voice + one exemplar), segment fit, urgency authenticity, spam-risk feel, CTA clarity — returns JSON with per-dimension one-line justifications. Show alongside `_score` in the output view. Never blocks; purely advisory. Consider optionally feeding the lowest dimension into the existing repair pass as its target.
- **Acceptance:** judge scores render for both options; total added latency < 10s; disabled by default.
- **Verify:** fixture test of judge JSON parsing; latency measurement in PR notes.

### Q7 — Subject-line variant expansion + picker [M] (P1)
- **Why:** research consistently shows testing 3–5 subject variants lifts open rates 5–15%; the schema already supports `body_options`/multiple subject options in patches but the UI surfaces one.
- **Files:** `lib/prompt/layers.ts` (require 3 subject/preheader pairs per segment, each using a *different* `subjectDevice`), `lib/prompt/schema.ts` + zod schema, `app/studio/views/OutputView.tsx` (variant picker per segment; picked variant flows into export/render), `lib/exportExcel.ts` (export all variants, mark the picked one).
- **Acceptance:** every segment offers 3 device-distinct subject options; picking updates preview/export; char-length rules enforced on all 3.
- **Verify:** validator test for device distinctness; manual pick-and-export.

---

# Phase U — UI/UX overhaul (P1)

### U1 — Generation experience: staged progress + partial results [M]
- **Why:** multi-segment generations take minutes; the SSE stream exists but the UI can show much more than a spinner.
- **Files:** `app/studio/hooks/useGenerationStream.ts`, `views/OutputView.tsx`.
- **Do:** (1) stage timeline UI (Foundation A → Foundation B → Segments batch 1..N → Validation → Repair) driven by existing SSE `stage`/`progress` events, with elapsed time and a soft ETA from `estimateGenerationBudget`; (2) render Option A's foundation (banner, theme, products) **as soon as its `partial` event arrives** so the marketer starts reviewing while B generates; (3) cancel button wired to `AbortController` (server already honors the signal); (4) on `error`, show the partial salvage state with a "retry remaining" action instead of losing everything.
- **Acceptance:** stages animate during a real generation; partial A visible before done; cancel stops server work.
- **Verify:** manual generation; component test with a mocked SSE stream.

### U2 — Preview upgrade: devices, dark mode, client gotchas [M]
- **Why:** `Preview.tsx` (39 lines) is a bare iframe; marketers ship to Gmail/Outlook/Apple Mail with dark-mode users at ~35%+.
- **Files:** `app/components/Preview.tsx`, `lib/render/email.ts`, `lib/cleanEmail.ts`.
- **Do:** (1) width toggle 600px / 375px (mobile) with the existing mobile-stacking CSS actually exercised; (2) dark-mode simulation toggle that applies the same `DARK_MODE_BLOCK` overrides `cleanEmail.ts` injects, so the preview matches reality; (3) an "email-client gotchas" checklist panel derived statically from the HTML (image-only CTA? total size > 102KB Gmail clipping threshold? missing alt-text count? link count); (4) side-by-side A/B preview mode.
- **Acceptance:** toggles work on all four brands; clipping warning fires on an oversized fixture; A/B side-by-side scrolls in sync.
- **Verify:** manual matrix (4 brands × 2 widths × dark/light); unit test the gotcha checks.

### U3 — Wizard flow polish [M]
- **Why:** agent audit found no auto-advance, weak step-completion signaling, and Step 4 (Ops) overload; `docs/IMPLEMENTATION-PLAN-2026-07.md` T4.x started this — finish it.
- **Files:** `app/studio/views/BuildWizard.tsx`, `app/studio/ui/*`.
- **Do:** (1) per-step completion checkmarks + a sticky mini-progress rail (steps 1–6, click to jump); (2) auto-advance on step completion with a "stay" affordance; (3) inline validation at the field (subject count limits, segment subset rule, 7+ product rejection) *before* review, mirroring server rules from one shared module so they can't drift; (4) a compact **brief summary card** pinned in review/output (brand, date, offer, segments, products) so context never scrolls away; (5) "Duplicate last campaign" quick-start that pre-fills from the newest `saved_versions` row.
- **Acceptance:** a new user can complete a brief without scrolling confusion; all client-side validations match server behavior (shared constants).
- **Verify:** manual walkthrough; unit test the shared validation module.

### U4 — Draft/version robustness [S]
- **Why:** localStorage-only autosave loses work across devices; BriefView undo/redo dies on refresh.
- **Files:** `app/studio/hooks/useDraftPersistence.ts`, `lib/history.ts`, `app/components/History.tsx`.
- **Do:** (1) debounce-autosave the in-progress **draft** to Supabase (new `kind: 'draft'` flag on `saved_versions`, keep only latest per user/brand); (2) restore prompt on login ("Resume draft from …?"); (3) persist BriefView undo stack into the draft payload (cap 20 entries); (4) History list: add search + brand filter + relative dates.
- **Acceptance:** kill the tab mid-edit, reopen on another browser, resume works; undo survives refresh.
- **Verify:** manual; unit test the draft reducer.

### U5 — Accessibility & responsive pass (app UI) [M]
- **Why:** agent audit: contrast issues, missing focus management in accordions, no keyboard path through the wizard; the app is desktop-only in practice but breaks awkwardly below ~1024px.
- **Files:** `app/studio/**`, `app/globals.css`, `app/components/*`.
- **Do:** (1) keyboard: accordion headers as `<button aria-expanded>`, focus moves into newly opened step, Escape closes modals, visible focus rings; (2) contrast: audit the light palette tokens in `globals.css` to WCAG AA (4.5:1 body text); (3) `aria-live="polite"` on generation progress and toast regions; (4) responsive: single-column wizard below 1024px, output view stacks A above B; (5) label every icon-only button.
- **Acceptance:** axe-core browser scan shows no serious/critical violations on the three views; full keyboard walkthrough possible.
- **Verify:** run axe DevTools; document results in PR.

### U6 — Error surfaces & empty states [S]
- **Why:** silent async failures (scrape, tone-extract, auth refresh) leave users guessing.
- **Files:** `app/studio/**`, new `app/studio/ui/Toast.tsx` (or adopt `sonner` — confirm dependency with maintainer), `app/error.tsx`, `app/studio/error.tsx` boundaries.
- **Do:** every fetch surfaces failure as a toast with a retry action; scrape failures show inline "couldn't extract — paste USPs manually" fallback UI; add React error boundaries per view with a "report" link (Sentry event id once R5 lands); design empty states for History, Performance, and Output (pre-generation).
- **Acceptance:** killing the network mid-action always produces visible, actionable feedback; no console-only errors.
- **Verify:** manual with network throttling/offline.

---

# Phase F2 — Feature expansion (P1/P2, tiered by effort)

## Tier 1 — high value, fits current stack

### F2.1 — Send & schedule from the Studio (complete the SendGrid loop) [L] (P1)
- **Why:** today the flow dead-ends at "Design created — go finish in SendGrid." Creating the Single Send from the app removes the manual step **and** guarantees the `singlesend_id` linkage F1 depends on.
- **Files:** `lib/sendgrid.ts` (add `createSingleSend` → `POST /v3/marketing/singlesends` with design/template + list ids, `scheduleSingleSend` → `PUT .../schedule`, `listContactLists` → `GET /v3/marketing/lists`), new `app/api/sendgrid/singlesend/route.ts` (auth + rate-limited), output-view "Create Single Send" modal (pick list/segment, send now or schedule, per option A/B).
- **Do:** guard with an explicit confirmation step showing audience size; write the returned `singlesend_id` straight into `send_history` (replaces the manual paste from F1.2).
- **Acceptance:** a brief can go from generate → preview → scheduled Single Send without leaving the app; linkage row created automatically.
- **Verify:** mocked-client tests; one real scheduled-then-cancelled send on the team account.

### F2.2 — Reusable module/template library [L] (P1)
- **Why:** research on modern builders: reusable content blocks and starting templates are the single most-used builder feature. The renderer already supports `moduleLayout` sequences (`lib/render/email.ts:38,489`) — this productizes it.
- **Files:** migration `0006_templates.sql` (`saved_templates(id, user_id, brand_id, name, kind ('module_layout'|'campaign_preset'), payload jsonb, created_at)`), `lib/history.ts` pattern reused, new library picker in the build wizard + "Save as template" in output view.
- **Do:** save/recall (1) module layout sequences, (2) full campaign presets (offer type, urgency, segments, product slots, copy style). Ship 3–4 seeded presets per brand derived from the winning patterns in `docs/email-campaign-playbook.html`.
- **Acceptance:** create → save → recall round-trips; presets pre-fill the wizard correctly per brand.
- **Verify:** unit test payload round-trip; manual.

### F2.3 — Segment-level regenerate & copy remix in output [M] (P1)
- **Why:** today a weak segment means regenerating the whole A/B run (minutes + cost). The segment-patch architecture makes surgical regeneration cheap. (Q5 builds the mechanism for fallbacks; this generalizes it.)
- **Files:** new `app/api/regenerate-segment/route.ts` (reuses foundation + single segment patch call), output view per-segment "Regenerate" + quick-steer chips ("shorter", "more urgency", "different opener", "new testimonial") that map to bounded prompt notes.
- **Acceptance:** regenerating segment 22 changes only segment 22; result re-validated; history of the previous copy kept (one-step revert).
- **Verify:** integration test with mocked provider; manual.

### F2.4 — Brand-adaptive dark-mode rendering [M] (P1)
- **Why:** the injected dark block is a generic gray overlay; brand accents/logos can become illegible — a 2026 table-stakes email concern.
- **Files:** `lib/cleanEmail.ts` (parameterize `DARK_MODE_BLOCK` by brand accent + accentRange), `lib/render/email.ts` (ensure logos have transparent-safe variants or a dark-mode-friendly background chip), `lib/config/brands.ts` (optional `darkAccent` per brand).
- **Acceptance:** dark preview (U2) shows accessible accent contrast for all 4 brands; light rendering unchanged byte-for-byte when feature not configured.
- **Verify:** contrast-check computed colors in a unit test; visual matrix.

### F2.5 — Email a11y & weight hardening (deliverability adjacent) [S] (P1)
- **Why:** 2026 guidance: inbox providers increasingly weight accessibility/semantic signals; Gmail clips messages > 102KB.
- **Files:** `lib/render/email.ts`, `lib/cleanEmail.ts`, `lib/prompt/layers.ts`.
- **Do:** (1) require model-generated `alt_text` to be descriptive (validator: non-empty, ≠ product name, ≤ 120 chars); (2) add `lang` attr, `role="presentation"` on layout tables, aria-labels on CTA links; (3) size guard in the sync pre-gate: warn > 90KB, block > 102KB; (4) semantic heading (`<h1>` visually styled as today) for the banner main text.
- **Acceptance:** rendered HTML passes the new pre-gate checks; SendGrid round-trip (import → editor → export) still works.
- **Verify:** extend `lib/cleanEmail.test.ts`; manual SendGrid import.

## Tier 2 — bigger bets

### F2.6 — Native A/B via SendGrid + automatic winner learning [L] (P2, needs F2.1)
- **Why:** the app generates A/B but the test itself is manual. Creating **two** Single Sends (or SendGrid's native ab_test single send) with a holdout, then letting F1's stats sync declare the winner, closes A/B end-to-end and feeds `send_history.option_key` win-rates.
- **Do:** "Launch A/B test" action → creates both sends against a split of the chosen list; after stats sync, mark winner on the pair; PerformanceView shows cumulative A-vs-B lever learnings.
- **Acceptance:** one click launches both; winner auto-marked after sync threshold (e.g., 24h + min sample).

### F2.7 — AI image generation for banners/products [XL] (P2)
- **Why:** `image_guidance`/`image_notes` fields already describe desired imagery; marketers currently source images manually. Generating on-brand banner imagery (or product-scene composites) removes the last manual asset step.
- **Do:** new `app/api/generate-image/route.ts` behind a provider adapter (Gemini image model or OpenAI gpt-image — pick per cost; key infra already exists); prompt = brand palette + `image_guidance`; store in Supabase Storage; wire into `ImageEditor.tsx` as "Generate" alongside URL paste. Guardrails: no faces of real people, brand-safe styles list per brand.
- **Acceptance:** generate → appears in slot → renders in preview/export; images persisted with public CDN URLs.

### F2.8 — Multi-language / locale variants [L] (P2)
- **Why:** cheap market expansion: same brief, per-locale copy generation with locale-aware urgency and idiom rules.
- **Do:** `Campaign.locale` (default en); prompt layer with locale rules (no literal translation of puns; currency/date formats); per-locale exports. Start with 1–2 locales the business actually sends to (confirm with maintainer).

### F2.9 — Team collaboration: comments & approvals [XL] (P2)
- **Why:** briefs go marketer → designer → approver over Slack today; in-app threads + an approval state machine (draft → in-review → approved → synced) keeps context attached to the brief.
- **Do:** migration for `comments(version_id, author, body, resolved)` + `saved_versions.status`; comment pins on brief sections; share-link (read-only view for a designer). Requires multi-user access to a version — extend RLS with an org/team concept (bigger design; write an ADR first, see `engineering:architecture` conventions).

### F2.10 — Flow/sequence builder (welcome, winback, post-purchase) [XL] (P2)
- **Why:** `docs/optimization-roadmap.md` shows flows (welcome, winback, anniversary) are where the biggest untapped revenue sits (T1-03, T1-06). Today the Studio only does one-off campaigns.
- **Do:** new campaign kind `flow`: N-step sequence with per-step timing/exit conditions; one foundation + per-step patches (the layered architecture extends naturally — a step is a segment-like unit); export as a set of SendGrid Dynamic Templates + a runbook page documenting the flow settings (SendGrid Automations API support can come later).
- **Acceptance:** a 3-email welcome flow generates with coherent narrative arc across steps and distinct hooks per step.

### F2.11 — Inline visual email editing (drag/resize, module reorder UI) [XL] (P2)
- **Why:** builder-market research: visual inline editing with live preview is now the expected UX. A full drag-drop canvas is huge; the pragmatic version reorders existing modules and edits text inline.
- **Do:** stage 1: drag-to-reorder of the `moduleLayout` sequence with instant re-render (renderer already supports arbitrary sequences); stage 2: contenteditable overlays on preview mapped back to `GenBrief` fields (subjects, banner text, body paragraphs) with two-way sync to BriefView. Skip free-form canvas editing — SendGrid's editor already covers that post-sync.

### F2.12 — Interactive/AMP & kinetic email experiments [L] (P2, exploratory)
- **Why:** 2026 trend: AMP/interactive carousels and in-inbox actions raise engagement, but AMP requires sender registration with Google and SendGrid AMP support is limited — treat as an experiment, not a roadmap commitment.
- **Do:** start with **CSS-only kinetic modules** (checkbox-hack carousels/hover states with static fallback for Outlook) as optional module types in the renderer; measure via F1 click data before investing further.

---

# Sequencing & dependency map

```
R1 → R2 → R4          (mechanical splits, then tests)
R3 (parallel to R1/R2) → U1..U6 (all UI work after the split)
R5, R6                (independent, anytime)
F1.1 → F1.2 → F1.3 → F1.4 → F1.5   (the loop, strictly ordered)
F1.3 → F1.6, F1.7
F1.7 → Q3 ;  Q1, Q2, Q5 anytime after R1 ;  Q4, Q7 after R1 ;  Q6 last in Q
F2.1 → F2.6 ;  F1.5 before F2.6 ;  F2.2/F2.3/F2.4/F2.5 after R-phase ;  Tier-2 in listed order of value
```

**Suggested milestones**
1. **M1 (foundation):** R1, R2, R4, R5, R6, Q5 — repo is safe to iterate on, silent failures gone.
2. **M2 (the loop):** F1.1–F1.5, F2.1 — generate→send→measure→learn works end to end. *Biggest business value.*
3. **M3 (quality):** Q1, Q2, Q7, F1.6, F1.7, Q3, Q4 — data-driven, exemplar-grounded, contrast-guaranteed output.
4. **M4 (experience):** R3, U1–U6, F2.2, F2.3 — the app feels like a product.
5. **M5 (expansion):** F2.4–F2.12 picked by appetite, F2.6 and F2.10 first.

# Open questions for the maintainer (answer before the relevant ticket)
1. New dependencies OK? (`zod`, `zustand`, `@sentry/nextjs`, toast lib) — R3/R5/R6/U6.
2. Does the SendGrid key have Marketing **read** scopes for stats endpoints? — F1.3.
3. Can the maintainer configure the SendGrid Event Webhook + signed-webhook key? — F1.6.
4. Which image-gen provider/budget, and where do generated assets live (Supabase Storage bucket)? — F2.7.
5. Which locales matter for F2.8? Is a team/org model desired (affects RLS redesign) for F2.9?
6. Is revenue attribution available anywhere (Shopify/store analytics) to enrich `send_history.revenue`? — would upgrade F1.4's signal from clicks to money.

# Research sources
- SendGrid Single Send stats: https://docs.sendgrid.com/api-reference/marketing-campaign-stats/get-single-send-stats-by-id · click stats: https://docs.sendgrid.com/api-reference/marketing-campaign-stats/get-single-send-click-tracking-stats-by-id · Event Webhook: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event · Engagement Quality API: https://www.twilio.com/docs/sendgrid/api-reference/sendgrid-engagement-quality-api
- AI email tooling landscape (Klaviyo AI autonomous features, exemplar-grounded generation, subject-line testing lift): https://www.klaviyo.com/blog/klaviyo-ai-for-autonomous-marketing-and-customer-service · https://www.sequenzy.com/blog/best-ai-email-copywriting-tools · https://mailflowauthority.com/ai-email/ai-email-tools-compared
- 2026 email design/deliverability (accessibility-as-deliverability, dark mode, Gmail clipping, kinetic/AMP): https://emfluence.com/blog/email-accessibility-and-design-best-practices-in-2026 · https://www.litmus.com/blog/trends-in-email-marketing · https://www.enchantagency.com/blog/dark-mode-email-design-best-practices-css-guide-2026 · https://stripo.email/email-marketing-and-design-trends-2026/
- Builder UX patterns (reusable modules, inline editing, live device preview): https://thecmo.com/tools/best-drag-and-drop-email-builder/ · https://www.emailtooltester.com/en/blog/email-template-builders/

