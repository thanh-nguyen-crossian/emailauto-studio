# EmailAuto Studio — Improvement Plan (2026-06-24)

> **Audience:** an autonomous coding agent (Codex / Claude Code) or a contributor.
> **How to use this doc:** Work top-to-bottom by phase. Each task is self-contained with a
> **Problem → Change → Files → Acceptance criteria → Effort** block. Before any commit run
> `npm run typecheck && npm run build` (a.k.a. `npm run check`). Do **not** deploy — open a PR
> (see `CLAUDE.md → Deploy`).
> **Supersedes / consolidates:** `docs/optimization-roadmap.md`, `docs/QUALITY_OVERHAUL_PLAN.md`,
> `docs/COPY_QUALITY_AND_TECHNIQUE_PLAN.md`, `docs/enhancement-plan-2026-06-18.md`,
> `docs/improvement-plan-2026-06-16.md`. Where those still hold, this doc points to them.

---

## 0. Current state (grounded in the code, June 2026)

**Generation pipeline** (`lib/anthropic.ts`, 1,677 lines; `lib/briefgen.ts`, 3,009 lines):

- `generateOptions()` (anthropic.ts:1666) dispatches to **batched** (`generateOptionsBatched`,
  :1522) when there are no prompt overrides and `segments.length >= SEGMENT_BATCH_THRESHOLD`
  (default **1**), otherwise to **single/monolithic** (`generateOptionsSingle`, :1365).
- Batched path: two foundations in parallel (`createOptionFoundation`, :1492; 14k output cap) →
  segment patches chunked by `SEGMENT_BATCH_SIZE` (default 1) run at `SEGMENT_BATCH_CONCURRENCY`
  (default 2) → merge → optional contrast retry of Option B only.
- Single path: one giant system+user prompt (`buildSystemPrompt` briefgen.ts:1769,
  `buildUserPrompt` :1933) → one JSON brief per option (32k output cap) → optional repair pass.
- Provider timeout `AI_PROVIDER_TIMEOUT_MS` = **145s**; `AI_PROVIDER_RETRIES` = **2**; Claude
  streams by default. Route `maxDuration = 300` (`app/api/generate-copy/route.ts:26`).
- **Client** (`app/studio/StudioApp.tsx:642`) does **one fetch**, `await res.text()`, no streaming,
  no progress channel. On 504 it shows a static "reduce segments / use a faster model" message.
  (`maxDuration = 300` is at `route.ts:24`.)

**The timeout root cause (confirmed):**

1. The response is delivered as a **single non-streamed POST**. Even though work is internally
   chunked, the client gets nothing until the whole A+B pair is done, so the whole job must fit in
   one 300s function invocation, and any intermediate proxy/idle limit can drop it.
2. **Custom prompt overrides force the monolithic single path** (anthropic.ts:1667). Two sequential
   full-brief calls + up to two repair passes = 240–360s → over the 300s ceiling.
3. **Provider retries stack**: worst case 145s × 3 attempts on one leg alone.
4. Output caps are high (32k single / 14k foundation) → long token-generation time.

**UI** (`app/studio/StudioApp.tsx`, **1,972 lines**, monolith; `app/studio/StudioPanels.tsx`,
**1,277 lines**, 28-component barrel; `app/components/BriefView.tsx`, 854 lines):

- View 2 "Review & Generate" (StudioApp.tsx:1559–1682) stacks **five** info/warning panels, then
  model selectors, then the budget estimate **below** the selectors, then a hidden "Advanced
  prompts" collapse, then the Generate button, then the progress indicator **dead last**. No clear
  hierarchy; the cost estimate appears after you've already chosen models; progress is off-screen.
- Progress UI (`GenerationProgress`, StudioPanels.tsx:58) is a spinner + elapsed seconds + 3 coarse
  time-bucketed strings. No real per-stage / per-segment progress because there's no server channel.
- Styling mixes Tailwind utilities, ~100 custom CSS classes, and inline `style={{…}}` with hardcoded
  hex colors (e.g. StudioPanels.tsx:871) — inconsistent.

**Stack:** Next.js 15 App Router, React 19, Tailwind v4, Supabase, SendGrid, `jszip`. ~17.5k LOC in
`lib` + `app`. No test runner in `package.json` (scripts: dev/build/start/lint/typecheck/check).

---

## Phase ordering (recommended)

| Phase | Theme | Why first |
|---|---|---|
| **P0** | Generation reliability & speed (streaming + job model) | Fixes the #1 pain; unblocks better progress UX |
| **P1** | Step-2 (Review & Generate) UX redesign | Highest-visibility friction; pairs with P0 progress channel |
| **P2** | Output quality | Compounding value once runs are reliable |
| **P3** | Size & speed optimization (refactor, bundle) | Maintainability; lowers risk of later work |
| **P4** | New features | Build on a stable base |
| **P5** | Testing & observability (cross-cutting) | Lock in the gains |

Each phase is independently shippable. Do P0.1 before anything else.

---

# P0 — Generation reliability & speed

Goal: **no run ever dies from a timeout**, and the user sees continuous progress.

### P0.1 — Stream progress with Server-Sent Events (or chunked NDJSON)

**Problem.** The single buffered POST means the client waits blind for up to 5 minutes and the whole
job must complete in one invocation. Vercel explicitly recommends streaming for AI workloads;
streaming also resets idle/proxy timers via data flow.

**Change.**
- Convert `app/api/generate-copy/route.ts` to return a `ReadableStream` (`Content-Type:
  text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`). Emit
  structured events as work completes: `stage` (foundation_a, foundation_b, segment_patch,
  merge, repair, contrast_retry), `progress` ({done, total}), `partial` (Option A ready before B),
  `warning`, `done` ({a,b}), `error`.
- Emit a **heartbeat event every ~5s** while a provider call is in flight (research note: app
  heartbeat must beat the ~25s TCP keepalive / proxy idle window — 5s is safe; 30s is not).
- Thread a callback (`onEvent`) through `generateOptions` → `generateOptionsBatched` /
  `Single` so each foundation/patch/merge step reports as it finishes. The internal chunking
  already exists (anthropic.ts:1548–1576) — just surface it.
- Rewrite the client `generate()` (StudioApp.tsx:642) to consume the stream (`fetch` + `getReader`,
  or `EventSource` for a GET variant), updating a real progress model and rendering **Option A as
  soon as it lands** while B continues.

**Files.** `app/api/generate-copy/route.ts`, `lib/anthropic.ts` (add `onEvent` param to
`generateOptions`, `generateOptionsBatched`, `generateOptionsSingle`, foundation/patch helpers),
`app/studio/StudioApp.tsx`, `app/studio/StudioPanels.tsx` (`GenerationProgress`).

**Acceptance criteria.**
- A multi-segment run streams stage events visible in the UI within a few seconds of clicking
  Generate.
- Option A renders before Option B finishes (progressive reveal).
- Killing the network mid-run surfaces a clear, retryable error (not a silent hang).
- `npm run check` passes; existing non-streaming callers (if any) still work or are migrated.

**Effort.** L (1.5–2.5 days). **This is the single highest-value change.**

---

### P0.2 — Make foundations + patches the only path; never force monolithic

**Problem.** Custom prompt overrides force `generateOptionsSingle` (anthropic.ts:1667), the slowest,
most timeout-prone branch. The decision also hinges on a confusingly-named threshold default of 1.

**Change.**
- Allow the layered (foundation+patch) path to run **even with prompt overrides** by injecting the
  user's edited system/user text into the foundation and patch prompt builders instead of bypassing
  them. If full structural override is truly needed, cap it (see P0.3) rather than letting it run
  unbounded.
- Rename/clarify `SEGMENT_BATCH_THRESHOLD` semantics in code comments and `CLAUDE.md` (it gates
  "use layered generation at/above N segments"; default 1 = always-on). Consider defaulting
  `AI_AB_FAST_PARALLEL` reasoning explicitly in the doc.
- Keep `generateOptionsSingle` only as an explicit fallback for 1 segment + override.

**Files.** `lib/anthropic.ts:1666–1677` (dispatch), `lib/briefgen.ts` (prompt builders to accept
override fragments), `CLAUDE.md` (env var table + generation flow section).

**Acceptance criteria.** A run with edited prompts and ≥2 segments uses the layered path; total wall
time and per-call output sizes are bounded; contrast clause still applied to B.

**Effort.** M (1 day).

---

### P0.3 — Bound the work per invocation (caps + adaptive batch sizing)

**Problem.** 32k single-call output and unbounded segment counts make worst-case latency unbounded.

**Change.**
- Lower default `AI_MAX_OUTPUT_TOKENS` for the single path (e.g. 16–20k) and document that the
  layered path is preferred. Keep foundation/patch caps.
- Make `SEGMENT_BATCH_SIZE` / `SEGMENT_BATCH_CONCURRENCY` **adaptive** to selected model speed:
  faster models (Haiku, Flash/Lite, GPT-mini) → larger batches / higher concurrency; frontier
  models (Opus, Pro, GPT frontier) → smaller batches so each call stays well under the provider
  timeout. Encode a small per-model "speed tier" in `lib/config/aiModels.ts`.
- Add a server-side **soft deadline** (e.g. 240s): if approaching it, stop launching new patches,
  return whatever is complete with a `partial: true` warning rather than letting the function die.

**Files.** `lib/config/aiModels.ts` (speed tier metadata), `lib/anthropic.ts` (adaptive chunking +
soft deadline), env defaults + `CLAUDE.md`.

**Acceptance criteria.** With the slowest model pair and the max allowed segments, a run either
completes or returns a usable partial result with a clear warning — it never returns a 504 HTML page.

**Effort.** M (1 day).

---

### P0.4 — Tune retries so they can't blow the budget; salvage partials

**Problem.** `AI_PROVIDER_RETRIES=2` × 145s can consume the whole budget on one failing leg.

**Change.**
- Make retry backoff **deadline-aware**: don't start a retry that can't finish before the soft
  deadline. Reduce `AI_PROVIDER_TIMEOUT_MS` for patch calls (they're small) vs foundations.
- On a failed Option B, still return Option A (already partially supported — make it explicit and
  surfaced in the stream as `partial`).

**Files.** `lib/anthropic.ts` (`createTextWithProviderRetry` :219, foundation/patch callers).

**Acceptance criteria.** A simulated slow provider yields a partial A result + warning instead of a
hard timeout. Unit-style check (P5) covers the deadline math.

**Effort.** S (0.5 day).

---

### P0.5 — (Optional, larger) Durable job + poll/resume

**Problem.** Even streaming caps you at one invocation's wall-clock. For very large sends or
flaky networks, a durable job survives reconnects and lets users leave and come back.

**Change.** Introduce a job record (a new Supabase table `generation_jobs`: id, user_id, status,
input, partial_result, events[], created_at) written as stages complete. `POST /generate-copy`
enqueues + streams; a `GET /generate-copy/:jobId` streams/polls existing job state so a refresh
resumes. Consider Vercel Fluid Compute (Pro: up to 800s `maxDuration`) and/or a queue (Inngest /
Upstash QStash) if multi-minute frontier runs remain common.

**Files.** `supabase/migrations/0003_generation_jobs.sql`, `app/api/generate-copy/*`,
`lib/jobs.ts` (new), `lib/anthropic.ts` (write events), client resume logic.

**Acceptance criteria.** Refreshing mid-generation rejoins the run and shows current progress;
completed jobs are retrievable. RLS scopes jobs per user.

**Effort.** XL (2–4 days). **Do only if P0.1–P0.4 don't fully resolve the pain.** Decision gate:
ship P0.1–P0.4, measure, then decide.

---

# P1 — Step 2 "Review & Generate" UX redesign

Goal: a calm, scannable screen where the path to "Generate" is obvious and cost is known *before*
choosing models.

### P1.1 — Restructure Review into two clear zones + a sticky action bar

**Problem.** Five stacked panels, scattered warnings (StudioApp.tsx:1598–1619), budget below model
picker, hidden advanced prompts, off-screen progress.

**Change.** Reorganize `ReviewView` into:
1. **"Ready to generate" header** — one-line plain summary ("2 options × 3 segments × 5 products,
   est. ~90s, ~$0.04") with the **Generate** button in a **sticky bottom action bar** always visible.
2. **Left column: setup** — model selectors with the **budget/time estimate inline beside each
   selector** (move `GenerationBudgetPanel` up so cost is visible at choice time), then a collapsed
   "Advanced prompts" accordion.
3. **Right column: pre-flight** — collapse the QA panels (Perf, WinTemplateRhythm, PlaybookChecklist,
   OpsReadiness, pre-flight summary) into a **single "Pre-flight" card with a status chip**
   (green/amber) that expands on demand. Surface only blocking issues by default.
4. **Consolidate the five banners** into one contextual notice area with severity styling.

**Files.** `app/studio/StudioApp.tsx:1559–1682`, `app/studio/StudioPanels.tsx`
(`GenerationBudgetPanel`, `ModelSelector`, banners), `app/globals.css` (sticky action bar).

**Acceptance criteria.** Generate button reachable without scrolling on a laptop; model cost
estimate visible at the moment of model choice; only blocking pre-flight issues show by default;
all current functionality preserved.

**Effort.** M–L (1.5 days).

---

### P1.2 — Real progress UX (depends on P0.1)

**Change.** Replace the time-bucket strings in `GenerationProgress` (StudioPanels.tsx:58) with a
**stepper/progress bar** driven by P0.1 events: "Foundations ✓ → Segments 3/5 → Merge → Done", plus
elapsed time and a working Cancel. Show Option A the instant it streams in. Pin the progress
component to the top of the view (or in the sticky bar) instead of the page bottom.

**Files.** `app/studio/StudioPanels.tsx`, `app/studio/StudioApp.tsx`.

**Acceptance criteria.** Progress reflects actual server stages; no static guess strings; Cancel
aborts the stream.

**Effort.** S–M (0.5–1 day).

---

### P1.3 — Styling consistency pass

**Change.** Replace inline hardcoded colors (e.g. StudioPanels.tsx:871 `#fef9c3`, scattered
`style={{ color: "var(--ok)" }}`) with semantic CSS classes/utility tokens. Document the component
class vocabulary in `STUDIO.md`. Optional: use the `theme-factory` / `brand-guidelines` skill to
standardize spacing/typography.

**Files.** `app/globals.css`, `app/studio/StudioPanels.tsx`, `app/components/*`, `STUDIO.md`.

**Acceptance criteria.** No hardcoded hex in component JSX; consistent panel/card/banner styling;
visual regression eyeballed via screenshots.

**Effort.** S (0.5 day).

---

### P1.4 — Accessibility audit (use `design:accessibility-review`)

**Change.** Run a WCAG 2.1 AA pass on the three views: color contrast of accent/muted tokens, focus
states on the custom `.choice-card`/`.step-button` controls, keyboard nav through the wizard,
`aria-live` on progress (already partly present), and touch targets.

**Files.** `app/globals.css`, `app/studio/*`, `app/components/*`.

**Acceptance criteria.** Audit checklist passes or documents accepted exceptions.

**Effort.** S (0.5 day).

---

# P2 — Output quality

Goal: more on-brand, higher-converting copy + design briefs, with fewer repair passes needed.
(Cross-reference `docs/QUALITY_OVERHAUL_PLAN.md` and `docs/playbook-rules.md` for existing rules.)

### P2.1 — Strengthen A/B contrast and reduce contrast-retry frequency

**Problem.** Contrast retry (anthropic.ts:1594) is expensive and only fires after the fact.

**Change.** Make Option B's foundation prompt receive an explicit, structured "diverge on:
angle + framework + hook mechanic + lead product" instruction derived from A's foundation, so B
diverges on the first pass. Keep `validateBriefPair` as the safety net but expect fewer retries.

**Files.** `lib/briefgen.ts` (`contrastInstruction` :1764 and foundation builder),
`lib/anthropic.ts` (pass A's foundation summary into B's foundation prompt — partly done; make it
structured, not prose).

**Acceptance criteria.** On a sample of N runs, contrast-retry rate drops measurably; A/B remain
clearly distinct (validate via `validateBriefPair` flags).

**Effort.** M (1 day).

---

### P2.2 — Tighten the validation → targeted repair loop

**Change.** Audit `validateBrief` (briefgen.ts) flag taxonomy; ensure subject 42–58/≤60, preheader
60–90, `{{first_name}}` in exactly one of subject/preheader, spam-word and `$`→`💲` / `off`→`o.f.f`
rules, and "no invented proof" are all enforced and that **high-impact** flags reliably trigger the
targeted repair (anthropic.ts `repairBriefIfNeeded` :1332) rather than a full rewrite. Add any
missing playbook rules from `docs/playbook-rules.md`.

**Files.** `lib/briefgen.ts` (validators), `lib/anthropic.ts` (repair flag selection).

**Acceptance criteria.** Seeded bad briefs (wrong subject length, spam word, invented review) are
caught and repaired; repair never makes score worse (existing `shouldKeepRepair` guard verified).

**Effort.** M (1 day).

---

### P2.3 — Brand-voice grounding from real performance data

**Change.** `lib/config/intelligence.ts` already feeds perf data into prompts
(`intelligencePromptBlock`). Extend it with concrete winning-copy exemplars per brand/segment
(short, anonymized) so the model has positive few-shot anchors. Source exemplars from
`docs/email-performance-analysis.md` / `agents/analytics` outputs. Optionally apply the
`review-audit` skill to mine customer-review language into a VOC bank per brand.

**Files.** `lib/config/intelligence.ts`, `lib/config/brands.ts` (optional exemplar field),
`lib/briefgen.ts` (inject exemplars).

**Acceptance criteria.** Prompts include 1–2 high-performing exemplars per active brand without
exceeding the `PROMPT_BUDGET_SYSTEM` (briefgen.ts:24) ceiling; `AI_PROMPT_DEBUG=on` shows no
regression warning.

**Effort.** M (1–1.5 days).

---

### P2.4 — Self-evaluation / scoring pass (optional, cheap-model)

**Change.** Add an optional fast-model "editor" pass that scores each option against the playbook
and rewrites only the weakest field(s), gated behind an env flag and the soft deadline (P0.3) so it
never threatens the timeout budget. Reuse the existing `_score` machinery.

**Files.** `lib/anthropic.ts`, env flag in `CLAUDE.md`.

**Acceptance criteria.** With the flag on, average `_score` improves on a sample set; with it off,
behavior is unchanged.

**Effort.** M (1 day).

---

# P3 — Project size & speed optimization

Goal: smaller, faster bundles and maintainable modules. (See `docs/optimization-roadmap.md`.)

### P3.1 — Break up the two monoliths

**Problem.** `StudioApp.tsx` (1,972 lines) and `StudioPanels.tsx` (1,277 lines, 28 exports) are hard
to reason about and bloat the client bundle.

**Change.** Extract per-view logic into `app/studio/views/BuildView.tsx`/`ReviewView.tsx`/
`OutputView.tsx` (currently 4–5 line shells) and split `StudioPanels.tsx` into a `panels/` folder
(one component per file, re-exported via an index). Keep the reducer in a dedicated hook file. No
behavior change — pure refactor, do it incrementally with `npm run check` between each move.

**Files.** `app/studio/StudioApp.tsx`, `app/studio/views/*`, new `app/studio/panels/*`,
`app/components/BriefView.tsx` (split editor logic from rendering).

**Acceptance criteria.** No single component file > ~400 lines; `npm run check` green; bundle output
size not increased (ideally reduced via better code-splitting).

**Effort.** L (2 days).

---

### P3.2 — Code-split heavy/optional UI

**Change.** Lazy-load (`next/dynamic`) the Output-only and admin-only surfaces: `BriefView`,
`AdminPanel`, `History`, compare-mode previews. They aren't needed for the Build/Review path.

**Files.** `app/studio/StudioApp.tsx`, component imports.

**Acceptance criteria.** Build/Review initial JS shrinks (measure with `next build` output);
Output/admin still work.

**Effort.** S (0.5 day).

---

### P3.3 — Trim prompt token cost

**Change.** With `AI_PROMPT_DEBUG=on`, profile system/user prompt sizes (briefgen.ts:24 budget).
De-duplicate static playbook text into a cached/`cache_control` system block (Claude prompt caching
is already used at anthropic.ts:339 — extend to the heavy static playbook portion) so repeated runs
re-use cached tokens, cutting latency and cost.

**Files.** `lib/briefgen.ts`, `lib/anthropic.ts` (cache_control coverage).

**Acceptance criteria.** Measured input-token reduction on repeat runs; no prompt-budget regression.

**Effort.** S–M (0.5–1 day).

---

### P3.4 — Repo hygiene

**Change.** The Google-Drive-synced folder contains build artifacts (`*.pack.gz`,
`*_client-reference-manifest.js`) — confirm `.next/` and build output are gitignored and not synced
into the repo. Audit `docs/` for the several overlapping plan docs and add a short `docs/README.md`
index pointing to the current canonical ones (this file).

**Files.** `.gitignore`, `docs/README.md` (new).

**Acceptance criteria.** No build artifacts tracked; docs index exists.

**Effort.** S (0.25 day).

---

# P4 — New features (prioritized backlog)

Pick per business value; none block the above. (See also `docs/ab-testing-plan.html`.)

### P4.1 — Performance feedback loop (highest leverage)
Pull SendGrid/ESP open & click stats back into the app keyed by the campaign/segment that produced
each send, and feed real winners into `intelligence.ts` (P2.3). Closes the create→measure→learn
loop. A **Klaviyo connector** is available (`plugin_marketing_klaviyo`) if the brands use Klaviyo —
suggest connecting it for engagement data. **Effort:** L.

### P4.2 — Subject-line / preheader A/B/n variant generator
Generate 3–5 subject+preheader candidates per segment with predicted-strength scoring, exportable as
an A/B test setup (aligns with the existing SendGrid Dynamic Template flow). **Effort:** M.

### P4.3 — Saved campaign templates & duplication
Let users save a finished brief as a reusable starting template (extends `lib/history.ts` /
`saved_versions`). Speeds repeat campaigns. **Effort:** M.

### P4.4 — Scheduling & recurring briefs
Use the scheduled-tasks capability to auto-draft a weekly brief per brand for human review.
**Effort:** M.

### P4.5 — Inline live preview while editing the brief
Re-render the email preview live as `BriefView` fields change (debounced) instead of after save.
**Effort:** S–M.

### P4.6 — Multi-language / localization of segments
For brands with non-US audiences, add a locale field that adjusts copy language while preserving
playbook rules. **Effort:** M.

### P4.7 — Image generation hook
Generate hero/product imagery suggestions or AI images into the design brief (the workspace has an
image-gen path). **Effort:** M.

---

# P5 — Testing & observability (cross-cutting; do alongside P0–P2)

### P5.1 — Add a test runner + unit tests for pure logic
**Problem.** No test script today. **Change.** Add Vitest; unit-test the deterministic cores:
`validateBrief` / `validateBriefPair`, `segmentChunks`, `segJsonKey`, markdown→HTML
(`lib/render/markdown.ts`), `cleanForTemplate` (`lib/cleanEmail.ts`), and the P0.3/P0.4 deadline
math. **Files.** `package.json` (test script + dev dep), `*.test.ts`. **Acceptance:** `npm test`
runs; core invariants covered. **Effort:** M.

### P5.2 — Structured generation telemetry
**Change.** Log per-run: path taken (single/batched), per-stage durations, retry counts, repair
fired, contrast retry fired, final scores, partial/timeout. Behind `AI_PROMPT_DEBUG` or a new flag.
Enables measuring whether P0/P2 actually helped. **Effort:** S–M.

### P5.3 — Golden-brief regression check
**Change.** Keep a small set of fixed campaign inputs; on changes to `briefgen.ts`, generate and
assert structural validity + score thresholds (mock the provider). **Effort:** M.

---

## Quick-win shortlist (if time-boxed)

1. **P0.1 streaming** — kills the timeout fear, biggest UX jump.
2. **P0.2 + P0.4** — stop forcing monolithic; deadline-aware retries → partial salvage.
3. **P1.1 Review redesign** — calm, scannable step 2 with cost-at-choice-time.
4. **P1.2 real progress** — pairs with P0.1.
5. **P2.1 first-pass contrast** — fewer expensive retries, better A/B.

## Appendix A — Key files & line anchors
- `lib/anthropic.ts`: dispatch :1666 · single :1365 · batched :1522 · foundation :1492 · patch
  :1074 · `mapWithConcurrency` :1141 · retry :219 · repair :1332 · timeout const :103.
- `lib/briefgen.ts`: `buildSystemPrompt` :1769 · `buildUserPrompt` :1933 · `contrastInstruction`
  :1764 · prompt budget :24.
- `app/api/generate-copy/route.ts`: `maxDuration` :24.
- `app/studio/StudioApp.tsx`: `generate()` :642 · ReviewView :1559–1682 · OutputView :1685.
- `app/studio/StudioPanels.tsx`: `GenerationProgress` :58 · `GenerationBudgetPanel` :84 ·
  `ModelSelector` :810.

## Appendix B — Env vars likely added/changed
`AI_GENERATION_STREAMING` (new, default on), per-model speed tier in `lib/config/aiModels.ts`,
`AI_SOFT_DEADLINE_MS` (new, ~240000), tuned `AI_MAX_OUTPUT_TOKENS` default, plus the existing
`AI_SEGMENT_BATCH_*`, `AI_PROVIDER_*`, `AI_AB_FAST_PARALLEL`. Update the `CLAUDE.md` env table.

## Appendix C — References (best-practice research)
- Vercel Functions limits & duration / streaming guidance.
- SSE-streaming-LLM and background-job patterns for Next.js (heartbeat < ~25s; never block the
  handler with unbounded work; partial/resumable jobs for very long runs).
