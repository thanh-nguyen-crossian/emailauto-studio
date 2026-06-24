import { BRANDS } from "./config/brands";
import { selectTechniquePlan, type TechniquePlan } from "./config/techniques";
import type { Campaign, Product } from "./config/types";

export interface EmailConcept {
  angle: string;
  framework: string;
  creativeDevice: string;
  heroProductSlug: string;
  heroProductName: string;
  format: string;
  proofPath: string;
  openerMechanic: string;
  techniquePlan?: TechniquePlan;
}

const ANGLES = ["Pain Relief", "Mechanism", "Proof", "Offer", "Reactivation", "Occasion/Gift"];
const FRAMEWORKS = ["PAS", "BAB", "Proof Ladder", "Mechanism", "Suspended Loop", "Short Sale"];
const FORMATS = ["single-hero story", "mechanism reveal", "review-led note", "occasion conceit", "before-after turn", "quiet sale memo"];
const PROOF_PATHS = ["supplied review", "mechanism detail", "price permission", "fit/use-case proof", "risk reducer", "visual demonstration"];
const OPENERS = [
  "story",
  "fact",
  "question",
  "occasion",
  "re_engagement",
  "insider_reveal",
  "direct_problem",
  "sensory_snapshot",
  "useful_tip",
  "customer_quote",
  "occasion_clock",
];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function recentPenalty(campaign: Campaign, concept: Pick<EmailConcept, "angle" | "framework" | "creativeDevice" | "heroProductSlug" | "openerMechanic" | "techniquePlan">): number {
  return (campaign.recentSendHistory || []).reduce((score, row) => {
    const opener = row.openerMechanic?.toLowerCase() || "";
    const lead = concept.techniquePlan?.lead || "";
    return score
      + (row.angle === concept.angle ? 2 : 0)
      + (row.framework === concept.framework ? 2 : 0)
      + (row.heroSlug === concept.heroProductSlug ? 2 : 0)
      + (opener && concept.openerMechanic.toLowerCase().includes(opener) ? 1 : 0)
      + (lead && opener.includes(lead.replace(/_/g, " ")) ? 2 : 0)
      + (row.visualPattern?.toLowerCase().includes(concept.creativeDevice.toLowerCase()) ? 1 : 0);
  }, 0);
}

function buildConcept(campaign: Campaign, products: Product[], seed: number, offset: number, avoidLeadIds: string[] = []): EmailConcept {
  const brand = BRANDS[campaign.brandId];
  const hero = products[0] || brand?.catalog[0];
  const devices = brand?.subjectDevices?.length ? brand.subjectDevices : ["open-loop", "pattern-interrupt", "playful-conceit"];
  let concept: EmailConcept = {
    angle: pick(ANGLES, seed, offset),
    framework: pick(FRAMEWORKS, seed >> 3, offset * 2),
    creativeDevice: pick(devices, seed >> 5, offset * 3),
    heroProductSlug: hero?.slug || "",
    heroProductName: hero?.name || "",
    format: pick(FORMATS, seed >> 7, offset * 5),
    proofPath: pick(PROOF_PATHS, seed >> 11, offset * 7),
    openerMechanic: pick(OPENERS, seed >> 13, offset * 11),
    techniquePlan: selectTechniquePlan(campaign, {
      isOptionB: offset > 0,
      nonce: `${seed}:${offset}`,
      avoidLeadIds,
    }),
  };

  for (let guard = 0; guard < 8 && recentPenalty(campaign, concept) >= 4; guard++) {
    concept = {
      ...concept,
      angle: pick(ANGLES, seed, offset + guard + 1),
      framework: pick(FRAMEWORKS, seed >> 3, offset * 2 + guard + 1),
      creativeDevice: pick(devices, seed >> 5, offset * 3 + guard + 1),
      format: pick(FORMATS, seed >> 7, offset * 5 + guard + 1),
      proofPath: pick(PROOF_PATHS, seed >> 11, offset * 7 + guard + 1),
      openerMechanic: pick(OPENERS, seed >> 13, offset * 11 + guard + 1),
      techniquePlan: selectTechniquePlan(campaign, {
        isOptionB: offset > 0,
        nonce: `${seed}:${offset}:${guard + 1}`,
        avoidLeadIds,
      }),
    };
  }
  return concept;
}

export function conceptDifferenceCount(a: EmailConcept, b: EmailConcept): number {
  return [
    a.angle !== b.angle,
    a.framework !== b.framework,
    a.creativeDevice !== b.creativeDevice,
    a.heroProductSlug !== b.heroProductSlug,
    a.format !== b.format,
    a.proofPath !== b.proofPath,
    a.openerMechanic !== b.openerMechanic,
    a.techniquePlan?.lead !== b.techniquePlan?.lead,
  ].filter(Boolean).length;
}

export function selectEmailConceptPair(campaign: Campaign, products: Product[]): { a: EmailConcept; b: EmailConcept } {
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
    products.map((p) => p.slug).join("|"),
  ].join("::"));
  const a = buildConcept(campaign, products, seed, 0);
  let b = buildConcept(campaign, products, seed, 3, a.techniquePlan?.lead ? [a.techniquePlan.lead] : []);
  for (let guard = 0; guard < 8 && conceptDifferenceCount(a, b) < 3; guard++) {
    b = buildConcept(campaign, products, seed, 4 + guard, a.techniquePlan?.lead ? [a.techniquePlan.lead] : []);
  }
  return { a, b };
}

export function conceptPrompt(concept: EmailConcept, optionLabel: "A" | "B"): string {
  const plan = concept.techniquePlan;
  return `Option ${optionLabel} concept tuple:
- angle: ${concept.angle}
- framework: ${concept.framework}
- creative_device: ${concept.creativeDevice}
- hero_product: ${concept.heroProductName || concept.heroProductSlug}
- format: ${concept.format}
- proof_path: ${concept.proofPath}
- opener_mechanic: ${concept.openerMechanic}
${plan ? `- technique_lead: ${plan.lead}
- technique_seasoning: ${plan.seasoning.join(", ") || "none"}
- value_payoff_seed: ${plan.valueTip || "none"}` : ""}

Use this tuple as the creative route. Do not rename it into a near-duplicate of the other option.`;
}
