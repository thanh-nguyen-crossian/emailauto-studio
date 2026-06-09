// Generation engine ported from email-brief-generator.html: one combined prompt produces the
// per-segment copy AND the design brief, with A/B contrasting options and a validation pass.

import { BRANDS } from "./config/brands";
import { intelligencePromptBlock, getBrandIntelligence } from "./config/intelligence";
import type { Campaign, Product, Urgency, BodyVarietyProfile } from "./config/types";

// ---- generated output shape (snake_case, matching the prompt schema) ----
export interface GenHookContract {
  segment_insight: string;
  emotion: string;
  hero_product: string;
  proof_or_price: string;
  urgency: string;
  avoid_rule: string;
}
export interface GenCreativeDirection {
  angle: string;
  framework: string;
  hook_contract: GenHookContract;
  flow: string;
  differentiator: string;
}
export interface GenSubject {
  subject: string;
  preheader: string;
  style?: string;
  model_hint?: string;
  shared_thread?: string;
  options?: GenSubjectOption[];
}
export interface GenSubjectOption {
  style: string;
  model_hint: string;
  subject: string;
  preheader: string;
  shared_thread: string;
}
export interface GenBanner {
  logo_stars: string;
  main_text: string;
  sub_text: string;
  main_text_1?: string;
  main_text_2?: string;
  main_text_3?: string;
  sub_text_1?: string;
  sub_text_2?: string;
  sub_text_3?: string;
  image_guidance: string;
  review_quote: string;
  review_texts?: string[];
  main_image?: string;
  sub_image?: string;
  trust_booster?: string;
  emergency?: string;
  cta: string;
  options?: GenBannerOption[];
}
export interface GenBannerOption {
  label: string;
  model_hint: string;
  main_text_1: string;
  main_text_2: string;
  main_text_3: string;
  sub_text_1: string;
  sub_text_2: string;
  sub_text_3: string;
  cta: string;
  review_texts: string[];
  main_image: string;
  sub_image: string;
  trust_booster: string;
  emergency: string;
  image_guidance: string;
}
export interface GenProductBlock {
  slot: number;
  name: string;
  template_style?: string;
  main_image?: string;
  sub_image?: string;
  alt_text?: string;
  image_notes?: string;
  /** Legacy field kept so older saved generations still load, but new prompts no longer request it. */
  image_options?: GenProductImageOption[];
  main_text: string;
  sub_text: string;
  popup_badge: string;
  usps: string[];
  review: string;
  cta: string;
}
export interface GenProductImageOption {
  label: string;
  model_hint: string;
  main_image: string;
  sub_image: string;
  overlay_copy: string;
  alt_text: string;
  notes: string;
}
export interface GenBodyOption {
  label: string;
  model_hint: string;
  body: string;
  ps: string;
  placement_note: string;
}
export interface GenQualityChecks {
  click_reason: string;
  hook_alignment: string;
  proof_safety: string;
  spam_risk: string;
  optout_risk: string;
  photo_watchout: string;
  first_200px: string;
  inline_link_plan: string;
  layout_risk: string;
  playbook_dos_donts: string;
  brand_rule_alignment: string;
  accessibility_layout: string;
  opener_mechanic: string;
  hook_coherence: string;
  cta_assessment: string;
}
export interface Flag {
  type: "error" | "warn";
  msg: string;
}
export interface GenBrief {
  creative_direction: GenCreativeDirection;
  subject_lines: Record<string, GenSubject>;
  theme: string;
  banner: GenBanner;
  body: Record<string, string>; // "base" + per-segment keys
  body_options?: Record<string, GenBodyOption[]>;
  ps?: string;
  products: GenProductBlock[];
  quality_checks: GenQualityChecks;
  _flags?: Flag[];
  _score?: number;
  _provider?: string;
  _model?: string;
  body_variety?: BodyVarietyProfile;
}

// ---- playbook constants (cleaned from the source file) ----
export const PLAYBOOK_ANGLES = ["Pain Relief", "Mechanism", "Proof", "Offer", "Reactivation", "Occasion/Gift"];
export const PLAYBOOK_FRAMEWORKS = ["PAS", "BAB", "Proof Ladder", "Mechanism", "Suspended Loop", "Short Sale"];
export const PLAYBOOK_REQUIRED_QA = [
  "click_reason", "hook_alignment", "proof_safety", "spam_risk", "optout_risk",
  "photo_watchout", "first_200px", "inline_link_plan", "layout_risk",
  "playbook_dos_donts", "brand_rule_alignment", "accessibility_layout",
  "opener_mechanic", "hook_coherence", "cta_assessment",
];

const PLAYBOOK_RULES = `EMAIL COPY RULES (must follow):
- Subject line: 42-58 chars by brand, hard cap 60. No all-caps. Use {{first_name}} personalisation.
- Preheader: 60-90 chars. Complements subject, never repeats it.
- Never use spam words: free!, winner, congratulations, click here, limited time offer, act now, urgent.
- Replace $ with 💲 (spam filter). Write "off" as "o.f.f" in promotional price lines.
- P.S. line must add new information (social proof, scarcity, curiosity) - never restate the offer.
- Banner main text: all-caps, bold, <=8 words per line.
- Body: persona-signed. Open with pain acknowledgement OR a vivid moment. No "I hope this email finds you well."
- Product block main text: ALL CAPS, <=5 words.
- USPs: start with a verb or adjective. No filler ("Great quality", "Amazing value").
- CTAs: imperative verb + product name or benefit. No "Click here" or "Learn more".
- F-pattern: the complete hook (pain + product promise) must land within the first 200px / 3 lines.`;

const PROMPT_CONTRACT = `CONTENT QUALITY CONTRACT:
DO: make the click reason concrete (product, fit problem, occasion, proof, or price clear before the first CTA); use one dominant angle per option; respectful mature-audience language; designer-actionable image guidance (framing, pose, crop, lighting, product visibility); one risk reducer when relevant.
DON'T: body-shame/age-shame; stack unrelated hooks; invent scarcity/inventory/reviews/discount/shipping not supplied; repeat the same "reviews + thank you" structure; lead with generic gratitude or vague lifestyle copy; make photography guidance decorative.`;

const PLAYBOOK_ENFORCEMENT = `PLAYBOOK ALIGNMENT (must pass):
- Work in order INPUT -> ANGLE -> FRAMEWORK -> FLOW -> BRIEF -> QA. Subject lines do not choose the creative direction.
- Declare a Hook Contract: segment insight + emotion + hero product + proof/price + urgency + avoid rule.
- Subject and preheader are generated last and must not repeat each other. {{first_name}} in subject OR preheader, not both.
- Banner, body opener, inline link, product grid, CTA, subject, and preheader all prove the same one promise.
- Body opener: selected rotation mechanic (story, fact, question, occasion, re-engagement, insider reveal, or direct problem), 2-3 sentences. No bullet/checkmark opener. Add one natural product link by paragraph 2 (link text = product name).
- Product grid: 4-6 products (SantaFare defaults to 4). No 7+ crowding. CTA 2-4 words.
- Proof is supplied only (review/rating/material/shipping/price/inventory/guarantee); else write qualitative benefit.
- Visual brief names framing, model/product visibility, crop, lighting, brand palette, and the first-200px hook.`;

const BRAND_COLOR_GOVERNANCE = `BRAND COLOR GOVERNANCE:
- BraGoddess: #a02338 to #d63268; one smiling mature woman model.
- GentsLux: #002850 to #1d3d56; restrained masculine styling.
- LuxFitting: #e7324a to #fe397b; elegant movement or silhouette model.
- SantaFare: #890106 to #c00f28; premium gifting cues.
- Use one clear hero product in the banner; no busy multi-model collage unless the brief specifically asks for it.`;

const EMAIL_CAMPAIGN_PLAYBOOK_RULES = `EMAIL-CAMPAIGN-PLAYBOOK.HTML HARD RULES:
- One Hook Contract controls everything: segment insight + emotion/curiosity + hero product + price/proof + urgency + avoid rule.
- Generate subject/preheader last from the finished hook, banner, body, grid, and CTA; never let the subject invent a new promise.
- Preheader must add a new beat: deadline, reveal, proof, price, scale, or urgency. Never repeat the subject.
- Body opener must use the selected rotation mechanic in 2-3 sentences; never bullet/checkmark opener, generic greeting, generic thanks, or feature list.
- Add one natural product-name hyperlink by paragraph 2 using [Product Name](slug:productslug). Link text must be the product name, never "click here".
- Price or exact offer must be visible in subject/body/product blocks when supplied; shipping threshold must appear in body when supplied.
- Product grid: 4-6 products, even count preferred, no 7+ crowding, no orphan final row. SantaFare defaults to 4 focused products.
- Product block sub_text must include visible price/offer context when promo is supplied; each block needs 2 pain-to-relief benefits.
- CTA system: one primary action, 2-4 words, action verb + product or benefit; grid CTAs are secondary.
- First 200px must show hero product + hook + price/offer signal + brand palette + CTA path.
- Use supplied proof only: reviews, ratings, guarantees, material specs, stock, shipping, price, or product facts. If proof is missing, write qualitative benefit instead.
- Technical/layout brief must mention mobile readability, image max-width/height-auto, HTML/CSS CTA, descriptive alt text, dark-mode safety, and role=presentation tables.
- Do not use fake Re/Fwd, grammar errors, unsupported medical/age claims, invented reviewers, invented numbers, "don't let X go to waste", or multiple unrelated hooks.`;

const WIN_EMAIL_FORMATTING_RULES = `WINEMAILTEMPS FORMATTING + SENDGRID RHYTHM:
- Real reference emails use short SendGrid text beats, linked images, and 2-up product columns. Write copy that supports 3-5 concise text paragraphs, 5-8 linked image/product moments, and 6-10 column modules.
- OPENER MECHANICS (rotate each send — pick one, state it in opener_mechanic QA field):
  • story: "[Persona] here — I thought of you when I saw [product] for 💲[price]." (personal + price in first sentence)
  • fact: "The reason [product] keeps winning attention is simple: [supplied mechanism/proof]." (source-backed product truth)
  • question: "Ever notice how [pain] shows up right when you need [outcome]?" (reader question answered by product)
  • re-engagement: "I know it's been a while, {{first_name}} — but I had to reach out about this." (break silence + reveal)
  • insider reveal: "[Persona] here — I wanted you to see this before anyone else: [product] is [offer]." (exclusive framing)
  • occasion: "With [event/moment] coming up, [product] would be perfect for [recipient/you]." (gifting/timing narrative)
  • direct problem: "If [pain] has been frustrating you, [product] is the exact fix." (pain-to-relief)
- NEVER open with: "Meet [product]", "I hope you're doing well", generic gratitude, a feature list, or a product description without personal framing.
- Brand persona opener voice: Sandra = warm personal price reveal ("I thought of you when I saw Daisy for 💲12.99"); Jordan = curiosity re-engagement ("I know it's been a while — 70% markdown, 100 spots only"); Adele = price-anchored sensory moment ("💲29.99 and it feels like a second skin"); Mary = thoughtful gifting story ("I found the most thoughtful gift for someone who…").
- Use at least one sensory/tactile phrase: "feels like a hug", "buttery soft", "cool on skin", "moves with you", "easy to pull on". Sensory language converts better than feature descriptions.
- Price/offer in first 1-2 sentences when promo is supplied: write exact price like "💲12.99 (regularly 💲89.99)" — not "a great deal" or "significant savings".
- Use renderer-safe inline formatting tokens in body/banner/product copy: ==key phrase== for brand-accent bold, **key phrase** for bold, [Product Name](slug:productslug) for product links, and [short text](home) for the homepage.
- Place 2-4 accent/bold beats across the body, prioritising exact price/offer, proof, product name, deadline, or customer-name moment. Do not color generic greetings.
- Use exactly one natural product-name hyperlink by paragraph 2, then keep later links purposeful. Never use "click here" as link text.
- Product sub_text may use ==...== around exact price/offer; product main_text stays short ALL CAPS; CTA fields must be plain text because the renderer styles CTA buttons.
- Keep body paragraphs 1-2 sentences each. Use a P.S. only when it adds a new proof, urgency, or curiosity beat.`;

const CONTENT_CREATION_CHAIN_RULES = `CONTENT CREATION CHAIN:
- Map every angle and promise back to supplied Audience Insight + Product USP + Context. Do not invent a USP or proof point.
- Insight and USP must match: the product mechanism/benefit must resolve the stated pain, desire, or objection.
- Framework is message order; flow is how it unfolds in the email. Keep the same promise across subject, hero, body, product grid, CTA, and P.S.
- Brief fields are execution specs for copy/design/dev. Keep strategy/QA in UI, and keep exported production brief focused on execution.`;

const PLAYBOOK_OPERATOR_CHECKLIST = `PLAYBOOK OPERATOR CHECKLIST (self-audit before JSON):
1. Hook Contract: one segment insight, one emotion/curiosity, one hero product, one proof/price point, one urgency mechanism, one avoid rule.
2. First 200px: hero product, offer/price signal, CTA path, and brand palette confirm the same promise immediately.
3. Body: opener uses the selected rotation mechanic in 2-3 sentences; paragraph 2 contains one natural product-name link.
4. Proof: every review, rating, count, guarantee, stock, shipping, price, and material claim is supplied in the inputs; otherwise write unattributed qualitative benefit language.
5. Product grid: 4-6 products, even 2-up rows preferred, no orphan final row, price/offer visible in every product block.
6. Subject/preheader: generated last; subject sets the promise, preheader adds a new beat, and {{first_name}} appears in one slot only.
7. Output discipline: no fake Re/Fwd, no grammar errors, no bullet opener, no generic thanks, no "don't let X go to waste", no second competing hook.`;

const UPDATED_PLAYBOOK_CONTENT_FLOW = `UPDATED PLAYBOOK CONTENT FLOW (compact):
- Evidence -> Segment -> Hook -> Flow -> QA. Start from supplied products, prices, reviews, page/product fit, segment state, and last-send fatigue; never average the four brands into generic ecommerce copy.
- One send fixes one job: Access/Delivered drop = improve hero/body/CTA click path; PO/View drop = improve product order, price clarity, fit proof, and page-product match; optout/spam risk = soften urgency and narrow the segment.
- Body fatigue is the active risk: rotate opener mechanics every send (story, fact, question, occasion, re-engagement, insider reveal, direct problem) and change the pain/relief story even when the hero product stays the same.
- Segment versions must preserve the same hook but change motivation: loyal = recognition/first access; at-risk = proof/friction removal; new = quick education/next best product; lapsed = low-risk reason to return; high-return-risk = fit/material clarity.
- Treat frameworks as optional control tools. Use the smallest framework that makes the promise believable; do not force every tactic into one email.`;

const CREATIVE_DIVERGENCE_RULES = `CREATIVE DIVERGENCE RULES:
- Guardrails are constraints, not a script. Create fresh sentence shapes, imagery, and proof paths while preserving the Hook Contract.
- A and B must diverge by reason-to-believe and reader psychology, not just synonyms. Vary at least 4 of: opener mechanic, emotional arc, proof role, product bridge, visual composition, subject style, CTA wording, urgency texture.
- Subject options may use Claude/Gemini/ChatGPT lens labels, but the selected provider may write all of them. The labels represent thinking styles: Claude = strategic/precise, Gemini = curiosity/imagery, ChatGPT = direct-response/action.
- Avoid repeated cross-brand defaults: "reviews + thank you", "meet your new favorite", generic empowerment, generic gratitude, and identical micro-story cadence across campaigns.
- Keep AI creative room: do not over-explain every line; use specific source-backed inputs, then write naturally in the brand persona.`;

const PERFORMANCE_DECISION_RULES = `PERFORMANCE DECISION RULES FROM UPDATED PLAYBOOK:
- Pages are converting near/above the 10% Access->Purchase floor; assume email intent is the leak unless the supplied page/product data says otherwise.
- Use proven hero products first: BG Daisy/Posy/ZipLacy; GL JettJeans/FlexCamo with Icy where relevant; LF StretchActive/Icy; SF Pouchic/TimelessMark.
- Do not broaden list pressure in the copy: +Yahoo/inactive/off-season sends need softer urgency, clear value, and a suppression/list-health note in QA.
- Test priority thinking: CTA above fold, educational vs pure sale, single-product focus vs grid, animated vs static, 2-col vs 3-col, long vs square product images. Do not make cosmetic changes while hook/product fit is weak.`;

const SUBJECT_OPTION_RULES = `SUBJECT/PREHEADER OPTION RULES:
- For EACH segment, produce at least 3 subject/preheader options in subject_lines[segment].options.
- Options must use distinct styles and model_hint labels: Claude strategic, Gemini curiosity, ChatGPT direct-response. If the selected provider writes all text, still label the option by the lens.
- Pick the best pair as subject_lines[segment].subject and preheader.
- Every pair must have a shared_thread: one exact hero product, offer/price, proof, urgency, or emotional phrase that also appears in the hero banner/body.
- Subject, hero banner, and body must share at least one clear thing. Never let a subject introduce a new angle.`;

const BODY_COPY_RULES = `BODY + P.S. RULES:
- Body copy for each segment must be 120-150 words total (aim for 130+). Too short loses engagement; too long loses clicks. Persona-signed. Cover all concrete parts: trigger/occasion, offer or price, hero product, proof/risk reducer, urgency when supplied, and CTA path.
- If bodyLayout is continuous, write 3-5 short paragraphs in one flow before product blocks.
- If bodyLayout is interspersed, write only 1 opener paragraph before product blocks and at most 1 short bridge paragraph after. Do not split two or more storytelling paragraphs around products.
- Add ps as a separate 10-15 word line. It must hit harder than the body: proof, deadline, curiosity, or sharp risk reducer.`;

const PRODUCT_BLOCK_TEMPLATE_RULES = `PRODUCT BLOCK TEMPLATE RULES (apply the selected template to every product block):
- headline_winner (default): main_text = 2-4 word ALL CAPS click-driver. 2 USPs each ≤5 words starting with a verb/adjective. sub_text includes price/offer. popup_badge = BESTSELLER or achievement.
- benefit_pair: main_text ≤4 words. 2 explicit pain→relief benefits as USPs (each ≤5 words, e.g. "Wire-free → No digging"). sub_text = outcome sentence. popup_badge = benefit claim.
- proof_badge: popup_badge = star rating or % loved (e.g. "★4.9 · 2,300+ Reviews"). review carries the trust; USPs ≤4 words each. main_text = short bold claim.
- urgency_badge: popup_badge = scarcity signal (e.g. "LOW STOCK", "SELLING OUT", "LAST CHANCE"). main_text = action prompt (e.g. "CLAIM YOURS"). sub_text = price + deadline. USPs: 1-2 proof facts only.
- price_prominent: sub_text leads with the exact price or discount figure (e.g. "💲12.99 — Today Only"). main_text = short benefit. popup_badge = savings or value signal (e.g. "SAVE 30%").
- Product blocks should feel like headline-led winning templates, not catalog feature paragraphs.
- Product block copy is for text embedded inside the generated product image. The HTML email renderer will not add text or CTA underneath product images.
- Product review/proof must use the supplied product review exactly or be left as an unattributed trust/risk-reducer note. Never invent reviewer names, ages, dates, ratings, counts, or quotes.
- If a template style mentions ratings, review counts, bestseller status, stock scarcity, guarantees, or savings badges, use those only when supplied in the input; otherwise write a qualitative benefit badge.`;


const PRODUCT_IMAGE_BRIEF_RULES = `PRODUCT IMAGE BRIEF RULES (one product image direction per generated email option):
- Each product block needs main_image, sub_image, alt_text, and image_notes.
- main_image: primary product photo direction — specify angle, framing, background, model/flat-lay, lighting, and visible product area.
- sub_image: close-up detail, texture highlight, secondary angle, or motion cue that supports the main image.
- alt_text: screen-reader description — product name + benefit context; no "image of".
- image_notes: one designer tip — palette alignment, safe zone margin, crop, or brand rule reference.
- Product block main_text, sub_text, popup_badge, usps, review, and cta are the text to bake inside the image; the HTML renderer will not add captions or CTA under product images.
- Do not create nested product image A/B options. Option A/B exists at the full-email level.`;

const BANNER_BRIEF_FORMAT = `BANNER BRIEF FORMAT:
- banner.image_guidance MUST be a compact bullet list, not a paragraph.
- Use 4-6 bullets, each 12 words or fewer.
- Cover: first-200px hook, hero product visibility, price/offer signal, palette, composition/crop, CTA path.
- Split banner headlines into main_text_1, main_text_2, main_text_3 — each ALL CAPS line must use a DISTINCT message angle: line 1 = hook/emotion/offer, line 2 = proof/product detail, line 3 = urgency/risk reducer or contrast angle. Never repeat the same angle across lines.
- Split banner support into sub_text_1, sub_text_2, sub_text_3 — vary the angle: sub 1 = offer elaboration, sub 2 = proof or secondary benefit, sub 3 = urgency or CTA path reinforcement.
- Also include cta, review_texts, main_image, sub_image, trust_booster, and emergency.
- main_image describes the dominant hero-product image; sub_image describes the support/close-up image or motion cue.
- trust_booster is supplied proof or risk reducer only; emergency is urgency/deadline only.
- Do not add decorative-only direction; every bullet must clarify the product, offer, or action.`;

const BRAND_PLAYBOOK_RULES: Record<string, string> = {
  bra_goddess: `BRAND RULEBOOK - BraGoddess:
DO: Sandra voice; emotion-first + offer second; Daisy/Daisy 3 first, then Posy/ZipLacy/SonaShape support; comfort, support, lift, and fit relief; soft social urgency; deep rose/crimson #a02338-#d63268.
DON'T: generic empowerment, gratitude opener, bubblegum #f33e8a, muddy #953336, repeated name in subject+preheader, "don't let X go to waste".
SUBJECT: 45-55 chars; name in subject OR preheader; use o.f.f / 💲; preheader adds tension or deadline.`,
  gents_lux: `BRAND RULEBOOK - GentsLux:
DO: Jordan voice; curiosity + scarcity; JettJeans/FlexCamo first, IcyShorts where relevant; mechanism copy around movement, waistband, cooling, durability; understated confidence; deep navy #002850-#1d3d56.
DON'T: cute puns, over-luxury language, grammar errors, loud hype, weak navy #26508d/#013faa/#183647, over-specified subject discounts.
SUBJECT: 48-58 chars; name mid-subject; imply offer in subject, reveal scale in preheader.`,
  lux_fitting: `BRAND RULEBOOK - LuxFitting:
DO: Adele voice; price-anchored sensory promise; StretchActive first, Icy Shorts where relevant, then SoftyGrace/AiryGrace/LinenGlam support; outfit ease, comfort, one practical tip; #e7324a/#fe397b.
DON'T: mixed hooks, "Be hurry!", unsupported health claims, red #d51c18, dull pink #d5255c, birthday+spring+discount+countdown stacking.
SUBJECT: 44-56 chars; specific price/% every time; 💲 or spaced O.F.F; preheader escalates.`,
  santa_fare: `BRAND RULEBOOK - SantaFare:
DO: Mary voice; suspended loop + gifting; Pouchic + TimelessMark first, BygoneMark support; named gifting micro-story; 4 products; reluctant calm urgency; deep scarlet #890106-#c00f28.
DON'T: bright cheerfulness, pink #d43268, orange-red #d02c16, broad off-season sends, generic accessory grid, countdown-clock energy.
SUBJECT: 42-56 chars; name often in preheader; use SAVING/O.F.F; reluctant deadline or revelation.`,
};

// ---- validation pattern banks ----
const SPAM_WORDS = ["free!", "winner", "congratulations", "click here", "limited time offer", "act now", "urgent"];
const WEAK_COPY = ["i hope this email finds you well", "meet your new favorite", "meet the ", "meet your ", "introducing the ", "amazing value", "great quality", "don't miss out", "dont miss out"];
const BODY_HARD_SELL_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "act now", pattern: /\bact now\b/gi },
  { label: "buy now", pattern: /\bbuy now\b/gi },
  { label: "hurry", pattern: /\bhurry\b/gi },
  { label: "don't miss", pattern: /\bdon'?t miss(?: out)?\b/gi },
  { label: "last chance", pattern: /\blast chance\b/gi },
  { label: "claim now", pattern: /\bclaim (?:now|yours|this|it|them)\b/gi },
  { label: "grab now", pattern: /\bgrab (?:now|yours|this|it|them|these)\b/gi },
  { label: "rush", pattern: /\brush\b/gi },
  { label: "selling out", pattern: /\bselling out\b/gi },
  { label: "before gone", pattern: /\bbefore (?:it'?s|they'?re|these are) gone\b/gi },
];
const BRAND_PERSONA_NAMES: Record<string, string> = {
  bra_goddess: "Sandra",
  gents_lux: "Jordan",
  lux_fitting: "Adele",
  santa_fare: "Mary",
};
const OPTOUT_RISK = ["for older women", "hide your", "fix your body", "anti aging", "look younger", "flaws"];
const UNSUPPLIED_PROOF = ["clinically proven", "doctor recommended", "medically proven", "guaranteed results", "thousands of customers", "rated #1", "scientifically proven"];
const WEAK_CTA = ["click here", "learn more", "shop now", "discover more", "see more"];
const HOOK_STACK = ["birthday", "anniversary", "spring", "summer", "mother", "review", "thank", "countdown", "last chance", "ending", "comfort", "sale", "gift", "free shipping"];
const BULLET_OPENER = /^\s*(?:[•*-]|✅|✓|✔|\d+\.)\s+/;
const MARKDOWN_PRODUCT_LINK = /\[[^\]]+\]\(slug:[a-z0-9_-]+\)/i;
const MARKDOWN_ANY_LINK = /\[[^\]]+\]\((?:slug:[a-z0-9_-]+|home)\)/i;
const ACCENT_MARKER = /==[^=]+==/g;
const BOLD_MARKER = /\*\*[^*]+\*\*/g;
const THEME_STOPWORDS = new Set(["sale", "email", "campaign", "offer", "promo", "spring", "summer", "winter", "fall", "thank", "thanks"]);

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

const CREATIVE_LEVER_BANKS: Record<string, {
  creativeLenses: string[];
  proofRoles: string[];
  subjectStyles: string[];
  visualDirections: string[];
}> = {
  bra_goddess: {
    creativeLenses: [
      "fit rescue: one specific discomfort becomes the reason to click",
      "confidence ritual: the product upgrades a familiar daily routine",
      "first-look comfort reward for buyers who already trust the brand",
      "collection completion: bra plus support item feels like the missing piece",
    ],
    proofRoles: [
      "use the supplied review as a quiet reassurance, not the headline",
      "use price as the proof of why now, then comfort as the reason to stay",
      "use product mechanism as proof: closure, straps, lift, smoothing, fabric",
      "use shipping/return facts only as friction removal near the action",
    ],
    subjectStyles: [
      "emotion-first with price second",
      "soft curiosity with comfort payoff",
      "specific pain relief with deadline beat",
      "warm personal note with offer reveal",
    ],
    visualDirections: [
      "mature model, natural smile, hero bra clearly visible, rose-crimson palette",
      "close crop on fit/support detail with simple price badge",
      "soft lifestyle dressing moment with product and CTA above fold",
      "clean product-forward hero with one comfort proof line",
    ],
  },
  gents_lux: {
    creativeLenses: [
      "mechanism reveal: show why the pants move better",
      "understated scarcity: the useful item may not stay at this price",
      "wardrobe completion: the missing bottom/top makes existing pieces work harder",
      "premium practicality: sharp enough outside, comfortable enough all day",
    ],
    proofRoles: [
      "use one material/mechanism fact as the trust anchor",
      "use price reveal as the payoff after curiosity",
      "use supplied review as plainspoken evidence from another man",
      "use durability/cooling/stretch as proof only when supplied by product USPs",
    ],
    subjectStyles: [
      "curiosity gap with offer reveal in preheader",
      "scarcity with restrained language",
      "mechanism-first promise",
      "direct practical problem",
    ],
    visualDirections: [
      "deep navy product-forward studio shot, no loud hype",
      "movement pose showing bend/walk/sit without stiffness",
      "detail shot of waistband/pockets/fabric with restrained badge",
      "outdoor practical scene with CTA and price visible above fold",
    ],
  },
  lux_fitting: {
    creativeLenses: [
      "sensory price anchor: the feel makes the price surprising",
      "outfit ease: one piece solves a daily getting-ready problem",
      "movement confidence: fabric follows the body without fuss",
      "practical seasonal tip: one styling/use moment justifies the send",
    ],
    proofRoles: [
      "use price as the quick decision proof",
      "use sensory language as the reason to click, not vague empowerment",
      "use supplied review as a tactile confirmation",
      "use fabric/stretch mechanism as proof when the product USP supports it",
    ],
    subjectStyles: [
      "price-anchored sensory comparison",
      "specific comfort question",
      "outfit problem with quick reveal",
      "deadline escalation without panic",
    ],
    visualDirections: [
      "movement silhouette with product shape readable and pink-red palette",
      "close textile/drape detail with concise price badge",
      "bright but elegant outfit-ready scene, no crowded collage",
      "product-forward hero with one practical styling cue",
    ],
  },
  santa_fare: {
    creativeLenses: [
      "suspended gifting loop: something thoughtful is nearly unclaimed",
      "named gift story: one recipient moment makes the product desirable",
      "reluctant deadline: calm urgency without countdown energy",
      "personalization value: the small detail makes the gift feel chosen",
    ],
    proofRoles: [
      "use material/personalization facts as proof of thoughtfulness",
      "use price as the reason to act after the gift story",
      "use supplied review as a gentle trust cue, not a fake verified claim",
      "use shipping/deadline only when supplied and relevant to gifting",
    ],
    subjectStyles: [
      "suspended loop with name in preheader",
      "reluctant deadline reveal",
      "gift status curiosity",
      "thoughtful recommendation with price or saving second",
    ],
    visualDirections: [
      "deep scarlet gift scene with product close-up and calm CTA",
      "hands/personalization detail, premium texture, no cheerful clutter",
      "recipient moment with Pouchic or TimelessMark visible above fold",
      "clean product pair with engraving detail and reluctant deadline badge",
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
    key: "fact",
    label: "Fact / Product Truth",
    directive: (_char, _role, pain, _persona) =>
      `Open with one source-backed product truth or supplied fact tied to "${pain}". If no hard fact is supplied, use a concrete qualitative product truth from the product USPs. Do not invent numbers, ratings, stock, or guarantees.`,
  },
  {
    key: "question",
    label: "Reader Question",
    directive: (_char, _role, pain, _persona) =>
      `Open with one natural question about "${pain}" or the campaign occasion, then answer it with the hero product and offer by sentence 2. Keep it conversational, not quiz-like.`,
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

const SEGMENT_BODY_MOVES = [
  {
    label: "Recognition -> useful next step",
    directive: "open by recognizing what this buyer already values, then make the hero product feel like the natural next useful piece",
  },
  {
    label: "Objection -> quiet proof",
    directive: "open from the likely hesitation, then answer it with one supplied USP, review, return, price, or shipping fact",
  },
  {
    label: "Use moment -> product fit",
    directive: "open inside a specific wear/gift/use moment, then show why the product fits that moment better than a generic option",
  },
  {
    label: "Low-risk return",
    directive: "open softly for someone who has not clicked or bought recently, then lower friction before asking for the click",
  },
  {
    label: "Completion bridge",
    directive: "connect what this segment likely bought or browsed before to the missing complementary product in this send",
  },
  {
    label: "Sensory proof",
    directive: "lead with a tactile or visual detail from the product, then let the offer support that believable product reason",
  },
  {
    label: "Reluctant urgency",
    directive: "state the time limit calmly as a constraint, not excitement; the brand sounds helpful, not pushy",
  },
] as const;

const SEGMENT_SOFT_SELL_MODES = [
  "The offer appears after the human reason, as a helpful detail.",
  "Use one calm CTA sentence; avoid hurry/grab/claim language in the body.",
  "Make the urgency reluctant or practical, never countdown energy.",
  "Use a service tone: 'I picked this because...', not 'you must buy now'.",
  "Let product proof do the selling; the discount should not carry the paragraph.",
] as const;

export function selectVarietyProfile(campaign: Campaign): BodyVarietyProfile {
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
  ].join("::"));
  const banks = VARIETY_BANKS[campaign.brandId] || VARIETY_BANKS.bra_goddess;
  const levers = CREATIVE_LEVER_BANKS[campaign.brandId] || CREATIVE_LEVER_BANKS.bra_goddess;
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
  const creativeLens = levers.creativeLenses[(seed >> 13) % levers.creativeLenses.length];
  const proofRole = levers.proofRoles[(seed >> 15) % levers.proofRoles.length];
  const subjectStyle = levers.subjectStyles[(seed >> 17) % levers.subjectStyles.length];
  const visualDirection = levers.visualDirections[(seed >> 19) % levers.visualDirections.length];

  return {
    openerMechanic: mechanic.key,
    openerMechanicLabel: mechanic.label,
    namedCharacter: char.name,
    characterRole: char.role,
    painPoint: pain,
    sensoryPhrase: sensory,
    emotionalArc: arc.key,
    emotionalArcLabel: arc.label,
    creativeLens,
    proofRole,
    subjectStyle,
    visualDirection,
    _openerDirective: mechanic.directive(char.name, char.role, pain, persona),
    _arcDirective: arc.directive,
  } as BodyVarietyProfile & { _openerDirective: string; _arcDirective: string };
}

// ---- helpers ----
export function segJsonKey(id: string): string {
  return "seg_" + id.replace(/-/g, "_");
}
export function urgencyLabel(u: Urgency): string {
  return { h24: "24 hrs - ends midnight tonight", h48: "48 hrs", weekend: "Weekend only", none: "No hard deadline" }[u] || u;
}
export function promoLine(c: Campaign): string {
  const parts = [c.offerValue, c.offerShipping].map((p) => p?.trim()).filter(Boolean);
  if (!parts.length) return `No promo this send. Urgency: ${urgencyLabel(c.urgency)}.`;
  return `${parts.join(" + ")} - ${urgencyLabel(c.urgency)}`;
}
function bodyLayoutLabel(c: Campaign): string {
  if (c.bodyLayout === "custom") {
    return `custom drag/drop module flow: ${(c.moduleLayout || []).join(" -> ") || "use supplied preset suggestions"}`;
  }
  return c.bodyLayout === "interspersed"
    ? "interspersed: one opener before product blocks, then at most one bridge/P.S. after"
    : "continuous: one uninterrupted body section before product blocks";
}
function productCopyStyleLabel(c: Campaign): string {
  const labels: Record<string, string> = {
    headline_winner: "headline_winner: winning template default, short headline does the work, USPs stay tiny",
    benefit_pair: "benefit_pair: two compact pain-to-relief benefit cues",
    proof_badge: "proof_badge: trust badge/review leads, USPs stay minimal",
    urgency_badge: "urgency_badge: supplied scarcity/deadline popup_badge leads, action main_text, price + deadline in sub_text",
    price_prominent: "price_prominent: exact price or discount figure leads in sub_text, popup_badge shows savings signal",
  };
  return labels[c.productCopyStyle || "headline_winner"] || labels["headline_winner"];
}
function segLabel(brandId: string, code: string): string {
  return BRANDS[brandId]?.productSegments.find((s) => s.code === code)?.label || code;
}
function segMeta(brandId: string, code: string): string {
  return BRANDS[brandId]?.productSegments.find((s) => s.code === code)?.meta || "";
}
function segGuidance(brandId: string, code: string): string {
  return BRANDS[brandId]?.productSegments.find((s) => s.code === code)?.guidance || "";
}
function segmentBodyDirectionLines(campaign: Campaign): string {
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
  ].join("::"));
  return campaign.segments
    .map((id, i) => {
      const label = segLabel(campaign.brandId, id);
      const meta = segMeta(campaign.brandId, id);
      const guidance = segGuidance(campaign.brandId, id) || meta || "Use the segment label as the buyer motivation.";
      const move = SEGMENT_BODY_MOVES[(seed + i * 2) % SEGMENT_BODY_MOVES.length];
      const softSell = SEGMENT_SOFT_SELL_MODES[(seed + i) % SEGMENT_SOFT_SELL_MODES.length];
      return `• body.${segJsonKey(id)} (${id} ${label}${meta ? ` — ${meta}` : ""}): audience motive: ${guidance} Copy move: ${move.label} — ${move.directive}. Soft-sell mode: ${softSell}`;
    })
    .join("\n");
}
function wordCount(s: string): number {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}
function norm(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9{}]+/g, " ").replace(/\s+/g, " ").trim();
}
function stripCopyMarkup(s: string): string {
  return String(s || "")
    .replace(/\[([^\]]+)\]\((?:slug:[^)]+|home)\)/gi, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
function firstParagraph(s: string): string {
  return stripCopyMarkup(s).split(/\n{2,}/).map((p) => p.trim()).find(Boolean) || "";
}
function openingStart(s: string): string {
  return norm(firstParagraph(s)).split(" ").filter(Boolean).slice(0, 8).join(" ");
}
function ngramSet(s: string, size = 5): Set<string> {
  const words = norm(stripCopyMarkup(s)).split(" ").filter((w) => w.length > 2 && !THEME_STOPWORDS.has(w));
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    grams.add(words.slice(i, i + size).join(" "));
  }
  return grams;
}
function phraseOverlap(a: string, b: string, size = 5): number {
  const left = ngramSet(a, size);
  const right = ngramSet(b, size);
  const denom = Math.min(left.size, right.size);
  if (!denom) return 0;
  let shared = 0;
  left.forEach((gram) => {
    if (right.has(gram)) shared++;
  });
  return shared / denom;
}
function hardSellHits(s: string): string[] {
  const hits: string[] = [];
  BODY_HARD_SELL_PATTERNS.forEach(({ label, pattern }) => {
    pattern.lastIndex = 0;
    if (pattern.test(s)) hits.push(label);
  });
  return hits;
}
function similarity(a: string, b: string): number {
  const l = new Set(norm(a).split(" ").filter(Boolean));
  const r = new Set(norm(b).split(" ").filter(Boolean));
  if (!l.size || !r.size) return 0;
  const shared = [...l].filter((w) => r.has(w)).length;
  return shared / Math.max(l.size, r.size);
}
function significantWords(s: string): string[] {
  return norm(String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2")).split(" ").filter((w) => w.length >= 4 && !THEME_STOPWORDS.has(w));
}
function containsSignificantReference(text: string, reference?: string): boolean {
  if (!reference) return true;
  const target = norm(text);
  const compactTarget = target.replace(/\s+/g, "");
  const words = significantWords(reference);
  const compactReference = norm(reference).replace(/\s+/g, "");
  const checks = compactReference.length >= 4 ? [...words, compactReference] : words;
  return !checks.length || checks.some((w) => target.includes(w) || compactTarget.includes(w));
}
function sharesContentThread(subjectish: string, bodyish: string, products: Product[], campaign: Campaign): boolean {
  const left = norm(subjectish);
  const right = norm(bodyish);
  if (!left || !right) return false;
  const offerNums = promoLine(campaign).match(/\d+(?:\.\d+)?/g) || [];
  if (offerNums.some((n) => left.includes(n) && right.includes(n))) return true;
  const productTokens = products.flatMap((p) => significantWords(p.name));
  if (productTokens.some((w) => left.includes(w) && right.includes(w))) return true;
  return significantWords(subjectish).some((w) => right.includes(w));
}
function hasOfferSignal(text: string, campaign: Campaign): boolean {
  const promo = promoLine(campaign);
  if (/^No promo/i.test(promo)) return true;
  const target = norm(text);
  const numbers = promo.match(/\d+(?:\.\d+)?/g) || [];
  if (numbers.some((n) => target.includes(n))) return true;
  return /free shipping|shipping|ship|saving|o f f|off/.test(target);
}
function hasAttributedReview(text: string): boolean {
  return /["“”']/.test(text) && /(?:—|-)\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?/.test(text);
}
function matchesSuppliedReview(text: string, source?: string): boolean {
  if (!text.trim()) return true;
  if (!hasAttributedReview(text)) return true;
  return !!source && norm(text) === norm(source);
}
function truncateForPrompt(text: string, max = 1200): string {
  const clean = String(text || "").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "\n[truncated]" : clean;
}
function renderPromptLayers(layers: { title: string; body?: string }[]): string {
  return layers
    .map((layer) => ({ ...layer, body: layer.body?.trim() }))
    .filter((layer) => layer.body)
    .map((layer) => `## ${layer.title}\n${layer.body}`)
    .join("\n\n");
}

const CORE_PROMPT_LAYER = `Return JSON only. Build in this order: evidence -> segment -> hook contract -> banner/body/products -> subject/preheader -> QA.
One send = one promise. Subject, preheader, hero, body, product grid, CTA, and P.S. must share the same product/offer/proof/emotion thread.
Use supplied facts only for reviews, ratings, counts, guarantees, stock, shipping, prices, and urgency. If proof is missing, write qualitative benefit language.
Never use fake Re/Fwd, "click here", "learn more", "I hope this email finds you well", "meet your new favorite", "don't let X go to waste", generic gratitude, grammar errors, unsupported medical/age claims, or body/age shaming.
Use {{first_name}} in subject OR preheader, never both. Replace $ with 💲 in promo copy; use brand off-symbol rules.`;

const CREATIVE_PROMPT_LAYER = `Guardrails are constraints, not a script. Let the model write fresh language.
A/B options must differ by at least four: angle, framework, opener mechanic, emotional arc, proof role, product bridge, subject style, visual direction, CTA wording, urgency texture.
Rotate opener mechanics: story, fact, question, occasion, re-engagement, insider reveal, or direct problem. Avoid repeating the last-send structure.
Segment versions keep one hook but adapt motivation: loyal = recognition/first access; at-risk = proof/friction removal; new = quick education/next product; lapsed = low-risk return reason; high-return-risk = fit/material clarity.
Multi-segment body copy must not be cloned paragraph skeletons. Change the first sentence, proof/risk reducer, product bridge, and final line for every segment.`;

const COMPONENT_PROMPT_LAYER = `Subject/preheader: 3+ paired options per segment, distinct Claude/Gemini/ChatGPT-style lenses, subject hard cap 60, preheader 60-90, preheader adds a new beat.
Body: 120-150 words per segment, persona-signed, selected opener in 2-3 sentences, product-name markdown link by paragraph 2, 2-4 bold/accent/link beats, P.S. 10-15 words. Tone is personal-note first: product fit before promo, one calm urgency beat, no hard-sell command stack.
Banner: main_text_1/2/3 and sub_text_1/2/3 each use distinct angles; image_guidance is 4-6 compact bullets covering first 200px, product, offer, palette, crop, CTA path.
Products: 4-6 products, even count preferred; SantaFare defaults to 4. main_text <=5 words, CTA 2-4 words plain text, USPs <=5 words. HTML product modules use linked images only, so product text/CTA should be written as text to bake into each image.
${PRODUCT_IMAGE_BRIEF_RULES}`;

const SENDGRID_HTML_PROMPT_LAYER = `SendGrid/WinEmailTemps April 2026 fit:
- Structure for renderer: hidden preheader, optional logo, linked hero image, concise caption text, short body modules, linked product-image modules, P.S., footer.
- Use renderer-safe tokens only in generated copy: ==accent==, **bold**, [Product](slug:slug), [home text](home). Do not output raw HTML in JSON copy fields.
- Product modules are image-only links in HTML; product block text/CTA is brief copy to bake inside images, not captions under images.
- Footer is handled by renderer: thanks line, product/purchase placeholders, opt-out-below sentence, reply/contact-list reminder, homepage, 1851 Central Park Loop address, Privacy Policy, Exchanges & Returns. Do not write a second footer in body/P.S.
- HTML expectations for QA: clicktracking off on links, descriptive alt text, max-width responsive images, role=module/table layout compatibility, light-background SendGrid design.`;

const PERFORMANCE_PROMPT_LAYER = `Pages are generally converting; assume email intent is the leak unless supplied page/product data says otherwise.
Access/Delivered drop -> improve hero/body/CTA path. PO/View drop -> improve product order, price clarity, fit proof, page-product match. Optout/spam risk -> softer urgency and narrower list.
Prioritize proven heroes: BG Daisy/Posy/ZipLacy; GL JettJeans/FlexCamo/Icy; LF StretchActive/Icy; SF Pouchic/TimelessMark.`;

// ---- prompt builders ----
/** The clause appended to Option B's system prompt forcing a different angle + framework than A. */
export function contrastInstruction(optionADirection: GenCreativeDirection): string {
  return `\nCRITICAL CONTRAST REQUIREMENT:\nOption A used Angle: ${optionADirection.angle}, Framework: ${optionADirection.framework}.\nYou MUST choose a DIFFERENT angle AND a DIFFERENT framework for Option B. State them in creative_direction BEFORE writing copy. Reusing either is INVALID.`;
}

export function buildSystemPrompt(
  campaign: Campaign,
  products: Product[],
  isOptionB: boolean,
  optionADirection?: GenCreativeDirection
): string {
  const brand = BRANDS[campaign.brandId];
  const productContext = products
    .map((p, i) => {
      const usps = (p.usps || []).filter(Boolean);
      return `${i + 1}${i === 0 ? " HERO" : ""}. ${p.name} | ${p.url || "no URL"} | 💲${p.price} | USP: ${usps.join("; ") || "none"} | review: ${p.review || "none"}`;
    })
    .join("\n");
  const segContext = campaign.segments
    .map((id) => {
      const g = segGuidance(campaign.brandId, id);
      return `${id}: ${segLabel(campaign.brandId, id)} | ${segMeta(campaign.brandId, id)}${g ? " | " + g : ""}`;
    })
    .join("\n");

  const subjectSchema = campaign.segments
    .map((id) => `"${segJsonKey(id)}":{"subject":"","preheader":"","style":"","model_hint":"","shared_thread":"","options":[{"style":"strategic","model_hint":"Claude strategic","subject":"","preheader":"","shared_thread":""},{"style":"curiosity","model_hint":"Gemini curiosity","subject":"","preheader":"","shared_thread":""},{"style":"direct-response","model_hint":"ChatGPT direct-response","subject":"","preheader":"","shared_thread":""}]}`)
    .join(",\n    ");
  const bodySchema = campaign.segments
    .map((id) => `"${segJsonKey(id)}":""`)
    .join(",\n    ");
  const bodySchemaHint = campaign.bodyLayout === "interspersed"
    ? "120-150 words; opener before products, optional bridge after; use ==accent==, **bold**, [Product](slug:slug)"
    : campaign.bodyLayout === "custom"
      ? "120-150 words; 1-3 modular paragraphs; use ==accent==, **bold**, [Product](slug:slug)"
      : "120-150 words; 3-5 short paragraphs; use ==accent==, **bold**, [Product](slug:slug)";
  const productSchema = products
    .map(
      (_, i) => `{"slot":${i + 1},"name":"","template_style":"${campaign.productCopyStyle || "headline_winner"}","main_text":"","sub_text":"","popup_badge":"","usps":["",""],"review":"","cta":"","main_image":"","sub_image":"","alt_text":"","image_notes":""}`
    )
    .join(",\n    ");

  const contrast = isOptionB && optionADirection ? contrastInstruction(optionADirection) : "";
  const winning = campaign.winningContent?.trim()
    ? `Mirror structure/pacing only; write new copy:\n${truncateForPrompt(campaign.winningContent, 900)}`
    : "";
  const perfContext = campaign.customPerfContext?.trim()
    ? truncateForPrompt(campaign.customPerfContext, 1200)
    : intelligencePromptBlock(campaign.brandId);
  const outputSchema = `{
  "creative_direction": {
    "angle": "<${PLAYBOOK_ANGLES.join("|")}>",
    "framework": "<${PLAYBOOK_FRAMEWORKS.join("|")}>",
    "hook_contract": { "segment_insight": "", "emotion": "", "hero_product": "", "proof_or_price": "", "urgency": "", "avoid_rule": "" },
    "flow": "<one sentence: banner to CTA journey>",
    "differentiator": "<what makes this option distinct>"
  },
  "subject_lines": {
    ${subjectSchema}
  },
  "theme": "<visual brief for the designer>",
  "banner": {
    "logo_stars":"","main_text":"","sub_text":"","main_text_1":"","main_text_2":"","main_text_3":"",
    "sub_text_1":"","sub_text_2":"","sub_text_3":"","image_guidance":"- bullet\n- bullet\n- bullet\n- bullet",
    "review_quote":"","review_texts":[""],"main_image":"","sub_image":"","trust_booster":"","emergency":"","cta":""
  },
  "body": {
    "base": "${bodySchemaHint}",
    ${bodySchema}
  },
  "ps": "",
  "products": [
    ${productSchema}
  ],
  "quality_checks": {
    "click_reason":"","hook_alignment":"","proof_safety":"","spam_risk":"","optout_risk":"","photo_watchout":"",
    "first_200px":"","inline_link_plan":"","layout_risk":"","playbook_dos_donts":"","brand_rule_alignment":"",
    "accessibility_layout":"","opener_mechanic":"","hook_coherence":"","cta_assessment":""
  }
}`;

  return renderPromptLayers([
    {
      title: "Role",
      body: `You are an expert ecommerce email copywriter for ${brand.name}. Persona: ${brand.persona}. Voice: ${brand.voice}. Layout: ${brand.layout}.`,
    },
    {
      title: "Campaign Inputs",
      body: `Products:\n${productContext}\n\nSegments:\n${segContext}\n\nBody layout: ${bodyLayoutLabel(campaign)}\nProduct copy template: ${productCopyStyleLabel(campaign)}`,
    },
    { title: "Core Rules", body: CORE_PROMPT_LAYER },
    { title: "Creative Variation", body: CREATIVE_PROMPT_LAYER },
    { title: "Component Rules", body: COMPONENT_PROMPT_LAYER },
    { title: "SendGrid HTML Fit", body: SENDGRID_HTML_PROMPT_LAYER },
    { title: "Brand Rules", body: BRAND_PLAYBOOK_RULES[campaign.brandId] || "" },
    { title: "Performance Lens", body: `${PERFORMANCE_PROMPT_LAYER}\n${perfContext}` },
    { title: "Option Contrast", body: contrast },
    { title: "Winning Reference", body: winning },
    {
      title: "Output Contract",
      body: `Return ONLY valid JSON. No prose, no markdown fence. Escape quotes inside strings.\n${outputSchema}`,
    },
  ]);
}

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
    ? `\nCREATIVE VARIETY DIRECTION — required constraints, not a script:
• Opener mechanic to use: ${variety.openerMechanicLabel} — ${variety._openerDirective || ""}
• Creative lens: ${variety.creativeLens}
• Proof role: ${variety.proofRole}
• Subject style to favor: ${variety.subjectStyle}
• Visual direction to favor: ${variety.visualDirection}
• Optional story seed: ${variety.namedCharacter} (${variety.characterRole}). Use this named person only if it helps the chosen opener; do not force a character into fact/question/direct-problem openers.
• Pain territory: "${variety.painPoint}" — use this pain scenario or a fresh close variant in the first 1-2 sentences.
• Sensory territory: "${variety.sensoryPhrase}" — include this phrase or a fresh equivalent.
• Emotional arc: ${variety.emotionalArcLabel} — ${variety._arcDirective || ""}
Write naturally in the brand persona, avoid repeating sentence skeletons from prior campaigns, and record the opener mechanic label in quality_checks.opener_mechanic.`
    : "";
  const segmentBodyMandate = campaign.segments.length > 1
    ? `\nSEGMENT BODY DIFFERENTIATION — required:
Keep one Hook Contract across all segments, but body text must be meaningfully different by segment. Do not rewrite the same paragraph skeleton with different nouns.
${segmentBodyDirectionLines(campaign)}
For every segment body, change all four: first sentence entry point, proof/risk reducer, product bridge sentence, and final sign-off/CTA sentence.`
    : "";
  const winToneMandate = `\nWINEMAILTEMPS TONE CALIBRATION — required:
Recent winning emails read like a short personal note: one concrete moment or pain, then product fit, then offer as a helpful detail. The body should not sound like a sale alert.
Use calm phrasing such as "I picked this because...", "take a look while it is still open", or "this may be useful if..." instead of stacking "hurry", "grab", "claim", "act now", or "don't miss".
Do not copy those example phrases verbatim across segments; they show tone only.
Mention price/offer/urgency clearly, but limit the body to one sales command at most. Let the product proof and segment motive do most of the selling.`;

  return renderPromptLayers([
    {
      title: "Generation Request",
      body: `Generate Option ${isB ? "B" : "A"} as a complete email brief. Lead with creative_direction, then fill every JSON section.`,
    },
    {
      title: "Campaign",
      body: `Brand: ${BRANDS[campaign.brandId].name}
Send date: ${campaign.sendDate}
Theme: ${campaign.theme}
Hook input: ${campaign.hookContract?.trim() || "Construct one from segment, hero product, offer, urgency, proof, avoid rules."}
Promo: ${promoLine(campaign)}
Body layout: ${bodyLayoutLabel(campaign)}
Product template: ${productCopyStyleLabel(campaign)}
Recipient token: ${campaign.recipientName}${lastSend}${recentAvoid}`,
    },
    { title: "Creative Variety", body: varietyMandate },
    { title: "Segment Body Differentiation", body: segmentBodyMandate },
    { title: "Tone Calibration", body: winToneMandate },
  ]);
}

// ---- validation ----
function addFlag(b: GenBrief, type: Flag["type"], msg: string) {
  (b._flags ||= []).push({ type, msg });
}

export function validateBrief(brief: GenBrief, campaign: Campaign, products: Product[] = []): GenBrief {
  brief._flags = [];
  const subjectMax = BRANDS[campaign.brandId]?.subjectMax || 58;

  (["creative_direction", "subject_lines", "theme", "banner", "body", "products", "quality_checks"] as const).forEach(
    (f) => {
      if (!brief[f]) addFlag(brief, "error", "Missing required field: " + f);
    }
  );

  const sl = brief.subject_lines || {};
  campaign.segments.forEach((id) => {
    if (!sl[segJsonKey(id)]) addFlag(brief, "error", "Missing subject/preheader for segment " + id);
  });
  Object.entries(sl).forEach(([seg, v]) => {
    const s = v.subject || "", p = v.preheader || "";
    const opts = Array.isArray(v.options) ? v.options : [];
    if (s.length > 60) addFlag(brief, "warn", `${seg} subject over hard cap (${s.length} > 60)`);
    else if (s.length > subjectMax) addFlag(brief, "warn", `${seg} subject above target (${s.length} > ${subjectMax})`);
    if (s && s.length < 42) addFlag(brief, "warn", `${seg} subject may be too short (${s.length})`);
    if (p && (p.length < 60 || p.length > 90)) addFlag(brief, "warn", `${seg} preheader length ${p.length} (target 60-90)`);
    if (/{{\s*first_name\s*}}/i.test(s) && /{{\s*first_name\s*}}/i.test(p)) addFlag(brief, "warn", `${seg} repeats {{first_name}} in subject + preheader`);
    if (!/{{\s*first_name\s*}}/i.test(s + " " + p)) addFlag(brief, "warn", `${seg} missing {{first_name}} in subject/preheader pair`);
    if (similarity(s, p) > 0.55) addFlag(brief, "warn", `${seg} subject and preheader too similar`);
    if (opts.length < 3) addFlag(brief, "warn", `${seg} needs 3+ subject/preheader options`);
    opts.forEach((o, i) => {
      if (!o.style) addFlag(brief, "warn", `${seg} option ${i + 1} missing style`);
      if (!o.model_hint) addFlag(brief, "warn", `${seg} option ${i + 1} missing model_hint`);
      if (!o.shared_thread) addFlag(brief, "warn", `${seg} option ${i + 1} missing shared_thread`);
      if ((o.subject || "").length > 60) addFlag(brief, "warn", `${seg} option ${i + 1} subject over hard cap`);
      if (o.preheader && (o.preheader.length < 60 || o.preheader.length > 90)) {
        addFlag(brief, "warn", `${seg} option ${i + 1} preheader length ${o.preheader.length} (target 60-90)`);
      }
    });
    const optionStyles = opts.map((o) => norm(o.style || o.model_hint || "")).filter(Boolean);
    if (optionStyles.length >= 3 && new Set(optionStyles).size < 3) {
      addFlag(brief, "warn", `${seg} subject options need distinct style/model lenses`);
    }
    for (let i = 0; i < opts.length; i++) {
      for (let j = i + 1; j < opts.length; j++) {
        if (similarity(opts[i].subject || "", opts[j].subject || "") > 0.78) {
          addFlag(brief, "warn", `${seg} subject options ${i + 1}/${j + 1} are too similar`);
        }
        if (similarity(opts[i].preheader || "", opts[j].preheader || "") > 0.78) {
          addFlag(brief, "warn", `${seg} preheader options ${i + 1}/${j + 1} are too similar`);
        }
      }
    }
    const hits = HOOK_STACK.filter((w) => (s + " " + p).toLowerCase().includes(w));
    if (hits.length >= 4) addFlag(brief, "warn", `${seg} stacking hooks: ${hits.join(", ")}`);
  });

  const body = brief.body || {};
  campaign.segments.forEach((id) => {
    if (!body[segJsonKey(id)]) addFlag(brief, "warn", "Missing body variant for segment " + id);
  });

  const richText = JSON.stringify({ ba: brief.banner, bo: brief.body, p: brief.products });
  const accentMarks = richText.match(ACCENT_MARKER)?.length || 0;
  const boldMarks = richText.match(BOLD_MARKER)?.length || 0;
  const full = JSON.stringify({ s: brief.subject_lines, t: brief.theme, ba: brief.banner, bo: brief.body, p: brief.products }).toLowerCase();
  SPAM_WORDS.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Spam word: "${w}"`));
  WEAK_COPY.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Weak/generic copy: "${w}"`));
  OPTOUT_RISK.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Opt-out risk wording: "${w}"`));
  UNSUPPLIED_PROOF.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Possibly invented proof: "${w}"`));
  const intel = getBrandIntelligence(campaign.brandId);
  intel?.avoid.forEach((pat) => {
    const scan = pat.replace(/^hyperbole like\s+/i, "").toLowerCase();
    if (scan.length > 8 && full.includes(scan)) addFlag(brief, "warn", `Brand avoid pattern: "${pat}"`);
  });

  const cd = brief.creative_direction || ({} as GenCreativeDirection);
  if (cd.angle && !PLAYBOOK_ANGLES.includes(cd.angle)) addFlag(brief, "warn", "Non-playbook angle: " + cd.angle);
  if (cd.framework && !PLAYBOOK_FRAMEWORKS.includes(cd.framework)) addFlag(brief, "warn", "Non-playbook framework: " + cd.framework);
  const hc = cd.hook_contract || ({} as GenHookContract);
  (["segment_insight", "emotion", "hero_product", "proof_or_price", "urgency", "avoid_rule"] as const).forEach((f) => {
    if (!hc[f]) addFlag(brief, "warn", "Hook contract missing: " + f);
  });

  const banner = brief.banner || ({} as GenBanner);
  const bannerMain = [banner.main_text_1, banner.main_text_2, banner.main_text_3, banner.main_text].filter(Boolean).join("\n");
  const bannerSub = [banner.sub_text_1, banner.sub_text_2, banner.sub_text_3, banner.sub_text].filter(Boolean).join("\n");
  const heroProductName = products[0]?.name || hc.hero_product;
  const bannerSurface = [bannerMain, bannerSub, banner.main_image, banner.sub_image, banner.image_guidance].filter(Boolean).join("\n");
  if (heroProductName && !containsSignificantReference(bannerSurface, heroProductName)) {
    addFlag(brief, "warn", "Hero banner should visibly reference the hook/hero product");
  }
  (bannerMain || "").split(/\n|<br\s*\/?>/i).forEach((line) => {
    if (wordCount(line) > 8) addFlag(brief, "warn", `Banner line over 8 words: "${line.trim()}"`);
  });
  (["main_text_1", "main_text_2", "main_text_3", "sub_text_1", "sub_text_2", "sub_text_3", "main_image", "sub_image", "trust_booster", "emergency"] as const).forEach((f) => {
    if (!banner[f]) addFlag(brief, "warn", `Structured hero banner missing: ${f}`);
  });
  const bannerHeadlineLines = [banner.main_text_1, banner.main_text_2, banner.main_text_3].filter(Boolean) as string[];
  for (let i = 0; i < bannerHeadlineLines.length; i++) {
    for (let j = i + 1; j < bannerHeadlineLines.length; j++) {
      if (similarity(bannerHeadlineLines[i], bannerHeadlineLines[j]) > 0.62) {
        addFlag(brief, "warn", `Banner headline lines ${i + 1}/${j + 1} repeat the same angle`);
      }
    }
  }
  const bannerSupportLines = [banner.sub_text_1, banner.sub_text_2, banner.sub_text_3].filter(Boolean) as string[];
  for (let i = 0; i < bannerSupportLines.length; i++) {
    for (let j = i + 1; j < bannerSupportLines.length; j++) {
      if (similarity(bannerSupportLines[i], bannerSupportLines[j]) > 0.68) {
        addFlag(brief, "warn", `Banner support lines ${i + 1}/${j + 1} are too similar`);
      }
    }
  }
  if (banner.cta && WEAK_CTA.includes(banner.cta.toLowerCase())) addFlag(brief, "warn", `Weak banner CTA: "${banner.cta}"`);
  const bannerBullets = String(banner.image_guidance || "").split(/\n+/).filter((line) => /^\s*[-•]/.test(line));
  if (banner.image_guidance && (bannerBullets.length < 4 || bannerBullets.length > 6)) {
    addFlag(brief, "warn", "Banner image guidance should be 4-6 compact bullets");
  }
  bannerBullets.forEach((line) => {
    const text = line.replace(/^\s*[-•]\s*/, "");
    if (wordCount(text) > 12) addFlag(brief, "warn", `Banner bullet over 12 words: "${line.trim()}"`);
  });

  const opener = (body.base || Object.values(body)[0] || "").slice(0, 250);
  if (BULLET_OPENER.test(opener)) addFlag(brief, "warn", "Body opens with a bullet/checkmark list");
  if (/^(meet |this is |introducing )/i.test(opener.trim())) {
    addFlag(brief, "warn", "Body opener looks like a product introduction ('Meet X / Introducing X') — use the selected opener mechanic instead");
  }
  const personaName = BRAND_PERSONA_NAMES[campaign.brandId];
  if (personaName && !full.includes(personaName.toLowerCase())) {
    addFlag(brief, "warn", `Body copy missing persona sign-off — "${personaName}" should appear in the body or P.S.`);
  }
  if (richText && accentMarks + boldMarks < 2) {
    addFlag(brief, "warn", "Final output needs 2+ bold/accent formatting beats from WinEmailTemps patterns");
  }
  if (accentMarks > 6) addFlag(brief, "warn", "Too many accent-color beats; reserve color for offer, proof, product, or deadline");
  if (richText && !MARKDOWN_ANY_LINK.test(richText)) {
    addFlag(brief, "warn", "Final output needs at least one renderer-safe hyperlink");
  }
  Object.entries(body).forEach(([seg, text]) => {
    const paras = String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const firstTwoParas = paras.slice(0, 2).join("\n\n");
    if (text && wordCount(text) > 150) addFlag(brief, "warn", `${seg} body over 150 words (${wordCount(text)})`);
    if (text && wordCount(text) < 100) addFlag(brief, "warn", `${seg} body too short (${wordCount(text)} words; target 120-150)`);
    if (campaign.bodyLayout === "interspersed" && paras.length > 2) {
      addFlag(brief, "warn", `${seg} interspersed body should be opener + one short bridge only`);
    }
    if (text && !MARKDOWN_PRODUCT_LINK.test(firstTwoParas)) {
      addFlag(brief, "warn", `${seg} missing product-name markdown link by paragraph 2`);
    }
    if (text && !hasOfferSignal(text, campaign)) {
      addFlag(brief, "warn", `${seg} body needs visible price/offer or shipping threshold`);
    }
    const hardSell = hardSellHits(String(text || ""));
    if (hardSell.length > 1) {
      addFlag(brief, "warn", `${seg} body sounds too salesy (${[...new Set(hardSell)].slice(0, 3).join(", ")}); make the offer a helpful detail, not a command stack`);
    }
    if (text && heroProductName && !containsSignificantReference(firstTwoParas, heroProductName)) {
      addFlag(brief, "warn", `${seg} body opener should name or clearly reference the hero product`);
    }
    const isContinuous = campaign.bodyLayout !== "interspersed" && campaign.bodyLayout !== "custom";
    if (isContinuous && text && paras.length < 3) addFlag(brief, "warn", `${seg} body below 3-paragraph win-template rhythm`);
    if (isContinuous && text && paras.length > 6) addFlag(brief, "warn", `${seg} body above 5-paragraph win-template rhythm`);
    const themeWords = significantWords(campaign.theme);
    const themeHits = themeWords.filter((w) => norm(text).includes(w)).length;
    if (themeWords.length && themeHits === 0) addFlag(brief, "warn", `${seg} body may miss campaign theme cues`);
    const subjectish = `${sl[seg]?.subject || ""} ${sl[seg]?.preheader || ""}`;
    const bodyish = `${bannerMain} ${bannerSub} ${text}`;
    if (subjectish && bodyish && !sharesContentThread(subjectish, bodyish, products, campaign)) {
      addFlag(brief, "warn", `${seg} subject, hero, and body need a clearer shared thread`);
    }
    (sl[seg]?.options || []).forEach((option, i) => {
      const optionThread = `${option.subject || ""} ${option.preheader || ""} ${option.shared_thread || ""}`;
      if (optionThread.trim() && bodyish && !sharesContentThread(optionThread, bodyish, products, campaign)) {
        addFlag(brief, "warn", `${seg} subject option ${i + 1} needs a clearer shared thread with hero/body`);
      }
    });
  });
  const segmentBodies = Object.entries(body).filter(([key, text]) => key !== "base" && wordCount(String(text || "")) >= 80);
  for (let i = 0; i < segmentBodies.length; i++) {
    for (let j = i + 1; j < segmentBodies.length; j++) {
      const [leftKey, leftText] = segmentBodies[i];
      const [rightKey, rightText] = segmentBodies[j];
      const fullSimilarity = similarity(String(leftText), String(rightText));
      const openerSimilarity = similarity(firstParagraph(String(leftText)), firstParagraph(String(rightText)));
      const sharedPhraseOverlap = phraseOverlap(String(leftText), String(rightText));
      const leftOpeningStart = openingStart(String(leftText));
      const rightOpeningStart = openingStart(String(rightText));
      const sameOpeningStart = !!leftOpeningStart && leftOpeningStart === rightOpeningStart;
      if (fullSimilarity > 0.74) {
        addFlag(brief, "warn", `${leftKey} and ${rightKey} body variants are too similar; adapt motivation/risk reducer by segment`);
      } else if (openerSimilarity > 0.68 || sharedPhraseOverlap > 0.28 || sameOpeningStart) {
        addFlag(brief, "warn", `${leftKey} and ${rightKey} share the same body structure; change the opener, proof/risk reducer, bridge, and final CTA sentence`);
      }
    }
  }

  const psWords = wordCount(brief.ps || "");
  if (!brief.ps) addFlag(brief, "warn", "Missing P.S. line");
  else if (psWords < 10 || psWords > 15) addFlag(brief, "warn", `P.S. should be 10-15 words (${psWords})`);

  const prods = brief.products || [];
  if (campaign.brandId !== "santa_fare" && prods.length > 6) addFlag(brief, "warn", "7+ product blocks (overcrowding risk)");
  if (campaign.brandId === "santa_fare" && prods.length > 4) addFlag(brief, "warn", "SantaFare should default to 4 products unless the brief gives a clear exception");
  if (campaign.brandId !== "santa_fare" && products.length >= 4 && prods.length > 0 && prods.length < 4) {
    addFlag(brief, "warn", "Product grid below 4 products; playbook default is 4-6 for BG/GL/LF");
  }
  if (products.length % 2 === 0 && prods.length > 1 && prods.length % 2 === 1) {
    addFlag(brief, "warn", "Odd product count creates an orphan final row; playbook prefers even 2-up rows");
  }
  const offerNumbers = promoLine(campaign).match(/\d+(?:\.\d+)?/g) || [];
  prods.forEach((p, i) => {
    const sourceReview = products[i]?.review;
    if (i === 0 && products[0]?.name && p.name && !containsSignificantReference(p.name, products[0].name)) {
      addFlag(brief, "warn", "First product block should remain the selected hero product");
    }
    if (wordCount(p.main_text) > 5) addFlag(brief, "warn", `Product ${i + 1} main text over 5 words`);
    if ((campaign.productCopyStyle || "headline_winner") === "headline_winner" && wordCount(p.main_text) > 4) {
      addFlag(brief, "warn", `Product ${i + 1} headline-winner main text should be <=4 words`);
    }
    if (!Array.isArray(p.usps) || p.usps.length < 2) addFlag(brief, "warn", `Product ${i + 1} needs >=2 USPs`);
    (p.usps || []).forEach((u, j) => {
      if (wordCount(u) > 5) addFlag(brief, "warn", `Product ${i + 1} USP ${j + 1} over 5 words`);
    });
    if (p.cta && WEAK_CTA.includes(p.cta.toLowerCase())) addFlag(brief, "warn", `Product ${i + 1} weak CTA`);
    if (p.cta && (wordCount(p.cta) < 2 || wordCount(p.cta) > 4)) addFlag(brief, "warn", `Product ${i + 1} CTA should be 2-4 words`);
    if (p.cta && /==|\*\*|__|\[[^\]]+\]\(/.test(p.cta)) addFlag(brief, "warn", `Product ${i + 1} CTA should be plain text; button styling handles formatting`);
    if (offerNumbers.length && !offerNumbers.some((n) => JSON.stringify(p).includes(n))) {
      addFlag(brief, "warn", `Product ${i + 1} may be missing visible price/offer context`);
    }
    if (!matchesSuppliedReview(p.review || "", sourceReview)) {
      addFlag(brief, "warn", `Product ${i + 1} review looks invented; use supplied review or unattributed benefit language`);
    }
    const legacyImageOption = Array.isArray(p.image_options) ? p.image_options[0] : undefined;
    p.main_image ||= legacyImageOption?.main_image || "";
    p.sub_image ||= legacyImageOption?.sub_image || "";
    p.alt_text ||= legacyImageOption?.alt_text || "";
    p.image_notes ||= legacyImageOption?.notes || "";
    (["main_image", "sub_image", "alt_text", "image_notes"] as const).forEach((field) => {
      if (!p[field]) addFlag(brief, "warn", `Product ${i + 1} image brief missing ${field}`);
    });
  });

  const qc = brief.quality_checks || ({} as GenQualityChecks);
  PLAYBOOK_REQUIRED_QA.forEach((f) => {
    if (!qc[f as keyof GenQualityChecks]) addFlag(brief, "warn", "Quality check missing: " + f);
  });

  const errors = brief._flags.filter((f) => f.type === "error").length;
  const warnings = brief._flags.length - errors;
  brief._score = Math.max(0, 100 - errors * 25 - warnings * 6);
  return brief;
}
