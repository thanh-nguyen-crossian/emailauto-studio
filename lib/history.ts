"use client";

import { supabase } from "./supabase";
import type { AIModelPair, AnalysisContext, BodyLayout, CampaignOps, CampaignStrategy, EmailModuleKey, ImageOverrides, LastSend, OfferType, ProductCopyStyle, Urgency } from "./config/types";
import type { GenBrief } from "./briefgen";
import type { ProductLayout } from "./render/email";

// Everything needed to fully restore a generation back into the studio.
export interface VersionPayload {
  brandId: string;
  sendDate: string;
  theme?: string;
  offerType?: OfferType;
  offerValue?: string;
  offerShipping?: string;
  urgency?: Urgency;
  offer?: string;
  hookContract: string;
  recipientName: string;
  /** Selected segment codes (the variant axis; SantaFare = lifecycle tiers). */
  segments: string[];
  /** Per-slot product picks with chosen URL + selected USPs (slot 0 = hero). */
  slots: { slug: string; url: string; usps: string[] }[];
  includeLogo: boolean;
  /** Product grid arrangement chosen in the output step. */
  productLayout?: ProductLayout;
  /** Body placement chosen in output. */
  bodyLayout?: BodyLayout;
  /** Custom drag/drop module flow. */
  moduleLayout?: EmailModuleKey[];
  /** Product block copy template chosen in build. */
  productCopyStyle?: ProductCopyStyle;
  /** Manual HTML edits to the rendered email, keyed `${opt}:${segment}`. */
  htmlOverrides?: Record<string, string>;
  images: ImageOverrides;
  /** The two generated options (combined copy + design brief). */
  options: { a?: GenBrief; b?: GenBrief };
  /** Per-option provider/model selections used to generate A and B. */
  models?: AIModelPair;
  lastSend?: LastSend;
  strategy?: CampaignStrategy;
  ops?: CampaignOps;
  analysisContext?: AnalysisContext;
  winningContent?: string;
  customPerfContext?: string;
}

export interface SavedVersion {
  id: string;
  created_at: string;
  name: string;
  brand_id: string;
  send_date: string | null;
  data: VersionPayload;
}

export async function saveVersion(name: string, payload: VersionPayload): Promise<SavedVersion> {
  const sb = supabase();
  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { data, error } = await sb
    .from("saved_versions")
    .insert({
      user_id: userId,
      name,
      brand_id: payload.brandId,
      send_date: payload.sendDate || null,
      data: payload,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SavedVersion;
}

export async function listVersions(): Promise<SavedVersion[]> {
  const { data, error } = await supabase()
    .from("saved_versions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as SavedVersion[];
}

export async function deleteVersion(id: string): Promise<void> {
  const { error } = await supabase().from("saved_versions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
