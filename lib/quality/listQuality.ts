import { SEGMENT_QUALITY_RULES } from "@/lib/config/intelligence";

export type ListQualityLevel = "ok" | "warn" | "bad";

export interface ListQualityInput {
  selectedCount: number;
  totalCount: number;
  audienceSource: string;
  segmentRule: string;
  theme: string;
  sendDate: string;
}

export interface ListQualityResult {
  level: ListQualityLevel;
  peakEvent: boolean;
  broadList: boolean;
  yahooExpansion: boolean;
  reasons: string[];
  message: string;
}

export function isPeakSend(theme: string, sendDate: string): boolean {
  const surface = `${theme} ${sendDate}`.toLowerCase();
  return SEGMENT_QUALITY_RULES.peakEvents.some((event) => surface.includes(event));
}

function isBroadList(selectedCount: number, totalCount: number, surface: string): boolean {
  const broadByCount = totalCount > 0 && selectedCount >= Math.max(4, Math.ceil(totalCount * 0.7));
  const broadByText = /\b(all|whole|entire|broad|blast|newsletter|everyone|full\s+list|master\s+list)\b/i.test(surface);
  return broadByCount || broadByText;
}

export function analyzeListQuality(input: ListQualityInput): ListQualityResult {
  const surface = `${input.audienceSource} ${input.segmentRule}`.toLowerCase();
  const peakEvent = isPeakSend(input.theme, input.sendDate);
  const broadList = isBroadList(input.selectedCount, input.totalCount, surface);
  const yahooExpansion = /\byahoo\b|\+\s*yahoo/i.test(surface);

  if (peakEvent || (!broadList && !yahooExpansion)) {
    return {
      level: "ok",
      peakEvent,
      broadList,
      yahooExpansion,
      reasons: [],
      message: "",
    };
  }

  const reasons = [
    broadList ? SEGMENT_QUALITY_RULES.tightListLift : "",
    yahooExpansion ? SEGMENT_QUALITY_RULES.yahooDilution : "",
  ].filter(Boolean);
  const action = yahooExpansion
    ? "Remove +Yahoo or split it into a separate test cell unless this is a peak-sale event."
    : "Tighten to high-value/engaged segments or document why reach matters more than CBH/Delivered.";

  return {
    level: yahooExpansion || broadList ? "bad" : "warn",
    peakEvent,
    broadList,
    yahooExpansion,
    reasons,
    message: `${reasons.join(" · ")}. ${action}`,
  };
}
