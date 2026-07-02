import { describe, expect, it } from "vitest";
import { segJsonKey, validateBrief, validateBriefPair, briefContrastIssues, thinProductInputs, type GenBrief } from "../briefgen";
import type { Campaign, Product } from "../config/types";

const campaign: Campaign = {
  brandId: "bra_goddess",
  sendDate: "2026-06-24",
  segments: ["21"],
  layout: "narrative",
  theme: "Comfort sale",
  offerType: "fixed_price",
  offerValue: "💲12.99",
  offerShipping: "Free Shipping 💲35+",
  urgency: "h24",
  offer: "Daisy Bra for 💲12.99",
  hookContract: "",
  bodyLayout: "continuous",
  productCopyStyle: "headline_winner",
  bodyFocus: "hero",
  recipientName: "{{first_name}}",
};

const products: Product[] = [{
  name: "Daisy Bra",
  slug: "daisybra",
  price: "12.99",
  url: "https://bragoddess.com/daisybra",
  review: "",
  usps: ["front snap", "wire-free support", "soft straps"],
  hero: true,
}];

const braRequiredProducts: Product[] = [
  products[0],
  {
    name: "Posy Bra",
    slug: "posybra",
    price: "12.99",
    url: "https://bragoddess.com/posy-bra",
    review: "",
    usps: ["smooth lift", "wire-free comfort"],
  },
  {
    name: "ZoeShape",
    slug: "zoeshape",
    price: "14.99",
    url: "https://bragoddess.com/zoeshape",
    review: "",
    usps: ["smooth waist", "soft shaping"],
  },
];

function baseBrief(): GenBrief {
  const key = segJsonKey("21");
  return {
    creative_direction: {
      angle: "Pain Relief",
      framework: "PAS",
      branch: "direct problem",
      brief_route: "comfort relief",
      source_pattern: "direct problem",
      hook_contract: {
        segment_insight: "Bra fit frustration",
        emotion: "relief",
        hero_product: "Daisy Bra",
        proof_or_price: "💲12.99",
        urgency: "midnight",
        avoid_rule: "no gratitude opener",
      },
      flow: "pain to relief",
      differentiator: "front-snap comfort",
    },
    subject_lines: {
      [key]: {
        subject: "Daisy comfort is 💲12.99, {{first_name}}",
        preheader: "Front-snap ease, wire-free support, and Free Shipping 💲35+ before midnight.",
        style: "direct",
        model_hint: "direct",
        shared_thread: "Daisy comfort",
        options: [
          { style: "direct", model_hint: "direct", subject: "Daisy comfort is 💲12.99, {{first_name}}", preheader: "Front-snap ease, wire-free support, and Free Shipping 💲35+ before midnight.", shared_thread: "Daisy comfort" },
          { style: "question", model_hint: "question", subject: "{{first_name}}, tired of straps digging?", preheader: "Daisy brings soft support, a front snap, and today’s 💲12.99 comfort price.", shared_thread: "strap relief" },
          { style: "value", model_hint: "value", subject: "Soft support, today at 💲12.99", preheader: "{{first_name}}, Daisy keeps the offer clear with Free Shipping 💲35+ before midnight.", shared_thread: "soft support" },
        ],
      },
    },
    theme: "Daisy comfort sale",
    banner: {
      logo_stars: "",
      main_text: "",
      sub_text: "",
      main_text_1: "No More Digging",
      main_text_2: "Front-Snap Comfort",
      main_text_3: "Today 💲12.99",
      sub_text_1: "Soft straps and wire-free support",
      sub_text_2: "Free Shipping 💲35+",
      sub_text_3: "Ends midnight",
      image_guidance: "- Show Daisy on model\n- Keep CTA above fold\n- Use deep rose accent\n- Leave crop-safe text area",
      review_quote: "",
      review_texts: [],
      main_image: "Daisy on mature model",
      sub_image: "front snap close-up",
      trust_booster: "Fit support",
      emergency: "Ends midnight",
      cta: "Try Daisy",
      options: [
        { label: "Split hero", model_hint: "split", main_text_1: "No More Digging", main_text_2: "Front-Snap Comfort", main_text_3: "Today 💲12.99", sub_text_1: "Soft straps", sub_text_2: "Wire-free", sub_text_3: "Midnight", cta: "Try Daisy", review_texts: [], main_image: "model hero", sub_image: "snap detail", trust_booster: "Fit support", emergency: "Midnight", image_guidance: "- model\n- snap\n- rose\n- safe text" },
        { label: "Guide card", model_hint: "guide", main_text_1: "Comfort Check", main_text_2: "Snap, Lift, Go", main_text_3: "💲12.99 Today", sub_text_1: "Easy front closure", sub_text_2: "Soft support", sub_text_3: "Free Shipping 💲35+", cta: "Shop Comfort", review_texts: [], main_image: "flat lay", sub_image: "strap detail", trust_booster: "Wire-free", emergency: "Today", image_guidance: "- flat lay\n- strap\n- crimson\n- roomy crop" },
      ],
    },
    body: {
      base: "Layout summary.",
      [key]: "Some bras make the day feel longer before you even leave the room. [Daisy Bra](slug:daisybra) keeps the fix simple: a front snap, soft straps, and wire-free support at ==💲12.99== today.\n\nThat is the kind of comfort you notice when the band stays calm and the straps stop asking for attention. Free Shipping 💲35+ is active before midnight.\n\nTry Daisy today.\n\nSandra",
    },
    body_options: {
      [key]: [
        { label: "Primary", model_hint: "direct", body: "Primary body with [Daisy Bra](slug:daisybra) by paragraph two. Sandra", ps: "Daisy is 💲12.99 today; comfort should feel this easy.", placement_note: "continuous" },
        { label: "Alternate", model_hint: "tip", body: "Alternate body with [Daisy Bra](slug:daisybra) and a fit tip. Sandra", ps: "Check the snap first; the comfort follows fast.", placement_note: "text-product-text" },
      ],
    },
    ps: "Daisy is 💲12.99 today; comfort should feel this easy.",
    products: [{
      slot: 1,
      name: "Daisy Bra",
      template_style: "front-snap hero",
      main_text: "Snap Into Comfort",
      sub_text: "Today 💲12.99",
      popup_badge: "Hero fit",
      usps: ["front snap", "wire-free"],
      review: "",
      cta: "Try Daisy",
      main_image: "model",
      sub_image: "snap",
      alt_text: "Daisy Bra front snap comfort",
      image_notes: "Use rose accent and crop-safe overlay",
    }],
    quality_checks: {
      click_reason: "specific",
      hook_alignment: "aligned",
      proof_safety: "supplied",
      spam_risk: "low",
      optout_risk: "low",
      photo_watchout: "clear",
      first_200px: "cta_visible",
      inline_link_plan: "ready",
      layout_risk: "low",
      playbook_dos_donts: "pass",
      brand_rule_alignment: "aligned",
      accessibility_layout: "ready",
      opener_mechanic: "direct_problem",
      hook_coherence: "fresh",
      cta_assessment: "clear",
    },
  };
}

describe("brief validation", () => {
  it("maps segment ids to JSON keys", () => {
    expect(segJsonKey("1-A")).toBe("seg_1_A");
  });

  it("allows artificial ratings on the banner but still flags a fabricated age/date", () => {
    const brief = baseBrief();
    brief.banner.review_texts = ["4.9/5 stars from Martha, age 62"];
    const validated = validateBrief(brief, campaign, products);
    // Rating counts are fine as a banner badge (Jul 2026 stance); the invented age is not.
    expect((validated._flags || []).some((flag) => /4\.9\/5/i.test(flag.msg))).toBe(false);
    expect((validated._flags || []).some((flag) => /fabricated authority claim/i.test(flag.msg))).toBe(true);
  });

  it("flags a leaked prompt placeholder token in generated copy", () => {
    const brief = baseBrief();
    brief.theme = "Comfort sale hook: [HOOK_CONTRACT] drives the visual";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /prompt scaffolding leaked/i.test(flag.msg))).toBe(true);
  });

  it("flags a leaked markdown layer heading in body copy", () => {
    const brief = baseBrief();
    brief.body.base = "## Output Contract\nReturn ONLY valid JSON.";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /prompt scaffolding leaked/i.test(flag.msg))).toBe(true);
  });

  it("flags leaked layer labels even when they are not markdown headings", () => {
    const brief = baseBrief();
    brief.body.base = "Campaign Inputs: Products and body[seg_key] should use the schema.";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /prompt scaffolding leaked/i.test(flag.msg))).toBe(true);
    expect((validated._flags || []).some((flag) => /schema placeholder/i.test(flag.msg))).toBe(true);
  });

  it("flags leaked prompt text in P.S. and editable body options", () => {
    const brief = baseBrief();
    const key = segJsonKey("21");
    brief.ps = "Return ONLY valid JSON.";
    brief.body_options![key]![0]!.body = "Component Rules: write body[seg_key].";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /prompt scaffolding leaked/i.test(flag.msg))).toBe(true);
  });

  it("does not flag a real single-word product markdown link as a leaked placeholder", () => {
    const brief = baseBrief();
    brief.body.base = "I love how [ZoeShape](slug:zoeshape) smooths everything out.";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /prompt scaffolding leaked/i.test(flag.msg))).toBe(false);
  });

  it("flags literal spelled-out percent-off discount phrasing", () => {
    const brief = baseBrief();
    brief.body.base = "Grab your Daisy Bra at 50% off before midnight.";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /literal "% off"/i.test(flag.msg))).toBe(true);
  });

  it("does not flag unrelated uses of the word off", () => {
    const brief = baseBrief();
    brief.body.base = "Nothing in the closet fits properly off the rack, so Daisy kicks off a better fit.";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /literal "% off"/i.test(flag.msg))).toBe(false);
  });

  it("thinProductInputs reports missing usps/review but not missing price/url", () => {
    const bare: Product = { name: "Mystery Bra", slug: "mystery", price: "", url: "" };
    const gaps = thinProductInputs([bare]);
    expect(gaps).toEqual([{ name: "Mystery Bra", gaps: ["usps", "review"] }]);
  });

  it("advises when a product had no supplied review (thin input data)", () => {
    // The shared `products` fixture has review: "" on purpose to exercise this path.
    const validated = validateBrief(baseBrief(), campaign, products);
    expect((validated._advisory || []).some((flag) => /drafted proof/i.test(flag.msg) && /daisy bra/i.test(flag.msg))).toBe(true);
  });

  it("does not advise drafted proof when USPs and review are both supplied", () => {
    const completeProducts: Product[] = [{ ...products[0], review: "\"Forgot it's there!\" — Helen R." }];
    const validated = validateBrief(baseBrief(), campaign, completeProducts);
    expect((validated._advisory || []).some((flag) => /drafted proof/i.test(flag.msg))).toBe(false);
  });

  it("allows artificial attributed product reviews without forcing supplied-review parity", () => {
    const completeProducts: Product[] = [{ ...products[0], review: "\"Forgot it's there!\" — Helen R." }];
    const brief = baseBrief();
    brief.products![0]!.review = "\"Soft by noon.\" — Martha B.";
    const validated = validateBrief(brief, campaign, completeProducts);
    expect((validated._flags || []).some((flag) => /source-backed proof language/i.test(flag.msg))).toBe(false);
  });

  it("still catches false verification language in product reviews", () => {
    const brief = baseBrief();
    brief.products![0]!.review = "\"Soft by noon.\" — verified buyer Martha B.";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /source-backed proof language/i.test(flag.msg))).toBe(true);
  });

  it("enforces configured required products", () => {
    const validated = validateBrief(baseBrief(), campaign, products);
    expect((validated._flags || []).some((flag) => /required product missing from campaign selection/i.test(flag.msg))).toBe(true);
  });

  it("allows required BraGoddess products to rotate lead order when the generated blocks match selected products", () => {
    const brief = baseBrief();
    const key = segJsonKey("21");
    brief.creative_direction!.hook_contract!.hero_product = "Posy Bra";
    brief.subject_lines![key]!.subject = "{{first_name}}, Posy feels calm today";
    brief.subject_lines![key]!.preheader = "Smooth lift, wire-free comfort, and 💲12.99 before midnight.";
    brief.banner = {
      ...brief.banner,
      main_text_1: "Posy Smooths The Day",
      main_text_2: "Wire-Free Lift",
      main_image: "Posy Bra model crop",
      sub_image: "Posy soft strap detail",
      image_guidance: "- Lead with Posy Bra\n- Support with Daisy and ZoeShape\n- Keep rose accent\n- CTA above fold",
    };
    brief.body![key] = "Posy Bra is the right lead for comfort-focused buyers today. [Posy Bra](slug:posy-bra) keeps the promise simple: smooth lift, wire-free comfort, and ==💲12.99== before midnight.\n\nDaisy Bra and ZoeShape stay in the grid so the email still covers daily support and smoothing.\n\nTry Posy today.\n\nSandra";
    brief.products = [
      {
        slot: 1,
        name: "Posy Bra",
        template_style: "smooth lead",
        main_text: "Smooth Lift Today",
        sub_text: "Wire-free comfort",
        popup_badge: "Soft support",
        usps: ["smooth lift", "wire-free"],
        review: "",
        cta: "Try Posy",
        main_image: "Posy model",
        sub_image: "Posy strap",
        alt_text: "Posy Bra smooth lift",
        image_notes: "Theme chooses Posy as lead; Daisy and ZoeShape support.",
      },
      {
        slot: 2,
        name: "Daisy Bra",
        template_style: "support",
        main_text: "Snap Into Comfort",
        sub_text: "Front-snap ease",
        popup_badge: "Daily pick",
        usps: ["front snap", "soft straps"],
        review: "",
        cta: "Try Daisy",
        main_image: "Daisy",
        sub_image: "snap",
        alt_text: "Daisy Bra",
        image_notes: "Support product.",
      },
      {
        slot: 3,
        name: "ZoeShape",
        template_style: "support",
        main_text: "Smooth The Fit",
        sub_text: "Soft shaping",
        popup_badge: "Smooth pick",
        usps: ["smooth waist", "soft shaping"],
        review: "",
        cta: "Try ZoeShape",
        main_image: "ZoeShape",
        sub_image: "shape detail",
        alt_text: "ZoeShape",
        image_notes: "Support product.",
      },
    ];

    const validated = validateBrief(brief, campaign, braRequiredProducts);
    const messages = (validated._flags || []).map((flag) => flag.msg).join("\n");
    expect(messages).not.toMatch(/required product missing from campaign selection/i);
    expect(messages).not.toMatch(/hero_product .* does not match any selected product/i);
    expect(messages).not.toMatch(/First product block should remain/i);
    expect(messages).not.toMatch(/Product 1 name .* does not match a selected product/i);
  });

  it("flags when a required brand product is present but pushed below the top product trio", () => {
    const brief = baseBrief();
    brief.products = ["Daisy Bra", "ZipLacy", "Posy Bra", "ZoeShape"].map((name, index) => ({
      slot: index + 1,
      name,
      template_style: index === 1 ? "optional support" : "required top product",
      main_text: `${name} Today`,
      sub_text: "Comfort at 💲12.99",
      popup_badge: "Soft fit",
      usps: ["soft support", "easy wear"],
      review: "",
      cta: `Try ${name.split(" ")[0]}`,
      main_image: name,
      sub_image: `${name} detail`,
      alt_text: name,
      image_notes: "Product block image note.",
    }));
    const selectedProducts: Product[] = [
      ...braRequiredProducts,
      { name: "ZipLacy", slug: "ziplacy", price: "24.99", url: "https://bragoddess.com/ziplacy", usps: ["front zip", "soft support"], review: "" },
    ];

    const validated = validateBrief(brief, campaign, selectedProducts);
    const messages = [...(validated._flags || []), ...(validated._advisory || [])].map((flag) => flag.msg).join("\n");
    expect(messages).toMatch(/required top products must occupy the first 3 product blocks/i);
  });

  it("flags briefs that ignore the campaign theme across generated surfaces", () => {
    const offThemeCampaign = { ...campaign, theme: "Birthday comeback" };
    const validated = validateBrief(baseBrief(), offThemeCampaign, braRequiredProducts);
    const messages = [...(validated._flags || []), ...(validated._advisory || [])].map((flag) => flag.msg).join("\n");
    expect(messages).toMatch(/miss campaign theme anchor/i);
  });

  it("forbids BraGoddess homepage links in body copy", () => {
    const brief = baseBrief();
    const key = segJsonKey("21");
    brief.body[key] = "The [Daisy Bra](slug:daisybra) keeps comfort simple today. See [our homepage](home) for more ideas.\n\nSandra";
    const validated = validateBrief(brief, campaign, products);
    expect((validated._flags || []).some((flag) => /forbidden homepage link/i.test(flag.msg))).toBe(true);
  });

  it("requires homepage links for GentsLux body copy", () => {
    const key = segJsonKey("71");
    const gentsCampaign: Campaign = {
      ...campaign,
      brandId: "gents_lux",
      segments: ["71"],
      layout: "simple",
      offer: "JettJeans for 💲32.99",
      offerValue: "💲32.99",
    };
    const gentsProducts: Product[] = [
      { name: "JettJeans", slug: "jettjeans", price: "32.99", url: "https://gentslux.com/jettjeans", usps: ["4-way stretch"], review: "" },
      { name: "IcyShorts", slug: "icyshorts", price: "18.98", url: "https://gentslux.com/icyshorts", usps: ["cooling fabric"], review: "" },
      { name: "AirFlexion", slug: "airflexion", price: "29.99", url: "https://gentslux.com/airflexion", usps: ["elastic waist"], review: "" },
    ];
    const brief = baseBrief();
    brief.subject_lines = {
      [key]: {
        subject: "{{first_name}}, these jeans move differently",
        preheader: "JettJeans bring stretch, easy movement, and today’s 💲32.99 price.",
        style: "direct",
        model_hint: "direct",
        shared_thread: "JettJeans movement",
        options: [],
      },
    };
    brief.body = {
      base: "Layout summary.",
      [key]: "A stiff pair of jeans can make every chair feel like a negotiation. [JettJeans](slug:jettjeans) keep the look clean and the movement easy at ==💲32.99== today.\n\nJordan",
    };
    brief.body_options = {
      [key]: [
        { label: "Primary", model_hint: "direct", body: "Primary with [JettJeans](slug:jettjeans) and stretch proof. Jordan", ps: "JettJeans move cleanly today; this price will not sit around.", placement_note: "continuous" },
        { label: "Alternate", model_hint: "tip", body: "Alternate with [JettJeans](slug:jettjeans) and a fit tip. Jordan", ps: "Try the waistband test; good jeans should move before they argue.", placement_note: "text-product-text" },
      ],
    };
    brief.products = gentsProducts.map((product, index) => ({
      slot: index + 1,
      name: product.name,
      template_style: "mechanism",
      main_text: product.name,
      sub_text: "Moves clean",
      popup_badge: "Stretch",
      usps: product.usps || [],
      review: "",
      cta: "Try This Fit",
      main_image: product.name,
      sub_image: "detail",
      alt_text: product.name,
      image_notes: "Clean navy product crop",
    }));
    const validated = validateBrief(brief, gentsCampaign, gentsProducts);
    expect((validated._flags || []).some((flag) => /missing required homepage link/i.test(flag.msg))).toBe(true);
  });

  it("flags segment bodies with high trigram overlap", () => {
    const brief = baseBrief();
    const campaignTwoSegments: Campaign = { ...campaign, segments: ["21", "22"] };
    const key21 = segJsonKey("21");
    const key22 = segJsonKey("22");
    brief.subject_lines![key22] = {
      subject: "{{first_name}}, Daisy comfort has a quiet fix",
      preheader: "Soft straps, front-snap ease, and the same 💲12.99 Daisy comfort before midnight.",
      style: "direct",
      model_hint: "direct",
      shared_thread: "Daisy comfort",
      options: [],
    };
    const clonedRhythm =
      "Some bras make the day feel longer before you even leave the room. [Daisy Bra](slug:daisybra) keeps the fix simple with a front snap, soft straps, and wire-free support at ==💲12.99== today.\n\n" +
      "That is the kind of comfort you notice when the band stays calm, the cups stop shifting, and your shoulders are no longer doing extra work. Free Shipping 💲35+ is active before midnight.\n\n" +
      "I would keep this one for the days when getting dressed needs to feel simple, because the closure is easy, the shape stays smooth, and the support does not turn into a negotiation by lunch.\n\n" +
      "Try Daisy today.\n\nSandra";
    brief.body![key21] = clonedRhythm;
    brief.body![key22] = clonedRhythm.replace("before you even leave the room", "before breakfast even starts").replace("cups stop shifting", "support stops shifting");

    const validated = validateBrief(brief, campaignTwoSegments, braRequiredProducts);
    const messages = [...(validated._flags || []), ...(validated._advisory || [])].map((flag) => flag.msg).join("\n");
    expect(messages).toMatch(/trigram overlap/i);
  });

  it("flags segment bodies missing accent highlights", () => {
    const brief = baseBrief();
    const key = segJsonKey("21");
    brief.body![key] = String(brief.body![key]).replace(/==/g, "");

    const validated = validateBrief(brief, campaign, braRequiredProducts);
    const messages = [...(validated._flags || []), ...(validated._advisory || [])].map((flag) => flag.msg).join("\n");
    expect(messages).toMatch(/missing ==accent== highlights/i);
  });

  it("flags subject urgency that drifts from the campaign or other segments", () => {
    const brief = baseBrief();
    const campaignTwoSegments: Campaign = { ...campaign, segments: ["21", "22"], urgency: "h24" };
    const key22 = segJsonKey("22");
    brief.subject_lines![key22] = {
      subject: "{{first_name}}, Daisy has 72 hours left",
      preheader: "Front-snap comfort, wire-free support, and the 💲12.99 Daisy price for 3 days.",
      style: "deadline",
      model_hint: "deadline",
      shared_thread: "Daisy comfort",
      options: [],
    };
    brief.body![key22] =
      "Some mornings need a calmer first layer. [Daisy Bra](slug:daisybra) brings front-snap ease, soft straps, and ==💲12.99== support before midnight.\n\nThat comfort gives lapsed buyers a simple reason to come back without fighting hooks or wires.\n\nTry Daisy today.\n\nSandra";

    const validated = validateBrief(brief, campaignTwoSegments, braRequiredProducts);
    const messages = [...(validated._flags || []), ...(validated._advisory || [])].map((flag) => flag.msg).join("\n");
    expect(messages).toMatch(/subject\/preheader urgency .*does not match campaign urgency/i);
    expect(messages).toMatch(/Subject\/preheader urgency differs across segments/i);
  });

  it("flags subject option sets that reuse the same testing device", () => {
    const brief = baseBrief();
    const key = segJsonKey("21");
    brief.subject_lines![key]!.options = [
      { style: "value", model_hint: "value", subject: "{{first_name}}, Daisy is 💲12.99 today", preheader: "Front-snap comfort and Free Shipping 💲35+ before midnight.", shared_thread: "price" },
      { style: "deal", model_hint: "deal", subject: "{{first_name}}, Daisy comfort for 💲12.99", preheader: "Soft support, a clearer fit, and Free Shipping 💲35+ today.", shared_thread: "price" },
      { style: "offer", model_hint: "offer", subject: "{{first_name}}, today’s Daisy price is 💲12.99", preheader: "Wire-free support and the Daisy comfort price before midnight.", shared_thread: "price" },
    ];

    const validated = validateBrief(brief, campaign, braRequiredProducts);
    const messages = [...(validated._flags || []), ...(validated._advisory || [])].map((flag) => flag.msg).join("\n");
    expect(messages).toMatch(/subject options need 3 distinct devices/i);
  });
});

describe("validateBriefPair", () => {
  it("preserves deliverability weighting when pair checks rescore a brief", () => {
    const briefA = baseBrief();
    const key = segJsonKey("21");
    briefA.subject_lines![key]!.subject = "Re: you're a winner, {{first_name}}!!!";
    briefA.subject_lines![key]!.preheader = "Daisy is 💲12.99 today with soft support before midnight.";
    const validatedA = validateBrief(briefA, campaign, braRequiredProducts);
    const before = validatedA._score || 0;
    expect(validatedA._deliverability_score).toBeLessThan(100);

    const validatedB = validateBrief(baseBrief(), campaign, braRequiredProducts);
    const [after] = validateBriefPair(validatedA, validatedB);
    expect(after._score || 0).toBeLessThanOrEqual(before);
  });

  it("returns both briefs unchanged when they are clearly distinct", () => {
    const briefA = baseBrief();
    const briefB = baseBrief();
    // Give B a completely different creative direction, hook contract, body, and banner
    // so no A/B contrast issues are raised.
    briefB.creative_direction = {
      angle: "Social proof",
      framework: "AIDA",
      branch: "aspiration path",
      brief_route: "testimonial aspiration",
      source_pattern: "customer quote",
      hook_contract: {
        segment_insight: "Women want to feel validated and confident by community approval",
        emotion: "aspiration",
        hero_product: "Daisy Bra",
        proof_or_price: "💲12.99",
        urgency: "midnight",
        avoid_rule: "no pain opener",
      },
      flow: "aspiration to belonging",
      differentiator: "ugc testimonials and community love",
    };
    briefB.body = {
      base: "Social-proof base: customers rave about the Daisy Bra every week.",
      seg_21: "Thousands of women already discovered what you are about to find. The [Daisy Bra](slug:daisybra) is ==💲12.99== and the community cannot stop talking about it. This is the moment you join them. Free Shipping 💲35+ ends midnight. Sandra",
    };
    briefB.banner = {
      ...briefB.banner,
      main_text_1: "Join 10,000 Happy Wearers",
      main_text_2: "Community Loved",
      main_text_3: "💲12.99 Today",
      sub_text_1: "Real women, real reviews",
      sub_text_2: "Wire-free comfort",
      sub_text_3: "Midnight cutoff",
      cta: "Join the Community",
      trust_booster: "10k wearers",
      emergency: "Midnight",
      image_guidance: "- Group of happy diverse women\n- Bold testimonial overlay\n- Deep rose accent\n- CTA above fold",
    };
    briefB.quality_checks = {
      ...briefB.quality_checks,
      opener_mechanic: "customer_quote",
      hook_coherence: "fresh",
    };
    briefB.products = [{
      slot: 1,
      name: "Daisy Bra",
      template_style: "community favourite",
      main_text: "10,000 Women Love This",
      sub_text: "Join Them for 💲12.99",
      popup_badge: "Community pick",
      usps: ["loved by thousands", "front-snap ease", "verified comfort"],
      review: "",
      cta: "Join the Community",
      main_image: "group testimonial hero",
      sub_image: "review card",
      alt_text: "Daisy Bra community favourite",
      image_notes: "Show diverse happy wearers",
    }];
    const [a2, b2] = validateBriefPair(briefA, briefB);
    const advisoryMsgs = [...(a2._advisory || []), ...(b2._advisory || [])].map((x) => x.msg);
    const hasContrastIssue = advisoryMsgs.some((m) => /A\/B/i.test(m));
    expect(hasContrastIssue).toBe(false);
  });

  it("flags identical openers as a contrast issue", () => {
    const briefA = baseBrief();
    const briefB = baseBrief(); // identical — same opener
    const [a2, b2] = validateBriefPair(briefA, briefB);
    const allAdvisory = [...(a2._advisory || []), ...(b2._advisory || [])];
    expect(allAdvisory.some((x) => /opener|openers/i.test(x.msg))).toBe(true);
  });
});

describe("Q3 winning-exemplar copying check", () => {
  it("flags body copy that repeats a winning exemplar almost verbatim", () => {
    const brief = validateBrief(baseBrief(), {
      ...campaign,
      winningExemplars: { subjects: [], openers: ["Some bras make the day feel longer before you even leave the room."] },
    }, braRequiredProducts);
    expect((brief._advisory || []).some((f) => /past winning exemplar/i.test(f.msg))).toBe(true);
  });

  it("does not flag copy that only shares brand/product vocabulary, not phrasing", () => {
    const brief = validateBrief(baseBrief(), {
      ...campaign,
      winningExemplars: { subjects: ["A completely different hook about something unrelated entirely"], openers: ["Nothing like this brief's actual wording at all here"] },
    }, braRequiredProducts);
    expect((brief._advisory || []).some((f) => /past winning exemplar/i.test(f.msg))).toBe(false);
  });

  it("is a no-op when the campaign has no winning exemplars", () => {
    const brief = validateBrief(baseBrief(), campaign, braRequiredProducts);
    expect((brief._advisory || []).some((f) => /past winning exemplar/i.test(f.msg))).toBe(false);
  });
});
