import { useReducer } from "react";
import { DEFAULT_AI_MODELS, normalizeModelPair } from "@/lib/config/aiModels";
import { DEFAULT_MODULE_LAYOUT, RECIPIENT_NAME_TOKEN } from "@/lib/config/types";
import type { VersionPayload } from "@/lib/history";
import {
  DEFAULT_OPS,
  createInitialStudioState,
  initSlots,
  type Draft,
  type StudioCampaignState,
  type StudioGenerationState,
  type StudioState,
  type StudioUiState,
} from "./studioShared";

type StudioAction =
  | { type: "campaign.patch"; patch: Partial<StudioCampaignState> }
  | { type: "ui.patch"; patch: Partial<StudioUiState> }
  | { type: "generation.patch"; patch: Partial<StudioGenerationState> }
  | { type: "restoreDraft"; draft: Draft }
  | { type: "openVersion"; payload: VersionPayload }
  | { type: "reset" };

function restoreDraftState(state: StudioState, draft: Draft): StudioState {
  const c = draft.campaign;
  return {
    ...state,
    campaign: {
      ...state.campaign,
      brandId: c.brandId,
      sendDate: c.sendDate,
      theme: c.theme,
      offerType: c.offerType,
      offerValue: c.offerValue,
      offerShipping: c.offerShipping || "",
      urgency: c.urgency,
      hookContract: c.hookContract || "",
      recipientName: RECIPIENT_NAME_TOKEN,
      lastHero: c.lastSend?.hero || "",
      lastAngle: c.lastSend?.angle || "",
      lastCtr: c.lastSend?.ctr || "",
      lastNote: c.lastSend?.note || "",
      lastOpenerMechanic: c.lastSend?.openerMechanic || "",
      lastEmotionalArc: c.lastSend?.emotionalArc || "",
      strategy: c.strategy || {},
      ops: c.ops || DEFAULT_OPS,
      winningContent: c.winningContent || "",
      customPerfContext: c.customPerfContext ?? null,
      modelA: draft.modelA,
      modelB: draft.modelB,
      segments: c.segments,
      slots: draft.slots,
      images: draft.images,
      includeLogo: draft.includeLogo,
      productLayout: draft.productLayout,
      bodyLayout: c.bodyLayout || "continuous",
      bodyFocus: (c.bodyFocus === "grid" ? "grid" : "hero") as "hero" | "grid",
      moduleLayout: c.moduleLayout || DEFAULT_MODULE_LAYOUT,
      productCopyStyle: c.productCopyStyle || "headline_winner",
    },
    ui: {
      ...state.ui,
      view: draft.view,
      visited: [0, 1, 2],
      activeOption: draft.activeOption,
      activeSegment: draft.activeSegment,
      outputTab: "preview",
      editingHtml: false,
      revisionFeedback: "",
    },
    generation: {
      ...state.generation,
      options: draft.options,
      htmlOverrides: draft.htmlOverrides,
      apiError: null,
      genWarning: null,
      systemOverride: null,
      userOverride: null,
      progress: null,
    },
  };
}

function openVersionState(state: StudioState, d: VersionPayload): StudioState {
  const models = normalizeModelPair(d.models);
  const hasOutput = Boolean(d.options?.a || d.options?.b);
  return {
    ...state,
    campaign: {
      ...state.campaign,
      brandId: d.brandId,
      sendDate: d.sendDate,
      theme: d.theme || "",
      offerType: d.offerType === "free_ship" ? "none" : d.offerType || "none",
      offerValue: d.offerType === "free_ship" ? "" : d.offerValue || "",
      offerShipping: d.offerShipping || (d.offerType === "free_ship" ? d.offerValue || "" : ""),
      urgency: d.urgency || "none",
      hookContract: d.hookContract || "",
      recipientName: RECIPIENT_NAME_TOKEN,
      lastHero: d.lastSend?.hero || "",
      lastAngle: d.lastSend?.angle || "",
      lastCtr: d.lastSend?.ctr || "",
      lastNote: d.lastSend?.note || "",
      lastOpenerMechanic: d.lastSend?.openerMechanic || "",
      lastEmotionalArc: d.lastSend?.emotionalArc || "",
      strategy: d.strategy || {},
      ops: d.ops || DEFAULT_OPS,
      winningContent: d.winningContent || "",
      customPerfContext: d.customPerfContext ?? null,
      modelA: models.a,
      modelB: models.b,
      segments: d.segments || [],
      slots: d.slots && d.slots.length ? d.slots : initSlots(d.brandId),
      images: d.images || {},
      includeLogo: d.includeLogo,
      productLayout: d.productLayout || "stack",
      bodyLayout: d.bodyLayout || "continuous",
      bodyFocus: (d.bodyFocus === "grid" ? "grid" : "hero") as "hero" | "grid",
      moduleLayout: d.moduleLayout || DEFAULT_MODULE_LAYOUT,
      productCopyStyle: d.productCopyStyle || "headline_winner",
    },
    ui: {
      ...state.ui,
      view: hasOutput ? "output" : "build",
      activeOption: d.options?.a ? "a" : "b",
      activeSegment: (d.segments || [])[0] || "",
      outputTab: "preview",
      editingHtml: false,
      revisionFeedback: "",
    },
    generation: {
      ...state.generation,
      options: d.options || {},
      htmlOverrides: d.htmlOverrides || {},
      apiError: null,
      genWarning: null,
      systemOverride: null,
      userOverride: null,
      progress: null,
    },
  };
}

function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "campaign.patch":
      return { ...state, campaign: { ...state.campaign, ...action.patch } };
    case "ui.patch":
      return { ...state, ui: { ...state.ui, ...action.patch } };
    case "generation.patch":
      return { ...state, generation: { ...state.generation, ...action.patch } };
    case "restoreDraft":
      return restoreDraftState(state, action.draft);
    case "openVersion":
      return openVersionState(state, action.payload);
    case "reset":
      return createInitialStudioState();
    default:
      return state;
  }
}

export function useStudioReducer() {
  return useReducer(studioReducer, undefined, createInitialStudioState);
}
