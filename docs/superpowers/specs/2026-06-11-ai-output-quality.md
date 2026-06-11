# AI Output Quality — Deep Improvement Pass

**Goal:** Eliminate the four named output-quality problems: generic/similar cross-segment copy, missed playbook violations, weak A/B contrast, and weak subjects/hooks.

**Approach:** Parallel multi-skill audit across seven dimensions → ranked findings → four implementation batches ordered by impact.

**Architecture:** No new abstractions. All prompt changes go in `lib/briefgen.ts`. All generation/contrast changes go in `lib/anthropic.ts`. Validation stays co-located in `lib/briefgen.ts`. Each batch must pass `tsc --noEmit` + `npm run build` before commit.

---

## Audit Dimensions

| # | Dimension | Files | Question |
|---|---|---|---|
| 1 | Prompt structure | `lib/briefgen.ts` buildSystemPrompt/buildUserPrompt | Where does the prompt fail to force differentiation, specificity, or hook strength? |
| 2 | Validation gaps | `lib/briefgen.ts` validateBrief | Which playbook violations does the validator miss or fire falsely? |
| 3 | A/B contrast mechanics | `lib/anthropic.ts` generateOptions/validateBriefPair | Why do B options feel like synonym swaps of A? |
| 4 | Subject/hook quality | `lib/briefgen.ts` prompt + validation | What's missing from subject-line and hook-contract enforcement? |
| 5 | Copy/render pipeline | `lib/render/email.ts` + `lib/render/markdown.ts` | Does the render layer lose or corrupt what the model produced? |
| 6 | Model + parameters | `lib/anthropic.ts` callClaude/callGemini/callOpenAI | Is temperature, token budget, or sampling harming output quality? |
| 7 | Variety system | `lib/briefgen.ts` selectVarietyProfile + prompt injection | Is the variety profile forcing distinct segment copy, or ignored by the model? |

---

## Implementation Batches

### Batch 1 — Prompt surgery
- Segment differentiation: explicit per-segment angle mandates
- Hook strength: hook-contract validation tightened in prompt
- Subject mandates: stronger length/personalisation/offer-signal requirements
- Files: `lib/briefgen.ts`

### Batch 2 — Validation hardening
- Close missed violations surfaced by audit
- Fix false positives that suppress real warnings
- Files: `lib/briefgen.ts`

### Batch 3 — A/B contrast
- B-contrast enforcement mechanics
- `validateBriefPair` similarity checks
- Repair pass scope and trigger conditions
- Files: `lib/anthropic.ts`

### Batch 4 — Model + variety
- Temperature/sampling adjustments
- Variety profile injection effectiveness
- Files: `lib/anthropic.ts`, `lib/briefgen.ts`

---

## Verification

After all batches:
1. `npm run dev` — generate real campaigns for BraGoddess + GentsLux
2. Review A/B outputs against all four named problems
3. Confirm preflight scores improve vs. baseline
4. `tsc + build` clean → commit + push

---

## Out of Scope

- UI/UX changes
- New features
- Render-layer HTML changes (unless the render layer is found to corrupt copy)
- Infrastructure / deployment changes
