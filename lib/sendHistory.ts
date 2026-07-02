"use client";

import { supabase } from "./supabase";
import type { RecentSendMemory } from "./config/types";

export interface SendHistoryRow extends RecentSendMemory {
  id: string;
  createdAt: string;
  singlesendId?: string;
  designId?: string;
  templateId?: string;
  delivered?: number;
  uniqueOpens?: number;
  uniqueClicks?: number;
  bounces?: number;
  unsubscribes?: number;
  spamReports?: number;
  statsSyncedAt?: string;
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
  singlesend_id: string | null;
  design_id: string | null;
  template_id: string | null;
  delivered: number | null;
  unique_opens: number | null;
  unique_clicks: number | null;
  bounces: number | null;
  unsubscribes: number | null;
  spam_reports: number | null;
  stats_synced_at: string | null;
}

export interface NewSendHistoryRow extends RecentSendMemory {
  sourceVersionId?: string;
  /** SendGrid Design Library id — set when this row is auto-recorded from a successful design sync (F1.2). */
  designId?: string;
  /** SendGrid Dynamic Template id — set when this row is auto-recorded from a successful template sync (F1.2). */
  templateId?: string;
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
    singlesendId: row.singlesend_id || undefined,
    designId: row.design_id || undefined,
    templateId: row.template_id || undefined,
    delivered: row.delivered ?? undefined,
    uniqueOpens: row.unique_opens ?? undefined,
    uniqueClicks: row.unique_clicks ?? undefined,
    bounces: row.bounces ?? undefined,
    unsubscribes: row.unsubscribes ?? undefined,
    spamReports: row.spam_reports ?? undefined,
    statsSyncedAt: row.stats_synced_at || undefined,
  };
}

const SEND_HISTORY_COLUMNS =
  "id,created_at,brand_id,segment_code,send_date,option_key,angle,framework,opener_mechanic,emotional_arc,visual_pattern,hero_slug,singlesend_id,design_id,template_id,delivered,unique_opens,unique_clicks,bounces,unsubscribes,spam_reports,stats_synced_at";

export async function listSendHistory(brandId: string, limit = 12): Promise<SendHistoryRow[]> {
  const { data, error } = await supabase()
    .from("send_history")
    .select(SEND_HISTORY_COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data || []) as DbSendHistoryRow[]).map(fromDb);
}

/** Recorded rows still missing a Single Send link — candidates for the "Link Single Send" input. */
export async function listUnlinkedSendHistory(brandId: string, limit = 12): Promise<SendHistoryRow[]> {
  const { data, error } = await supabase()
    .from("send_history")
    .select(SEND_HISTORY_COLUMNS)
    .eq("brand_id", brandId)
    .is("singlesend_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data || []) as DbSendHistoryRow[]).map(fromDb);
}

export async function recordSendHistory(rows: NewSendHistoryRow[]): Promise<SendHistoryRow[]> {
  if (!rows.length) return [];
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
    design_id: row.designId || null,
    template_id: row.templateId || null,
    data: row.data || {},
  }));

  const { data, error } = await sb.from("send_history").insert(payload).select(SEND_HISTORY_COLUMNS);
  if (error) throw new Error(error.message);
  return ((data || []) as DbSendHistoryRow[]).map(fromDb);
}

/** Paste-the-Single-Send-id step (F1.2) — links previously recorded rows so F1.3's stats sync can find them. */
export async function linkSingleSend(rowIds: string[], singlesendId: string): Promise<void> {
  if (!rowIds.length) return;
  const { error } = await supabase().from("send_history").update({ singlesend_id: singlesendId }).in("id", rowIds);
  if (error) throw new Error(error.message);
}
