import type { Campaign, TierCode } from "./config/types";

// Variant key system: a variant is a `tier × productType` pair, keyed `${tier}${productType}`
// (e.g. "A21"). All copy, preview, and export operations are keyed on this string.

export interface Variant {
  key: string; // `${tier}${productType}`
  tier: TierCode;
  productType: string;
}

/** Full matrix of variants for a campaign. */
export function getAllVariants(campaign: Campaign): Variant[] {
  const variants: Variant[] = [];
  for (const tier of campaign.tiers) {
    for (const productType of campaign.productTypes) {
      variants.push({ key: `${tier}${productType}`, tier, productType });
    }
  }
  return variants;
}

/** Variants for a single tier (one Claude call generates all of these together). */
export function variantsForTier(campaign: Campaign, tier: TierCode): Variant[] {
  return campaign.productTypes.map((productType) => ({
    key: `${tier}${productType}`,
    tier,
    productType,
  }));
}
