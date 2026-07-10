// Server-only. Appends one row to the team's Google Sheet ("templates" tab) via an
// Apps Script Web App webhook after a successful SendGrid push. Fire-safe: never
// throws — a sheet failure must not break the SendGrid sync that already succeeded.
// Configure SHEETS_WEBHOOK_URL + SHEETS_WEBHOOK_SECRET; when unset this is a no-op.

import { captureError } from "@/lib/observability/sentry";

export interface TemplateSheetRow {
  date: string;
  name: string;
  subject: string;
  type: "design" | "template" | "singlesend";
  design_id?: string;
  template_id?: string;
  singlesend_id?: string;
  sendgrid_url?: string;
  status?: string;
  user_id?: string;
}

export function sheetLogConfigured(): boolean {
  return !!(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_WEBHOOK_SECRET);
}

/** POST the row to the Apps Script webhook. Returns true when the row was appended. */
export async function logTemplateRowToSheet(row: TemplateSheetRow): Promise<boolean> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  const secret = process.env.SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, row }),
      signal: AbortSignal.timeout(8000),
      // Apps Script answers via 302 to script.googleusercontent.com; follow it.
      redirect: "follow",
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      captureError(new Error(`sheet append failed: HTTP ${res.status} ${body?.error || ""}`), { route: "sheetLog" });
      return false;
    }
    return true;
  } catch (err) {
    captureError(err, { route: "sheetLog" });
    return false;
  }
}
