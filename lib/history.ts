"use client";

import { supabase } from "./supabase";
import type { ImageOverrides, TierCode, VariantCopyMap } from "./config/types";

// Everything needed to fully restore a generation back into the studio.
export interface VersionPayload {
  brandId: string;
  sendDate: string;
  offer: string;
  hookContract: string;
  recipientName: string;
  tiers: TierCode[];
  productTypes: string[];
  selectedSlugs: string[];
  includeLogo: boolean;
  images: ImageOverrides;
  copy: VariantCopyMap;
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
