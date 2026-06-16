import type { GenBrief } from "../briefgen";
import type { RecentSendMemory } from "../config/types";

export interface FreshnessResult {
  score: number;
  label: "Fresh" | "Review" | "Repetitive";
  overlapElement: string;
  notes: string[];
}

function norm(value?: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameText(a?: string, b?: string): boolean {
  const left = norm(a);
  const right = norm(b);
  return !!left && !!right && left === right;
}

function briefVisualPattern(brief: GenBrief): string {
  return norm([
    brief.creative_direction?.brief_route,
    brief.creative_direction?.branch,
    brief.banner?.main_image,
    brief.banner?.sub_image,
    brief.banner?.image_guidance,
  ].filter(Boolean).join(" "));
}

function briefHeroSlug(brief: GenBrief): string {
  return norm(brief.products?.[0]?.name || brief.creative_direction?.hook_contract?.hero_product);
}

export function scoreFreshnessAgainstHistory(brief: GenBrief | undefined, history: RecentSendMemory[] = []): FreshnessResult {
  if (!brief || !history.length) {
    return { score: 100, label: "Fresh", overlapElement: "No recent send history", notes: [] };
  }

  const cd = brief.creative_direction || {};
  const qc = brief.quality_checks || {};
  const visual = briefVisualPattern(brief);
  const hero = briefHeroSlug(brief);
  const notes: string[] = [];
  let penalty = 0;
  let overlapElement = "No major overlap";

  for (const item of history.slice(0, 6)) {
    const matches: string[] = [];
    if (sameText(cd.angle, item.angle)) matches.push("angle");
    if (sameText(cd.framework, item.framework)) matches.push("framework");
    if (sameText(qc.opener_mechanic, item.openerMechanic)) matches.push("opener");
    if (sameText((brief.body_variety?.emotionalArc || ""), item.emotionalArc)) matches.push("emotional arc");
    if (sameText(hero, item.heroSlug)) matches.push("hero");
    if (item.visualPattern && visual.includes(norm(item.visualPattern).split(" ").slice(0, 4).join(" "))) matches.push("visual pattern");
    if (!matches.length) continue;

    const weight = item.segment && item.segment in (brief.subject_lines || {}) ? 1.15 : 1;
    penalty += Math.round((10 + matches.length * 5) * weight);
    const label = `${item.segment}: ${matches.join(", ")}`;
    notes.push(label);
    if (overlapElement === "No major overlap" || matches.length > overlapElement.split(",").length) {
      overlapElement = label;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const label = score >= 80 ? "Fresh" : score >= 55 ? "Review" : "Repetitive";
  return { score, label, overlapElement, notes: notes.slice(0, 5) };
}
