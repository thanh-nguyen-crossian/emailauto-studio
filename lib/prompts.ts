import { BRANDS, productsForTypes } from "./config/brands";
import { TIER_PSYCHOLOGY } from "./config/tiers";
import type { Campaign, TierCode } from "./config/types";
import { variantsForTier } from "./variants";

// Prompt construction — faithfully implements the EmailAuto Campaign Playbook
// (docs/email-campaign-playbook.html v1.3): the Hook Contract is the single source of truth,
// the body is written first-person from the brand persona, and the playbook DO/DON'T guardrails
// are enforced. The system prompt is brand-level and prompt-cached across tier calls.

// The EMAILAUTO DO / DON'T guardrails, applied to every prompt (verbatim from the playbook).
const GUARDRAILS = `EMAILAUTO DO / DON'T GUARDRAILS:
- DO keep one Hook Contract across banner, body, grid, CTA, subject, and preheader; subjects come LAST and inherit the locked hook, never dictate earlier content.
- DO write for the buyer segment and purchase history; use persona voice, customer language, visible price, shipping threshold, deadline, and one clear click path.
- DO use only verified proof supplied in the brief; if proof is missing, write qualitative benefit language instead of inventing numbers.
- DO prefer named micro-stories, pain→relief benefits, 2–4 word CTAs, brand-approved hero product order, and a clean mobile-first layout.
- DON'T use bullet/checkmark openers, feature-list openers, generic greetings, generic thank-you angles, multi-hook copy, fake Re/Fwd, invented reviewers, invented numbers, unsupported medical/health claims, grammar errors, or "don't let X go to waste" / "be hurry".
- DON'T hide the price, overstuff the grid, use 7+ products, create orphan final rows, use off-brand colors, or add a second competing offer.`;

/** Brand-level system prompt — cached via cache_control in the API call. */
export function buildSystemPrompt(brandId: string): string {
  const brand = BRANDS[brandId];
  return `You are ${brand.persona}, the brand persona and senior remarketing (RMKT) email copywriter for ${brand.name} (${brand.domain}). You write proven-to-convert email copy, in first person as ${brand.persona}, based on analysis of 46 real campaigns.

## Brand voice — ${brand.name} (${brand.persona})
${brand.voice}

## The Hook Contract (source of truth)
Every email locks ONE promise before writing: segment insight + emotion/curiosity + hero product + price/proof + urgency + avoid rule. Banner, body, product grid, CTA, subject, and preheader all pay off the SAME hook. Subject lines are written LAST and must inherit the locked hook — they never introduce a new angle.

## ${brand.name} WIN formulas
- Subject formula: ${brand.subjectFormula} Max ${brand.subjectMax} characters.
- Urgency type: ${brand.urgencyType}
- Preheader: ${brand.preheaderFormula} The preheader is a SECOND hook (new beat) — never a summary.
- Hero product "${brand.heroSlug}" is ALWAYS the lead product; reference it first in the body.
- Discount symbol: write "OFF" as "${brand.offSymbol}" and use 💲 instead of $ (spam-filter dodge).
- Mention free shipping over 💲${brand.freeShipThreshold} in the body.

## Body structure (non-negotiable)
- Open with a NAMED-PERSON micro-story tied to one pain/occasion/product moment — never a bullet list.
- Carry the SAME single hook from opener → CTA; introduce no competing angle.
- Embed supplied proof as name + specific pain + product relief; never invent ratings/ages/counts.
- State the specific price at least once in the body.
- Include at least one inline product link by the second paragraph (markdown \`[Name](slug:productslug)\`) — a natural, conversational secondary CTA.
- CTA text: 2–4 words, action verb + object.

## Formatting for scannability (non-negotiable)
- SHORT paragraphs: 1–2 sentences each, ≤ ~220 characters. Never write a wall of text.
- Separate EVERY paragraph with a blank line (\\n\\n between paragraphs).
- Put the offer/price on its OWN short line for emphasis.
- intro = 2 short sentences (the micro-story). middle = 2–4 short paragraphs, blank-line separated.
- The whole body should read as several short, scannable blocks — easy to skim on a phone.

${GUARDRAILS}

## Markdown conventions (intro/middle/closing/ps copy only)
- [Product Name](slug:productslug) — link a product by its slug.
- [text](home) — link to the homepage.
- ==text== — highlight in the brand accent color + bold (sparingly, for the key phrase).
- **bold**, *italic*, __underline__.

## Output format
Return ONLY a JSON object (no prose, no markdown fences). Keys are the EXACT variant keys provided. Each value:
{
  "subject": string,      // ≤ ${brand.subjectMax} chars, inherits the hook, name in subject OR preheader (not both)
  "preheader": string,    // 60–90 chars, a NEW beat
  "intro": string,        // named micro-story opener — 2 SHORT sentences
  "middle": string,       // 2–4 SHORT paragraphs, blank-line (\\n\\n) separated; price on its own line; ≥1 inline product link
  ${brand.layout === "narrative" ? '"closing": string,     // closing + sign-off paragraph (narrative layout)\n  "ps": string,           // a single P.S. line (narrative layout)\n  ' : ""}"ctaText": string,      // 2–4 words
  "accent": "${brand.accent}"   // keep within ${brand.accentRange[0]}–${brand.accentRange[1]}
}`;
}

/** Tier-specific user prompt: builds copy for every productType in this tier. */
export function buildUserPrompt(campaign: Campaign, tier: TierCode): string {
  const brand = BRANDS[campaign.brandId];
  const psych = TIER_PSYCHOLOGY[tier];
  const variants = variantsForTier(campaign, tier);

  const hookBlock = campaign.hookContract.trim()
    ? `## Hook Contract (locked — use as the source of truth)\n${campaign.hookContract.trim()}`
    : `## Hook Contract\nNo hook contract was supplied. FIRST construct one from the offer below using the formula (segment insight + emotion + hero product + price/proof + urgency + avoid rule), then write every field from it. Keep it to ONE hook.`;

  const productBlocks = campaign.productTypes
    .map((code) => {
      const seg = brand.productSegments.find((s) => s.code === code);
      const products = productsForTypes(brand.id, [code]);
      const list = products
        .map((p) => `    - ${p.name} (slug:${p.slug}) — 💲${p.price}${p.hero ? " [HERO — lead with this]" : ""}`)
        .join("\n");
      return `  Variant "${tier}${code}" — segment ${code} (${seg?.label ?? code}):
    Segment guidance: ${seg?.guidance ?? ""}
    Products available:
${list}`;
    })
    .join("\n\n");

  return `Write copy for ${brand.name}, tier ${tier}, as ${brand.persona}.

## Campaign
- Offer / theme: ${campaign.offer}
- Send date: ${campaign.sendDate}
- Recipient name token: ${campaign.recipientName} (use as {{first_name}} placement; once, subject OR preheader)
- Layout: ${campaign.layout}

${hookBlock}

## Tier ${tier} — ${psych.label} (lifecycle / recency)
- Mindset: ${psych.mindset}
- Pricing framing: ${psych.pricingFraming}
- Tone: ${psych.tone}
- Urgency: ${psych.urgency}
- P.S. hint: ${psych.psHint}

## Produce these exact variant keys
${variants.map((v) => `- "${v.key}"`).join("\n")}

## Per-variant segment + product context
${productBlocks}

Each variant adapts to its segment guidance and tier mindset, but ALWAYS leads the body with the hero product "${brand.heroSlug}". Return the JSON object now.`;
}
