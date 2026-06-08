# Body Copy Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force genuine body copy variety each send by injecting a deterministic, per-brand variety profile (opener mechanic + named character + pain + sensory phrase + emotional arc) as hard directives into the generation prompt, show it in the preflight panel and brief output, and save the used mechanic to `lastSend` so the next session auto-rotates away from it.

**Architecture:** A `selectVarietyProfile(campaign)` function in `lib/briefgen.ts` hashes `brandId + sendDate`, avoids `lastSend.openerMechanic` / `lastSend.emotionalArc`, and returns a `BodyVarietyProfile`. This profile is injected into `buildUserPrompt` as a mandatory directive block, attached to the API response, shown in `PreflightPanel` and `BriefView`, and saved back to `lastSend` state in `page.tsx` after generation.

**Tech Stack:** TypeScript, Next.js 15 App Router, React 19, Tailwind CSS v4.

---

## File Map

| File | Change |
|---|---|
| `lib/config/types.ts` | Add `BodyVarietyProfile` interface; extend `LastSend` with `openerMechanic?` + `emotionalArc?`; add `bodyVariety?: BodyVarietyProfile` to `Campaign` |
| `lib/briefgen.ts` | Add `VARIETY_BANKS`, `OPENER_MECHANICS`, `EMOTIONAL_ARCS` constants; add `hashSeed()` + `selectVarietyProfile()` exports; inject into `buildUserPrompt()`; add `body_variety?` to `GenBrief` |
| `app/api/generate-copy/route.ts` | Compute `bodyVariety` from campaign; attach to both `result.a` and `result.b` before returning |
| `app/page.tsx` | Add `lastOpenerMechanic` + `lastEmotionalArc` state vars; include in `campaign` memo; save to state after generation |
| `app/components/PreflightPanel.tsx` | Accept `variety?: BodyVarietyProfile` prop; render Body Variety row |
| `app/components/BriefView.tsx` | Show `brief.body_variety` in Creative Direction card when present |

---

## Task 1: Add types to `lib/config/types.ts`

**Files:**
- Modify: `lib/config/types.ts`

- [ ] **Step 1: Add `BodyVarietyProfile` interface and extend `LastSend` and `Campaign`**

In `lib/config/types.ts`, after the `LastSend` interface (currently at line 104), make these additions:

```typescript
// After the existing LastSend interface:
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
```

Add two optional fields to the **existing** `LastSend` interface:
```typescript
/** Opener mechanic used in last send — auto-rotated away from next time. */
openerMechanic?: string;
/** Emotional arc used in last send — auto-rotated away from next time. */
emotionalArc?: string;
```

Add one optional field to the **existing** `Campaign` interface (after `recentProductSlugs`):
```typescript
/** Auto-computed variety profile for this send. Never user-typed. */
bodyVariety?: BodyVarietyProfile;
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/macbook/Library/CloudStorage/GoogleDrive-son.nln@crossian.com/My Drive/VScode/EmailStudio"
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/config/types.ts
git commit -m "feat: add BodyVarietyProfile type and extend LastSend + Campaign"
```

---

## Task 2: Add variety banks and `selectVarietyProfile` to `lib/briefgen.ts`

**Files:**
- Modify: `lib/briefgen.ts`

- [ ] **Step 1: Add `hashSeed` helper and `VARIETY_BANKS` constant**

Add the following after the `THEME_STOPWORDS` line (currently around line 316), before the `// ---- helpers ----` section:

```typescript
// ---- body variety system ----
function hashSeed(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const VARIETY_BANKS: Record<string, {
  characters: { name: string; role: string }[];
  painPoints: string[];
  sensoryPhrases: string[];
}> = {
  bra_goddess: {
    characters: [
      { name: "Dorothy", role: "neighbor" },
      { name: "Carol", role: "friend" },
      { name: "Rose", role: "sister" },
      { name: "Margaret", role: "woman from my book club" },
      { name: "Linda", role: "coworker" },
    ],
    painPoints: [
      "underwire digging in by noon",
      "straps that slip off the shoulder all day",
      "cups that gap or wrinkle under clothes",
      "a bra that rides up in the back",
      "side boning that leaves marks at the end of the day",
    ],
    sensoryPhrases: [
      "no digging, no pinching",
      "feels like a second skin",
      "so light you forget you're wearing it",
      "lifts without squeezing",
      "buttery soft against the skin",
    ],
  },
  gents_lux: {
    characters: [
      { name: "Frank P.", role: "longtime subscriber" },
      { name: "Marcus", role: "guy from my gym" },
      { name: "David", role: "subscriber who emailed me" },
      { name: "Tony", role: "coworker" },
      { name: "Ray", role: "customer" },
    ],
    painPoints: [
      "stiff denim that restricts movement all day",
      "shorts that ride up mid-walk",
      "jeans that look professional but feel like a straitjacket",
      "camo that looks cool but runs hot after an hour",
      "pants that won't stretch when you actually need them to",
    ],
    sensoryPhrases: [
      "moves with you, not against you",
      "cool on skin even when it's hot out",
      "four-way stretch you actually feel",
      "lightweight — like it's barely there",
      "built to wear everywhere, all day",
    ],
  },
  lux_fitting: {
    characters: [
      { name: "Michelle", role: "woman who reached out to me" },
      { name: "Diane", role: "longtime customer" },
      { name: "Susan", role: "woman from our community" },
      { name: "Claire", role: "subscriber who messaged us" },
      { name: "Pam", role: "customer" },
    ],
    painPoints: [
      "activewear that goes sheer when you bend over",
      "leggings that roll down mid-workout",
      "shorts that dig in when you sit",
      "clothes that don't move with your body",
      "nothing in the closet that fits properly off the rack",
    ],
    sensoryPhrases: [
      "cool and breathable from the first wear",
      "smooths without squeezing",
      "stretches four ways without going sheer",
      "moves with you, not against you",
      "feels like wearing nothing at all",
    ],
  },
  santa_fare: {
    characters: [
      { name: "Michelle", role: "my sister" },
      { name: "Karen", role: "a close friend" },
      { name: "Janet", role: "someone I know" },
      { name: "Diane", role: "a longtime customer" },
      { name: "Barbara", role: "who asked me for gift ideas" },
    ],
    painPoints: [
      "no idea what to get them for their birthday",
      "wanting something personal but practical, not just a gift card",
      "needing a gift that travels well and lasts",
      "finding something they'd never splurge on for themselves",
      "they already have everything — except something really thoughtful",
    ],
    sensoryPhrases: [
      "the kind of gift they'll reach for every single day",
      "soft leather that only gets better with age",
      "substantial but never heavy",
      "luxurious to carry, easy to love",
      "opens smoothly, closes clean — that quality you can feel",
    ],
  },
};

const OPENER_MECHANICS: {
  key: BodyVarietyProfile["openerMechanic"];
  label: string;
  directive: (char: string, role: string, pain: string, persona: string) => string;
}[] = [
  {
    key: "story",
    label: "Named Micro-Story",
    directive: (char, role, pain, persona) =>
      `Open with a 2-3 sentence micro-story about ${char} (${role}) — mention them by name. The story ties "${pain}" to discovering the hero product as the solution. Price appears in sentence 1 or 2. Do NOT open with ${persona}'s own opinion — this is ${char}'s story.`,
  },
  {
    key: "re_engagement",
    label: "Re-engagement",
    directive: (_char, _role, pain, _persona) =>
      `Open by acknowledging it has been a while — without apologising. Immediately name "${pain}" as the reason for reaching out now, then reveal the product as the answer. Do not use "I hope this email finds you well."`,
  },
  {
    key: "insider_reveal",
    label: "Insider Reveal",
    directive: (_char, _role, pain, persona) =>
      `Open as ${persona} sharing something exclusive before anyone else: "I wanted you to see this first..." Frame the product or offer as an early/private reveal tied to solving "${pain}". Exclusive framing only — not a broadcast.`,
  },
  {
    key: "occasion",
    label: "Occasion / Timing",
    directive: (_char, _role, pain, _persona) =>
      `Open by tying "${pain}" to a specific upcoming moment, season, or occasion named in the campaign theme. The product arrives as the natural solution for that moment. The offer is the confirmation, not the headline.`,
  },
  {
    key: "direct_problem",
    label: "Direct Problem",
    directive: (_char, _role, pain, _persona) =>
      `Open by naming "${pain}" directly in the first sentence — as though you already know {{first_name}} has experienced it. The product is the precise fix, named in sentence 2.`,
  },
];

const EMOTIONAL_ARCS: {
  key: BodyVarietyProfile["emotionalArc"];
  label: string;
  directive: string;
}[] = [
  { key: "pain_relief", label: "Pain → Relief", directive: "Body moves from naming the pain clearly → product as relief → offer as confirmation. End on resolution, not urgency." },
  { key: "curiosity_reveal", label: "Curiosity → Reveal", directive: "Body withholds the full picture early → builds curiosity → reveals the product + offer as the payoff. The offer is the reward for reading." },
  { key: "gratitude_surprise", label: "Gratitude → Surprise", directive: "Body opens with warm personal recognition → surprises with an offer the recipient did not expect. Gratitude is genuine, not a setup." },
  { key: "social_proof_invitation", label: "Social Proof → Invitation", directive: "Body leads with what others (or the named character) experienced → invites {{first_name}} to have the same experience. Proof first, pitch second." },
];
```

- [ ] **Step 2: Add the `selectVarietyProfile` export and add `body_variety` to `GenBrief`**

Add this import at the top of `lib/briefgen.ts` (after the existing imports):
```typescript
import type { BodyVarietyProfile } from "./config/types";
```

Add `selectVarietyProfile` right after the variety bank constants (still in the `// ---- body variety system ----` section):
```typescript
export function selectVarietyProfile(campaign: Campaign): BodyVarietyProfile {
  const seed = hashSeed(campaign.brandId + campaign.sendDate);
  const banks = VARIETY_BANKS[campaign.brandId] || VARIETY_BANKS.bra_goddess;
  const persona = BRANDS[campaign.brandId]?.persona || "Sandra";

  const lastMechanic = campaign.lastSend?.openerMechanic;
  const availableMechanics = OPENER_MECHANICS.filter((m) => m.key !== lastMechanic);
  const mechanic = availableMechanics[seed % availableMechanics.length];

  const lastArc = campaign.lastSend?.emotionalArc;
  const availableArcs = EMOTIONAL_ARCS.filter((a) => a.key !== lastArc);
  const arc = availableArcs[(seed >> 5) % availableArcs.length];

  const char = banks.characters[(seed >> 3) % banks.characters.length];
  const pain = banks.painPoints[(seed >> 7) % banks.painPoints.length];
  const sensory = banks.sensoryPhrases[(seed >> 11) % banks.sensoryPhrases.length];

  return {
    openerMechanic: mechanic.key,
    openerMechanicLabel: mechanic.label,
    namedCharacter: char.name,
    characterRole: char.role,
    painPoint: pain,
    sensoryPhrase: sensory,
    emotionalArc: arc.key,
    emotionalArcLabel: arc.label,
    // store directive strings for prompt injection (not stored in GenBrief, computed on the fly)
    _openerDirective: mechanic.directive(char.name, char.role, pain, persona),
    _arcDirective: arc.directive,
  } as BodyVarietyProfile & { _openerDirective: string; _arcDirective: string };
}
```

> Note: `_openerDirective` and `_arcDirective` are not in `BodyVarietyProfile` — they're ephemeral extras cast away after prompt use. The clean `BodyVarietyProfile` is what's stored/displayed.

Add `body_variety?: BodyVarietyProfile` to the `GenBrief` interface (after `_provider?: string`):
```typescript
body_variety?: BodyVarietyProfile;
```

- [ ] **Step 3: Type-check**

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/briefgen.ts lib/config/types.ts
git commit -m "feat: add variety banks, selectVarietyProfile, and body_variety to GenBrief"
```

---

## Task 3: Inject variety mandate into `buildUserPrompt`

**Files:**
- Modify: `lib/briefgen.ts` (the `buildUserPrompt` function at line 600)

- [ ] **Step 1: Inject `BODY VARIETY MANDATE` block into `buildUserPrompt`**

Replace the existing `buildUserPrompt` function body with:

```typescript
export function buildUserPrompt(campaign: Campaign, isB: boolean): string {
  const ls = campaign.lastSend;
  const lastSend =
    ls && (ls.hero || ls.angle || ls.ctr || ls.note)
      ? `\nLast send: CTR ${ls.ctr || "?"}%, hero "${ls.hero || "?"}", angle ${ls.angle || "?"}.${ls.note ? " Note: " + ls.note : ""} Rotate away from this.`
      : "";
  const recentAvoid =
    campaign.recentProductSlugs?.length
      ? `\nProduct rotation — these slugs appeared in the last 3 sends; avoid featuring them as hero or lead unless no better alternative exists: ${campaign.recentProductSlugs.join(", ")}.`
      : "";

  const variety = campaign.bodyVariety as (BodyVarietyProfile & { _openerDirective?: string; _arcDirective?: string }) | undefined;
  const varietyMandate = variety
    ? `\nBODY VARIETY MANDATE — mandatory, not optional. The body copy MUST open with exactly this structure:
• Opener mechanic: ${variety.openerMechanicLabel} — ${variety._openerDirective || ""}
• Named character: ${variety.namedCharacter} (${variety.characterRole}) — mention by name in the opener
• Core pain to name: "${variety.painPoint}" — use this exact pain scenario in the first 1-2 sentences
• Sensory phrase to include: "${variety.sensoryPhrase}" — use this phrase (or a very close variant) in the body
• Emotional arc: ${variety.emotionalArcLabel} — ${variety._arcDirective || ""}
Record the opener mechanic label in quality_checks.opener_mechanic.`
    : "";

  return `Generate a complete email brief for this send:

Brand: ${BRANDS[campaign.brandId].name}
Send date: ${campaign.sendDate}
Campaign theme: ${campaign.theme}
Hook Contract input: ${campaign.hookContract?.trim() || "Model must construct one before writing from the selected segment, hero product, offer, urgency, proof, and avoid rules."}
Promo: ${promoLine(campaign)}
Body layout: ${bodyLayoutLabel(campaign)}
Product block template: ${productCopyStyleLabel(campaign)}
Recipient token: ${campaign.recipientName}${lastSend}${recentAvoid}${varietyMandate}

Generate Option ${isB ? "B" : "A"} now. Lead with a strong creative direction, then write all copy sections.`;
}
```

- [ ] **Step 2: Type-check**

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/briefgen.ts
git commit -m "feat: inject body variety mandate into user prompt"
```

---

## Task 4: Compute and attach variety profile in the API route

**Files:**
- Modify: `app/api/generate-copy/route.ts`

The route currently calls `generateOptions(v.campaign, v.products, ...)`. We need to:
1. Compute the variety profile from the campaign (including the ephemeral `_openerDirective` / `_arcDirective` fields)
2. Attach it to the campaign before passing to `generateOptions`
3. Attach the clean `BodyVarietyProfile` (without ephemeral fields) to both `result.a` and `result.b`

- [ ] **Step 1: Import `selectVarietyProfile` in the route**

Add to the imports at the top of `app/api/generate-copy/route.ts`:
```typescript
import { selectVarietyProfile } from "@/lib/briefgen";
import type { BodyVarietyProfile } from "@/lib/config/types";
```

- [ ] **Step 2: Compute variety and inject before `generateOptions`**

In the `POST` handler, after the `validate` call and before the `generateOptions` call, add:

```typescript
  // Compute variety profile and attach to campaign so the prompt builder can use it.
  const variety = selectVarietyProfile(v.campaign);
  const campaignWithVariety = { ...v.campaign, bodyVariety: variety };
  // Strip the ephemeral directive strings before storing/returning (keep only display fields).
  const cleanVariety: BodyVarietyProfile = {
    openerMechanic: variety.openerMechanic,
    openerMechanicLabel: variety.openerMechanicLabel,
    namedCharacter: variety.namedCharacter,
    characterRole: variety.characterRole,
    painPoint: variety.painPoint,
    sensoryPhrase: variety.sensoryPhrase,
    emotionalArc: variety.emotionalArc,
    emotionalArcLabel: variety.emotionalArcLabel,
  };
```

Then replace the `generateOptions` call to use `campaignWithVariety` instead of `v.campaign`:
```typescript
  const result = await generateOptions(campaignWithVariety, v.products, overrides, models, revision);
```

After the error check and before `return NextResponse.json(...)`, attach the clean variety to both briefs:
```typescript
  if (result.a) result.a.body_variety = cleanVariety;
  if (result.b) result.b.body_variety = cleanVariety;
  return NextResponse.json({ a: result.a, b: result.b });
```

- [ ] **Step 3: Type-check and build**

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/generate-copy/route.ts
git commit -m "feat: compute and attach body_variety to API response briefs"
```

---

## Task 5: State management in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

We need to:
1. Add `lastOpenerMechanic` + `lastEmotionalArc` state vars (alongside existing `lastHero`, `lastAngle`, etc.)
2. Include them in the `campaign` memo so the selection can avoid last-send values
3. After generation succeeds, save the used mechanic + arc from `data.a.body_variety` back into state
4. Pass the computed variety profile to `PreflightPanel`

- [ ] **Step 1: Add two new `useState` declarations**

After line 88 (`const [lastNote, setLastNote] = useState(""); `), add:

```typescript
const [lastOpenerMechanic, setLastOpenerMechanic] = useState("");
const [lastEmotionalArc, setLastEmotionalArc] = useState("");
```

- [ ] **Step 2: Include new fields in the `campaign` memo**

The `campaign` memo currently has `lastSend: { ctr: lastCtr, hero: lastHero, angle: lastAngle, note: lastNote }`. Replace that with:

```typescript
lastSend: {
  ctr: lastCtr,
  hero: lastHero,
  angle: lastAngle,
  note: lastNote,
  openerMechanic: lastOpenerMechanic || undefined,
  emotionalArc: lastEmotionalArc || undefined,
},
```

Also add `lastOpenerMechanic, lastEmotionalArc` to the memo's dependency array (the second argument to `useMemo`).

- [ ] **Step 3: Import `selectVarietyProfile` and compute the display profile**

Add this import near the top of `page.tsx` with the other lib imports:
```typescript
import { selectVarietyProfile } from "@/lib/briefgen";
import type { BodyVarietyProfile } from "@/lib/config/types";
```

After the `campaign` memo declaration (line ~235), add:
```typescript
const varietyProfile: BodyVarietyProfile = useMemo(
  () => selectVarietyProfile(campaign),
  // Recompute when brand, date, or lastSend opener/arc changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [campaign.brandId, campaign.sendDate, campaign.lastSend?.openerMechanic, campaign.lastSend?.emotionalArc]
);
```

- [ ] **Step 4: Save variety to state after successful generation**

After `setOptions({ a: data.a, b: data.b });` (line ~375), add:
```typescript
// Save variety back to lastSend state so next session avoids repeating.
const usedVariety = data.a?.body_variety || data.b?.body_variety;
if (usedVariety) {
  setLastOpenerMechanic(usedVariety.openerMechanic);
  setLastEmotionalArc(usedVariety.emotionalArc);
}
```

- [ ] **Step 5: Wire history restore**

Find the history-restore block (around line 591) where `setLastCtr`, `setLastHero`, etc. are called. After them add:
```typescript
setLastOpenerMechanic(d.lastSend?.openerMechanic || "");
setLastEmotionalArc(d.lastSend?.emotionalArc || "");
```

Also ensure the saved version payload that goes into Supabase includes the two new fields. Find where `lastSend` is assembled for saving (look for `VersionPayload` or the save call) and ensure the new fields flow through — they already will via the `campaign` memo since `lastSend` is already included.

- [ ] **Step 6: Pass `varietyProfile` to `PreflightPanel`**

Find the `<PreflightPanel ... />` call (line ~1190):
```tsx
<PreflightPanel flags={activeBrief._flags} score={activeBrief._score} />
```
Change it to:
```tsx
<PreflightPanel flags={activeBrief._flags} score={activeBrief._score} variety={varietyProfile} />
```

Also find the preflight panel rendered in the **review step** (before generation, when `options` is empty and the panel shows a pre-generate state). Search for `<PreflightPanel` — there may be two render locations. Pass `variety={varietyProfile}` to all of them.

- [ ] **Step 7: Type-check**

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: track lastOpenerMechanic/Arc in state, compute varietyProfile, wire to preflight"
```

---

## Task 6: Body Variety section in `PreflightPanel`

**Files:**
- Modify: `app/components/PreflightPanel.tsx`

- [ ] **Step 1: Add the `BodyVarietyProfile` import and update the props signature**

At the top of `PreflightPanel.tsx`, add:
```typescript
import type { BodyVarietyProfile } from "@/lib/config/types";
```

Change the props type from:
```typescript
export function PreflightPanel({ flags, score }: { flags?: Flag[]; score?: number }) {
```
to:
```typescript
export function PreflightPanel({ flags, score, variety }: { flags?: Flag[]; score?: number; variety?: BodyVarietyProfile }) {
```

- [ ] **Step 2: Add the Body Variety info block at the top of the returned JSX**

Inside the `<div className="section-panel">`, add the variety block right before the existing score/status header row (`<div className="flex items-start justify-between mb-3 gap-3">`):

```tsx
{variety && (
  <div className="mb-4 rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-0.5">Body Variety — auto-selected</span>
    <div className="grid grid-cols-1 gap-1">
      <VarietyRow label="Opener" value={variety.openerMechanicLabel} />
      <VarietyRow label="Character" value={`${variety.namedCharacter} (${variety.characterRole})`} />
      <VarietyRow label="Pain focus" value={variety.painPoint} />
      <VarietyRow label="Sensory" value={`"${variety.sensoryPhrase}"`} />
      <VarietyRow label="Arc" value={variety.emotionalArcLabel} />
    </div>
  </div>
)}
```

Add the `VarietyRow` helper above the `PreflightPanel` function:
```tsx
function VarietyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 font-semibold text-[var(--muted)] w-20">{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/PreflightPanel.tsx
git commit -m "feat: show body variety profile in preflight panel"
```

---

## Task 7: Body Variety confirmation in `BriefView`

**Files:**
- Modify: `app/components/BriefView.tsx`

- [ ] **Step 1: Add import**

At the top, add:
```typescript
import type { BodyVarietyProfile } from "@/lib/config/types";
```

- [ ] **Step 2: Show variety in the Creative Direction card**

In the `BriefView` component, `brief.body_variety` is already available since `GenBrief.body_variety` now exists.

Inside the `<Card title="Creative direction" ...>` section, find the non-editable branch (the `<>` inside the `else` block showing `<Tag label={...} />` etc.) and add the variety block after the existing `<Tag>` chips:

```tsx
{brief.body_variety && (
  <div className="mt-3 rounded border p-2.5 flex flex-col gap-1" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Body variety used</span>
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
      {[
        ["Opener", brief.body_variety.openerMechanicLabel],
        ["Character", `${brief.body_variety.namedCharacter} (${brief.body_variety.characterRole})`],
        ["Pain", brief.body_variety.painPoint],
        ["Sensory", `"${brief.body_variety.sensoryPhrase}"`],
        ["Arc", brief.body_variety.emotionalArcLabel],
      ].map(([k, v]) => (
        <div key={k} className="flex gap-1.5 text-xs col-span-2 sm:col-span-1">
          <span className="font-semibold text-[var(--muted)] w-16 shrink-0">{k}</span>
          <span className="text-[var(--text)]">{v}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

Also show it in the editable branch (the `div.grid.grid-cols-1` section). After the four `<EditField>` / `<EditArea>` fields, add the same read-only variety block (variety is never editable — it's auto-computed):

```tsx
{brief.body_variety && (
  <div className="col-span-2 rounded border p-2.5 flex flex-col gap-1" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Body variety used</span>
    <p className="text-xs text-[var(--text)] mt-1">
      {brief.body_variety.openerMechanicLabel} · {brief.body_variety.namedCharacter} ({brief.body_variety.characterRole}) · &ldquo;{brief.body_variety.sensoryPhrase}&rdquo; · {brief.body_variety.emotionalArcLabel}
    </p>
  </div>
)}
```

- [ ] **Step 3: Type-check and build**

```bash
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
npm run build 2>&1 | tail -20
```

Expected: clean build, no errors.

- [ ] **Step 4: Final commit**

```bash
git add app/components/BriefView.tsx
git commit -m "feat: show body variety confirmation in brief output view"
```

---

## Task 8: Verify end-to-end

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

1. Open http://localhost:3000. Fill a campaign (any brand, any date).
2. Navigate to Step 6 (Review). The preflight panel should show **Body Variety — auto-selected** with 5 rows: Opener, Character, Pain focus, Sensory, Arc.
3. Change the send date to a different date → the variety profile in preflight should change (different mechanic or character selected).
4. Generate. In the Output tab → Brief view → Creative Direction card → a "Body variety used" row should appear confirming what the model was told to use.
5. Inspect `quality_checks.opener_mechanic` in the brief — should match the selected opener mechanic label.
6. Check the generated body copy — it should open with the named character or the selected opener pattern, and contain the sensory phrase.
7. Generate again with the same date → same variety (deterministic). Change the date by one week → different variety (rotation).

- [ ] **Step 3: Commit build artifacts if needed, then push**

```bash
git push origin main
```

---

## Self-review against spec

**Spec coverage:**

| Requirement | Task |
|---|---|
| Auto-selected variety profile (opener, character, pain, sensory, arc) | Task 2 |
| Hash-based deterministic selection avoiding lastSend mechanic + arc | Task 2 |
| Injected as hard directives into user prompt (not suggestions) | Task 3 |
| Attached to API response on both briefs | Task 4 |
| Visible in preflight panel before generate | Task 6 |
| Visible in brief output after generate | Task 7 |
| Saved to lastSend state after generation for cross-session rotation | Task 5 step 4 |
| History restore populates lastOpenerMechanic + lastEmotionalArc | Task 5 step 5 |
| `BodyVarietyProfile` type + LastSend + Campaign extensions | Task 1 |

**Placeholder scan:** None found — all steps have concrete code.

**Type consistency:** `BodyVarietyProfile` defined in Task 1, imported in Tasks 2, 5, 6, 7. `body_variety?: BodyVarietyProfile` added to `GenBrief` in Task 2. `selectVarietyProfile` exported from Task 2, imported in Tasks 4 and 5. All names consistent.
