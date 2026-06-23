export type BrandId = "bra_goddess" | "gents_lux" | "lux_fitting" | "santa_fare";

export interface ValueTip {
  id: string;       // unique, e.g. "gl_tip_collar"
  brandId: BrandId;
  text: string;     // ready-to-inject tip line (≤35 words, no trailing newline)
  category: "styling" | "care" | "fit" | "gifting" | "fact" | "occasion";
  tags?: string[];  // optional product/occasion tags for future filtering
}

export const VALUE_TIPS: ValueTip[] = [
  // GentsLux tips (minimum 12 entries)
  {
    id: "gl_tip_wardrobe_refresh",
    brandId: "gents_lux",
    text: "#Tip: Did you know most men update their wardrobe every 7 years? Let's make this year stand out.",
    category: "fact",
    tags: ["career", "refresh"],
  },
  {
    id: "gl_tip_collar",
    brandId: "gents_lux",
    text: "#QuickTip: For a sharp collar, try a hair straightener on low heat for crisp edges.",
    category: "styling",
    tags: ["shirts", "casual"],
  },
  {
    id: "gl_tip_hemming_hack",
    brandId: "gents_lux",
    text: "#HemmingHack: Use double-sided tape as a temporary hem fix for pants or shirts.",
    category: "care",
    tags: ["pants", "diy"],
  },
  {
    id: "gl_tip_waistband_stretch",
    brandId: "gents_lux",
    text: "#StyleHack: Stretch a tight waistband by soaking in cool water and hanging dry—gains you an inch.",
    category: "fit",
    tags: ["pants", "comfort"],
  },
  {
    id: "gl_tip_crease_refresh",
    brandId: "gents_lux",
    text: "#Tip: Bring back a faded crease with a damp cloth and low iron heat—no wrinkles, just sharp lines.",
    category: "care",
    tags: ["pants", "styling"],
  },
  {
    id: "gl_tip_fabric_test",
    brandId: "gents_lux",
    text: "#QuickTip: Test fabric weight by holding it up to light—heavier weave = better drape and durability.",
    category: "styling",
    tags: ["shirts", "fabric"],
  },
  {
    id: "gl_tip_sweat_stain",
    brandId: "gents_lux",
    text: "#HemmingHack: Fresh sweat stains vanish with white vinegar + cold water. Skip the heat until it dries.",
    category: "care",
    tags: ["shirts", "maintenance"],
  },
  {
    id: "gl_tip_sleeve_length",
    brandId: "gents_lux",
    text: "#Tip: Your shirt sleeve should hit your wrist bone—not your palm. This one detail transforms your whole look.",
    category: "fit",
    tags: ["shirts", "styling"],
  },
  {
    id: "gl_tip_iron_order",
    brandId: "gents_lux",
    text: "#QuickTip: Iron collars first, then sleeves, then body. It takes 2 minutes and looks 10x sharper.",
    category: "care",
    tags: ["shirts", "styling"],
  },
  {
    id: "gl_tip_cotton_blend",
    brandId: "gents_lux",
    text: "#StyleHack: A 65% cotton, 35% synthetic blend keeps shape better and needs less ironing than 100% cotton.",
    category: "fact",
    tags: ["fabric", "maintenance"],
  },
  {
    id: "gl_tip_break_in",
    brandId: "gents_lux",
    text: "#Tip: New jeans need 3-5 wears to break in properly. Avoid the dryer—air dry to preserve the fit.",
    category: "care",
    tags: ["pants", "denim"],
  },
  {
    id: "gl_tip_color_fade",
    brandId: "gents_lux",
    text: "#HemmingHack: Wash dark colors inside-out in cold water with vinegar to lock in the color longer.",
    category: "care",
    tags: ["pants", "shirts"],
  },
  {
    id: "gl_tip_occasion_dress",
    brandId: "gents_lux",
    text: "#QuickTip: One simple rule: match your shoes to your belt. That single detail elevates any outfit instantly.",
    category: "styling",
    tags: ["occasion", "formal"],
  },

  // BraGoddess tips (minimum 8 entries)
  {
    id: "bg_tip_hand_wash",
    brandId: "bra_goddess",
    text: "#BraTip: Hand-wash your bras in cold water with gentle soap to preserve elastic and extend life by years.",
    category: "care",
    tags: ["bra", "maintenance"],
  },
  {
    id: "bg_tip_measure_twice",
    brandId: "bra_goddess",
    text: "#FitFact: Most women wear the wrong bra size. Measure yourself every 2 years—bodies change, and so should fit.",
    category: "fit",
    tags: ["sizing", "comfort"],
  },
  {
    id: "bg_tip_strap_adjustment",
    brandId: "bra_goddess",
    text: "#ComfortTip: Straps slipping? Adjust them closer together in back for all-day support without the slip.",
    category: "fit",
    tags: ["comfort", "styling"],
  },
  {
    id: "bg_tip_band_size",
    brandId: "bra_goddess",
    text: "#FitFact: Your band should sit level in front and back. If it rides up, your band size is too big.",
    category: "fit",
    tags: ["sizing", "fit"],
  },
  {
    id: "bg_tip_dry_flat",
    brandId: "bra_goddess",
    text: "#CareTip: Always dry bras flat on a towel. Hanging stretches the band permanently over time.",
    category: "care",
    tags: ["maintenance"],
  },
  {
    id: "bg_tip_sports_bra",
    brandId: "bra_goddess",
    text: "#StyleTip: A proper sports bra reduces bounce by up to 70%—your shoulders and back will thank you.",
    category: "fit",
    tags: ["sports", "activity"],
  },
  {
    id: "bg_tip_wire_check",
    brandId: "bra_goddess",
    text: "#ComfortTip: Wires should sit flat against your ribcage. If they dig in or gap, it's time for a new size.",
    category: "fit",
    tags: ["comfort", "sizing"],
  },
  {
    id: "bg_tip_color_care",
    brandId: "bra_goddess",
    text: "#CareTip: Wash new bras separately the first time—dyes can bleed. Cold water protects colors forever.",
    category: "care",
    tags: ["colors", "maintenance"],
  },

  // LuxFitting tips (minimum 8 entries)
  {
    id: "lf_tip_jumpsuit_styling",
    brandId: "lux_fitting",
    text: "#StyleTip: Belt a jumpsuit at your natural waist for a polished work look—it transforms the silhouette instantly.",
    category: "styling",
    tags: ["jumpsuit", "work"],
  },
  {
    id: "lf_tip_cold_wash",
    brandId: "lux_fitting",
    text: "#CareTip: Wash colored pieces in cold water inside-out to preserve vibrancy and extend garment life.",
    category: "care",
    tags: ["colors", "maintenance"],
  },
  {
    id: "lf_tip_fit_check",
    brandId: "lux_fitting",
    text: "#FitFact: A well-fitted piece should let you move arms freely and sit without pulling. If not, size up.",
    category: "fit",
    tags: ["sizing", "comfort"],
  },
  {
    id: "lf_tip_seasonal_layers",
    brandId: "lux_fitting",
    text: "#StyleTip: Layer light pieces for spring—a camisole under a sheer top adds texture without bulk.",
    category: "styling",
    tags: ["seasonal", "layering"],
  },
  {
    id: "lf_tip_fabric_iron",
    brandId: "lux_fitting",
    text: "#CareTip: Check the tag! Delicate fabrics need lower heat and sometimes an ironing cloth to protect.",
    category: "care",
    tags: ["maintenance", "fabric"],
  },
  {
    id: "lf_tip_occasion_dress",
    brandId: "lux_fitting",
    text: "#OccasionTip: A fitted shift dress is your secret weapon—office to dinner in one change of shoes.",
    category: "occasion",
    tags: ["versatile", "outfit"],
  },
  {
    id: "lf_tip_pant_length",
    brandId: "lux_fitting",
    text: "#FitFact: Pants should graze the top of your shoe without bunching. This one detail makes outfits look custom.",
    category: "fit",
    tags: ["pants", "styling"],
  },
  {
    id: "lf_tip_wrinkle_refresh",
    brandId: "lux_fitting",
    text: "#CareTip: Hang a wrinkled piece in a steamy bathroom for 10 minutes—steam releases wrinkles without heat.",
    category: "care",
    tags: ["maintenance", "quick"],
  },

  // SantaFare tips (minimum 6 entries)
  {
    id: "sf_tip_gift_personalize",
    brandId: "santa_fare",
    text: "#GiftTip: Add a personal touch—monogram or message card—to make any gift feel specially chosen.",
    category: "gifting",
    tags: ["personalization", "special"],
  },
  {
    id: "sf_tip_leather_care",
    brandId: "santa_fare",
    text: "#CareTip: Condition leather accessories every 6 months with a quality balm to keep them supple and lasting.",
    category: "care",
    tags: ["leather", "accessories"],
  },
  {
    id: "sf_tip_occasion_gift",
    brandId: "santa_fare",
    text: "#GiftFact: The most memorable gifts are those that solve a problem they didn't know they had.",
    category: "fact",
    tags: ["gifting", "thoughtful"],
  },
  {
    id: "sf_tip_gift_wrap",
    brandId: "santa_fare",
    text: "#GiftTip: Invest in beautiful wrapping—it doubles the perceived value and makes unboxing unforgettable.",
    category: "gifting",
    tags: ["presentation", "special"],
  },
  {
    id: "sf_tip_seasonal_gift",
    brandId: "santa_fare",
    text: "#OccasionTip: Seasonal gifts show thoughtfulness—a cozy throw for autumn, silk scarves for spring travels.",
    category: "occasion",
    tags: ["seasonal", "gifting"],
  },
  {
    id: "sf_tip_return_policy",
    brandId: "santa_fare",
    text: "#GiftTip: Always keep the receipt—your gift recipient deserves to exchange for their perfect size and color.",
    category: "gifting",
    tags: ["practical", "customer"],
  },
];

/** Return all tips for a brand, optionally filtered by category. */
export function tipsForBrand(brandId: BrandId, category?: ValueTip["category"]): ValueTip[] {
  return VALUE_TIPS.filter(
    (t) => t.brandId === brandId && (!category || t.category === category)
  );
}

/** Pick a pseudo-random tip for a brand, avoiding recently used IDs. */
export function pickTip(
  brandId: BrandId,
  nonce: string,
  recentIds: string[] = []
): ValueTip | undefined {
  const pool = tipsForBrand(brandId).filter((t) => !recentIds.includes(t.id));
  if (!pool.length) return tipsForBrand(brandId)[0];
  const seed = nonce.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return pool[Math.abs(seed) % pool.length];
}
