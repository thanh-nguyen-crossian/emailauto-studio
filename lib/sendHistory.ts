"use client";

import { supabase } from "./supabase";
import type { RecentSendMemory } from "./config/types";

export interface SendHistoryRow extends RecentSendMemory {
  id: string;
  createdAt: string;
}

interface DbSendHistoryRow {
  id: string;
  created_at: string;
  brand_id: string;
  segment_code: string;
  send_date: string | null;
  option_key: "a" | "b" | null;
  angle: string | null;
  framework: string | null;
  opener_mechanic: string | null;
  emotional_arc: string | null;
  visual_pattern: string | null;
  hero_slug: string | null;
}

export interface NewSendHistoryRow extends RecentSendMemory {
  sourceVersionId?: string;
  data?: Record<string, unknown>;
}

function fromDb(row: DbSendHistoryRow): SendHistoryRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    brandId: row.brand_id,
    segment: row.segment_code,
    sendDate: row.send_date || undefined,
    optionKey: row.option_key || undefined,
    angle: row.angle || undefined,
    framework: row.framework || undefined,
    openerMechanic: row.opener_mechanic || undefined,
    emotionalArc: row.emotional_arc || undefined,
    visualPattern: row.visual_pattern || undefined,
    heroSlug: row.hero_slug || undefined,
  };
}

export async function listSendHistory(brandId: string, limit = 12): Promise<SendHistoryRow[]> {
  const { data, error } = await supabase()
    .from("send_history")
    .select("id,created_at,brand_id,segment_code,send_date,option_key,angle,framework,opener_mechanic,emotional_arc,visual_pattern,hero_slug")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data || []) as DbSendHistoryRow[]).map(fromDb);
}

export async function recordSendHistory(rows: NewSendHistoryRow[]): Promise<void> {
  if (!rows.length) return;
  const sb = supabase();
  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const payload = rows.map((row) => ({
    user_id: userId,
    brand_id: row.brandId,
    segment_code: row.segment,
    send_date: row.sendDate || null,
    option_key: row.optionKey || null,
    angle: row.angle || null,
    framework: row.framework || null,
    opener_mechanic: row.openerMechanic || null,
    emotional_arc: row.emotionalArc || null,
    visual_pattern: row.visualPattern || null,
    hero_slug: row.heroSlug || null,
    source_version_id: row.sourceVersionId || null,
    data: row.data || {},
  }));

  const { error } = await sb.from("send_history").insert(payload);
  if (error) throw new Error(error.message);
}
