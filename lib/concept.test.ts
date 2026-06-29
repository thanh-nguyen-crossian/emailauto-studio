import { describe, expect, it } from "vitest";
import { conceptRouteDifferenceCount, selectEmailConceptPair } from "./concept";
import type { Campaign, Product } from "./config/types";

const campaign: Campaign = {
  brandId: "gents_lux",
  sendDate: "2026-06-26",
  segments: ["71", "72", "73"],
  layout: "simple",
  theme: "June movement refresh",
  offerType: "fixed_price",
  offerValue: "💲32.99",
  offerShipping: "Free Shipping 💲40+",
  urgency: "h24",
  offer: "JettJeans for 💲32.99",
  hookContract: "",
  bodyLayout: "continuous",
  productCopyStyle: "headline_winner",
  bodyFocus: "hero",
  recipientName: "{{first_name}}",
};

const products: Product[] = [
  { name: "JettJeans", slug: "jettjeans", price: "32.99", url: "https://gentslux.com/jettjeans", usps: ["4-way stretch"] },
  { name: "Icy Shorts", slug: "icyshorts", price: "18.98", url: "https://gentslux.com/icyshorts", usps: ["cooling fabric"] },
  { name: "AirFlexion", slug: "airflexion", price: "29.99", url: "https://gentslux.com/airflexion", usps: ["featherweight stretch"] },
  { name: "FlexCamo", slug: "flexcamo", price: "34.99", url: "https://gentslux.com/flexcamo", usps: ["rugged stretch"] },
];

describe("selectEmailConceptPair", () => {
  it("chooses a meaningfully different Option B route from the start", () => {
    const pair = selectEmailConceptPair(campaign, products);
    expect(pair.a.heroProductSlug).toBe("jettjeans");
    expect(products.slice(0, 3).map((product) => product.slug)).toContain(pair.b.heroProductSlug);
    expect(conceptRouteDifferenceCount(pair.a, pair.b)).toBeGreaterThanOrEqual(3);
  });
});
