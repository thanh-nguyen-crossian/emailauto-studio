import { describe, expect, it } from "vitest";
import { segJsonKey, validateBrief, validateBriefPair, briefContrastIssues, type GenBrief } from "../briefgen";
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
});

describe("validateBriefPair", () => {
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
