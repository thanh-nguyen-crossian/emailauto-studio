import type { TierCode, TierPsychology } from "./types";

// TIER_PSYCHOLOGY — the recency/lifecycle axis. Maps the RMKT engagement tiers (Tệp) to the
// playbook's lifecycle copy moves (loyal → recognition; at-risk → proof + friction removal;
// lapsed → one low-risk reason to return). One Claude call is made per tier.
//
// For SantaFare these tiers double as the recency sub-versions of Segment 1
// (A≈Active/VIP, B≈Active, D≈Drifting, F≈Lapsed).

export const TIER_PSYCHOLOGY: Record<TierCode, TierPsychology> = {
  A: {
    code: "A",
    label: "Champions / Loyal · recent buyers",
    mindset:
      "Already loves the brand and buys often. Doesn't need convincing on value — give a reason to act now and feel recognized.",
    pricingFraming: "Frame as an exclusive loyalty reward / first-look; lead with the best price.",
    tone: "Warm insider, celebratory, 'because you're one of our best'.",
    urgency: "Soft scarcity + short window — they trust the deadline.",
    psHint: "Recognize their loyalty; hint at what's coming next (early access).",
  },
  B: {
    code: "B",
    label: "Good engagement · recent buyers",
    mindset:
      "Engaged and bought recently, not a superfan yet. Responsive to a strong specific offer that confirms they chose right.",
    pricingFraming: "Specific price anchor + clear % off; show the saving concretely.",
    tone: "Friendly, encouraging, confident.",
    urgency: "Time-bound deadline with one clear reason to act.",
    psHint: "Reinforce the free-shipping threshold or a bonus to nudge the next purchase.",
  },
  C: {
    code: "C",
    label: "At Risk / Need Attention",
    mindset:
      "On the fence — opens sometimes, rarely clicks. Needs proof and friction removal to re-earn attention.",
    pricingFraming: "Lead with the emotional hook + proof; reveal price as the payoff.",
    tone: "Story-first, relatable, low-pressure.",
    urgency: "Curiosity gap + gentle deadline; don't over-discount upfront.",
    psHint: "Add a named-person proof point or a no-risk returns reassurance.",
  },
  D: {
    code: "D",
    label: "Drifting · low recent engagement",
    mindset:
      "Bought once but going quiet. Needs the natural next product and a reminder of why they liked the brand.",
    pricingFraming: "Generous, concrete offer with a clear price anchor to overcome inertia.",
    tone: "Welcoming-back, warm, slightly more urgent.",
    urgency: "Deadline framed as a reluctant 'can't hold this past midnight' to feel personal.",
    psHint: "Remind them of free shipping and easy exchanges.",
  },
  F: {
    code: "F",
    label: "Lost / Lapsed · winback",
    mindset:
      "Effectively dormant. This is a winback — acknowledge time away lightly and remove friction. Subject creates a suspended loop or mild anxiety around something earned-but-unclaimed.",
    pricingFraming: "Strongest offer of the matrix; make the value impossible to ignore. Lead risk-free.",
    tone: "Re-engagement, warm, emotionally direct — no guilt, no 'we miss you' cliché.",
    urgency: "Unresolved loop ('UNCLAIMED ⚠️') + hard deadline.",
    psHint: "One last deadline reminder; make the click feel like reclaiming something earned.",
  },
};
