export type BrandId = "bra_goddess" | "gents_lux" | "lux_fitting" | "santa_fare";

/** Month 1–12, Day 1–31. Use 0 for "no fixed date" (e.g. evergreen). */
export interface OccasionDate {
  month: number;   // 1–12; 0 = no fixed month (evergreen)
  day: number;     // 1–31; 0 = no fixed day (e.g. "first Monday")
  note?: string;   // e.g. "first Monday of September"
}

export interface Occasion {
  id: string;           // snake_case, e.g. "national_high_five_day"
  name: string;         // display name
  date: OccasionDate;
  windowDays: number;   // how many days before the date to start using it (e.g. 7 = use up to 7 days ahead)
  tone: string;         // 1–6 word mood hint for the prompt (e.g. "playful, energetic, celebratory")
  brands: BrandId[] | "all";   // which brands use this occasion
  pun_seeds: string[];  // 0–5 wordplay seeds: e.g. "tea + adjective", "spook + adjective"
  evergreen?: boolean;  // if true, always valid (e.g. "Friday treat", "Just Because Sunday")
}

export interface PunPattern {
  id: string;           // snake_case
  brands: BrandId[];    // brands where this pun style fits
  pattern: string;      // description of the pattern, e.g. "{word}-riffic, {word}-tiful"
  seeds: string[];      // real verbatim examples from the brands' own emails
}

export const OCCASIONS: Occasion[] = [
  // ── Seasonal / Major holidays ──
  {
    id: "christmas",
    name: "Christmas",
    date: { month: 12, day: 25 },
    windowDays: 21,
    tone: "warm, generous, festive",
    brands: "all",
    pun_seeds: ["gift + surprise", "ho ho ho + deals"],
  },
  {
    id: "valentines_day",
    name: "Valentine's Day",
    date: { month: 2, day: 14 },
    windowDays: 10,
    tone: "romantic, warm, celebratory",
    brands: "all",
    pun_seeds: ["love + product", "heart + benefit"],
  },
  {
    id: "halloween",
    name: "Halloween",
    date: { month: 10, day: 31 },
    windowDays: 14,
    tone: "playful, spooky-fun, mysterious",
    brands: ["bra_goddess", "gents_lux", "lux_fitting", "santa_fare"],
    pun_seeds: ["spook + adjective", "monster + deal", "boo + adjective", "scary good"],
  },
  {
    id: "labor_day",
    name: "Labor Day",
    date: { month: 9, day: 1, note: "first Monday of September" },
    windowDays: 5,
    tone: "celebratory, end-of-summer, treat yourself",
    brands: "all",
    pun_seeds: [],
  },
  {
    id: "black_friday",
    name: "Black Friday",
    date: { month: 11, day: 28, note: "fourth Friday of November" },
    windowDays: 7,
    tone: "urgent, exclusive, high-value",
    brands: "all",
    pun_seeds: [],
  },
  {
    id: "new_year",
    name: "New Year",
    date: { month: 1, day: 1 },
    windowDays: 7,
    tone: "hopeful, fresh-start, motivating",
    brands: "all",
    pun_seeds: ["new year + new you", "resolution + comfort"],
  },

  // ── Fun / National Days ──
  {
    id: "national_high_five_day",
    name: "National High Five Day",
    date: { month: 4, day: 19, note: "third Thursday of April" },
    windowDays: 3,
    tone: "energetic, celebratory, fun",
    brands: ["lux_fitting", "bra_goddess"],
    pun_seeds: ["high five + product", "slap + deal"],
  },
  {
    id: "national_laundry_day",
    name: "National Laundry Day",
    date: { month: 4, day: 15 },
    windowDays: 2,
    tone: "playful, practical, relatable",
    brands: ["lux_fitting", "bra_goddess"],
    pun_seeds: ["wash + fresh", "clean + deal"],
  },
  {
    id: "earth_day",
    name: "Earth Day",
    date: { month: 4, day: 22 },
    windowDays: 3,
    tone: "warm, purposeful, quality-focused",
    brands: ["lux_fitting", "bra_goddess", "gents_lux"],
    pun_seeds: [],
  },
  {
    id: "international_tea_day",
    name: "International Tea Day",
    date: { month: 5, day: 21 },
    windowDays: 3,
    tone: "warm, cozy, playful",
    brands: ["lux_fitting"],
    pun_seeds: ["tea + adjective (tea-riffic, tea-lightful)", "brew + adjective (brew-tiful, brew-tastic)"],
  },
  {
    id: "national_radio_day",
    name: "National Radio Day",
    date: { month: 8, day: 20 },
    windowDays: 3,
    tone: "retro, playful, nostalgic",
    brands: ["lux_fitting"],
    pun_seeds: ["static + deals", "tune + in", "frequency + style"],
  },
  {
    id: "national_just_because_day",
    name: "National Just Because Day",
    date: { month: 8, day: 27 },
    windowDays: 3,
    tone: "spontaneous, warm, treat-yourself",
    brands: "all",
    pun_seeds: [],
  },
  {
    id: "international_dance_day",
    name: "International Dance Day",
    date: { month: 4, day: 29 },
    windowDays: 3,
    tone: "energetic, joyful, freeing",
    brands: ["lux_fitting"],
    pun_seeds: ["groove + style", "move + comfort"],
  },
  {
    id: "international_moment_of_laughter_day",
    name: "International Moment of Laughter Day",
    date: { month: 4, day: 14 },
    windowDays: 2,
    tone: "lighthearted, fun, joyful",
    brands: ["lux_fitting", "bra_goddess"],
    pun_seeds: [],
  },
  {
    id: "best_friends_day",
    name: "Best Friends Day",
    date: { month: 6, day: 8 },
    windowDays: 5,
    tone: "warm, gifting, celebratory",
    brands: ["bra_goddess", "lux_fitting", "santa_fare"],
    pun_seeds: [],
  },
  {
    id: "world_smile_day",
    name: "World Smile Day",
    date: { month: 10, day: 4, note: "first Friday of October" },
    windowDays: 3,
    tone: "warm, uplifting, confident",
    brands: ["gents_lux", "lux_fitting"],
    pun_seeds: [],
  },
  {
    id: "national_nurses_day",
    name: "National Nurses Day",
    date: { month: 5, day: 6 },
    windowDays: 3,
    tone: "appreciative, heroic, warm",
    brands: ["bra_goddess", "lux_fitting"],
    pun_seeds: [],
  },
  {
    id: "graduation_season",
    name: "Graduation Season",
    date: { month: 5, day: 15, note: "mid-May through mid-June" },
    windowDays: 30,
    tone: "celebratory, milestone, warm",
    brands: ["bra_goddess", "lux_fitting", "santa_fare"],
    pun_seeds: ["grad + product (graduating to comfort)", "diploma + style"],
  },
  {
    id: "mothers_day",
    name: "Mother's Day",
    date: { month: 5, day: 12, note: "second Sunday of May" },
    windowDays: 10,
    tone: "loving, appreciative, gifting",
    brands: "all",
    pun_seeds: [],
  },
  {
    id: "birthday_month",
    name: "Birthday (subscriber)",
    date: { month: 0, day: 0 },
    windowDays: 30,
    tone: "celebratory, special, VIP",
    brands: "all",
    pun_seeds: ["birthday + product pun (pants-tacular)"],
    evergreen: true,
  },

  // ── Evergreen ──
  {
    id: "friday_treat",
    name: "Friday Treat / Fri-yay",
    date: { month: 0, day: 0 },
    windowDays: 1,
    tone: "playful, reward, celebratory",
    brands: ["bra_goddess", "lux_fitting"],
    pun_seeds: ["Fri-yay", "Friday feeling"],
    evergreen: true,
  },
  {
    id: "just_because_sunday",
    name: "Just Because Sunday",
    date: { month: 0, day: 0 },
    windowDays: 1,
    tone: "relaxed, treat-yourself, warm",
    brands: "all",
    pun_seeds: [],
    evergreen: true,
  },
];

export const PUNS: PunPattern[] = [
  {
    id: "portmanteau_tea",
    brands: ["lux_fitting"],
    pattern: "holiday/product word + '-riffic', '-tiful', '-lightful', '-tastic'",
    seeds: ["tea-riffic", "brew-tiful", "brew-tastic", "spill-tacular"],
  },
  {
    id: "portmanteau_spooky",
    brands: ["lux_fitting", "santa_fare", "bra_goddess"],
    pattern: "spooky word + product/deal modifier",
    seeds: ["spook-tacular", "boo-tiful", "monster-sized savings", "scary good deals"],
  },
  {
    id: "portmanteau_product",
    brands: ["bra_goddess", "lux_fitting"],
    pattern: "product name syllable + adjective suffix",
    seeds: ["bra-vo", "Shape-A-Licious", "pants-tacular", "Fri-yay"],
  },
  {
    id: "radio_static",
    brands: ["lux_fitting"],
    pattern: "radio/sound word repurposed as deal metaphor",
    seeds: ["Grab your savings before it's static", "tune in to these deals", "frequency of savings"],
  },
  {
    id: "mystery_box",
    brands: ["bra_goddess", "santa_fare"],
    pattern: "suspended-loop curiosity phrasing",
    seeds: ["Box A's retro rhythm or Box B's stylish symphony", "Is that shipping on us? Monster-sized savings?"],
  },
  {
    id: "holiday_modifier",
    brands: ["santa_fare", "gents_lux"],
    pattern: "holiday word used as adjective for deals/products",
    seeds: ["hauntingly good prices", "ghoulishly low prices", "goblin-approved deals", "elf-approved savings"],
  },
  {
    id: "dry_understatement",
    brands: ["gents_lux"],
    pattern: "dry, understated wordplay — not puns but wry observations",
    seeds: ["Your wardrobe called. It misses you.", "This is not a drill. (Well, it is if you're into power tools.)", "Pants-tacular? Jordan wouldn't say that. But you get the idea."],
  },
  {
    id: "alliteration_sg",
    brands: ["bra_goddess", "lux_fitting"],
    pattern: "alliterative pair for rhythm",
    seeds: ["Shop. Smile. Repeat.", "Lift, support, confidence.", "Comfort first, always."],
  },
];

/**
 * Return occasions whose window is active on a given date.
 * targetMonth: 1-12
 * targetDay: 1-31
 * If brandId is provided, filter to occasions that include that brand.
 */
export function occasionsInWindow(
  targetMonth: number,
  targetDay: number,
  brandId?: BrandId
): Occasion[] {
  // Convert month/day to approximate day-of-year (ignores leap year — ±1 day acceptable)
  const MONTH_OFFSETS = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  function toDoy(m: number, d: number): number {
    return MONTH_OFFSETS[m] + d;
  }
  const targetDoy = toDoy(targetMonth, targetDay);

  return OCCASIONS.filter((occ) => {
    if (occ.evergreen) return false; // evergreen occasions handled separately
    if (!occ.date.month) return false; // skip undated
    const occDoy = toDoy(occ.date.month, occ.date.day);
    // Compute days before the occasion, wrapping across year boundary (day 366 → 1)
    let daysUntil = occDoy - targetDoy;
    if (daysUntil < 0) daysUntil += 365;
    const inWindow = daysUntil >= 0 && daysUntil <= occ.windowDays;
    if (!inWindow) return false;
    if (!brandId) return true;
    if (occ.brands === "all") return true;
    return (occ.brands as BrandId[]).includes(brandId);
  });
}

/** Return evergreen occasions for a brand. */
export function evergreenOccasions(brandId?: BrandId): Occasion[] {
  return OCCASIONS.filter((occ) => {
    if (!occ.evergreen) return false;
    if (!brandId) return true;
    if (occ.brands === "all") return true;
    return (occ.brands as BrandId[]).includes(brandId);
  });
}

/** Return pun patterns available for a brand. */
export function punsForBrand(brandId: BrandId): PunPattern[] {
  return PUNS.filter((p) => p.brands.includes(brandId));
}

/** Find an occasion by id. */
export function getOccasion(id: string): Occasion | undefined {
  return OCCASIONS.find((o) => o.id === id);
}
