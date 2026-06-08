# Body Copy Variety — Design Spec
**Date:** 2026-06-08  
**Approach:** C — Full variety injection + cross-session feedback loop

---

## Problem

Body copy is structurally similar across sends and brands. The `WIN_EMAIL_FORMATTING_RULES` lists 5 opener mechanics and says "rotate each send" but nothing in the user prompt actually selects one — the model defaults to the same patterns every time. `LastSend` only tracks CTR/hero/angle, not body structure. The result: Sandra, Jordan, Adele, and Mary open emails the same way week after week.

---

## Solution

Inject a **BodyVarietyProfile** into every generation — computed deterministically from `brandId + sendDate`, avoiding what was used the previous send. The profile specifies: opener mechanic, named character + role, core pain to name, sensory phrase to include, and emotional arc. These become hard directives in the user prompt, not suggestions.

The selected profile is shown in the **preflight panel** (before generate) and in the **brief output** (after generate). After generation, the used opener mechanic and arc are saved to `lastSend` so the next session can avoid them.

---

## Data Model Changes (`lib/config/types.ts`)

```ts
export interface BodyVarietyProfile {
  openerMechanic: "story" | "re_engagement" | "insider_reveal" | "occasion" | "direct_problem";
  openerMechanicLabel: string;
  namedCharacter: string;
  characterRole: string;
  painPoint: string;
  sensoryPhrase: string;
  emotionalArc: "pain_relief" | "curiosity_reveal" | "gratitude_surprise" | "social_proof_invitation";
  emotionalArcLabel: string;
}

// LastSend gains:
openerMechanic?: string;
emotionalArc?: string;

// Campaign gains:
bodyVariety?: BodyVarietyProfile;  // computed, never user-typed
```

---

## Variety Banks (`lib/briefgen.ts`)

Per-brand arrays (5 items each) for:
- **characters**: `{ name, role }` pairs grounded in WIN template analysis (Dorothy/neighbor for BG, Frank P./subscriber for GL, Michelle/customer for LF, Michelle/sister for SF)
- **painPoints**: segment-relevant specific pains (not generic — "underwire digging in by noon", not "discomfort")
- **sensoryPhrases**: tactile language from WIN templates ("no digging no pinching", "cool on skin", "moves with you")

5 **openerMechanics** with full directive templates (parameterised by character, pain, persona).  
4 **emotionalArcs** with copy direction.

---

## Selection Logic (`selectVarietyProfile`)

```
seed = hashSeed(brandId + sendDate)
mechanic = avoid(lastSend.openerMechanic), pick from seed % remaining
character = seed >> 3 % bank
pain      = seed >> 7 % bank
sensory   = seed >> 11 % bank
arc       = avoid(lastSend.emotionalArc), pick from seed >> 5 % remaining
```

Same brand + same date = same profile (revisions are consistent within a session).  
Different date next week = different profile automatically.

---

## Prompt Changes (`buildUserPrompt`)

Injects a `BODY VARIETY MANDATE` block with all 5 elements as hard directives, not suggestions. The model is told to record the opener mechanic in `quality_checks.opener_mechanic`.

---

## Route Changes (`app/api/generate-copy/route.ts`)

- Computes `bodyVariety` from campaign via `selectVarietyProfile()` before generation.
- Attaches `bodyVariety` to the response JSON.
- Attaches to both `result.a.body_variety` and `result.b.body_variety`.

---

## UI Changes

### PreflightPanel — new "Body Variety" row (before generate)
Shows the 5 profile elements in a compact info row at the top of the panel.

### BriefView — shows profile in creative direction section (after generate)
Confirms what the model was told to use.

### page.tsx — saves to lastSend after generation
`openerMechanic` and `emotionalArc` saved to `campaign.lastSend` after the API response, so the next session's selection automatically avoids them.

---

## Files Changed

| File | Change |
|---|---|
| `lib/config/types.ts` | `BodyVarietyProfile`, `LastSend` extensions, `Campaign.bodyVariety` |
| `lib/briefgen.ts` | Variety banks, `selectVarietyProfile()`, user prompt injection, `GenBrief.body_variety` |
| `app/api/generate-copy/route.ts` | Compute + attach `bodyVariety` |
| `app/page.tsx` | Compute variety for preflight display, save to lastSend after generation |
| `app/components/PreflightPanel.tsx` | Body Variety row |
| `app/components/BriefView.tsx` | Confirm used profile |
