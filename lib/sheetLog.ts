// Server-only. Appends one row to the team's Google Sheet ("templates" tab) after a
// successful SendGrid push. Fire-safe: never throws — a sheet failure must not break
// the SendGrid sync that already succeeded.
//
// Primary path: Google Sheets API v4 with an offline OAuth refresh token
// (GOOGLE_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN + SHEET_ID + SHEET_TAB).
// Fallback path: Apps Script webhook (SHEETS_WEBHOOK_URL + SHEETS_WEBHOOK_SECRET,
// see docs/apps-script-sheet-webhook.gs). Neither configured → no-op.
//
// The tab's real header row is read on every append and values are mapped by header
// name, so column order/renames never corrupt rows. Current headers on the tracking
// sheet: id | code | provider | created | description.

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
  return sheetsApiConfigured() || webhookConfigured();
}

function sheetsApiConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
    process.env.SHEET_ID
  );
}

function webhookConfigured(): boolean {
  return !!(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_WEBHOOK_SECRET);
}

/** Values offered to the sheet, keyed by the exact header names used on the tracking tab. */
function toHeaderValues(row: TemplateSheetRow): Record<string, string> {
  return {
    id: row.singlesend_id || row.template_id || row.design_id || "",
    code: row.name,
    provider: "sendgrid",
    created: row.date,
    description: [row.type, row.subject, row.status].filter(Boolean).join(" · "),
    // Extra headers some tabs may add — mapped when present, ignored otherwise.
    date: row.date,
    name: row.name,
    subject: row.subject,
    type: row.type,
    design_id: row.design_id || "",
    template_id: row.template_id || "",
    singlesend_id: row.singlesend_id || "",
    sendgrid_url: row.sendgrid_url || "",
    status: row.status || "",
    user_id: row.user_id || "",
  };
}

async function googleAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`google token refresh failed: ${body.error || res.status}`);
  return body.access_token;
}

async function appendViaSheetsApi(row: TemplateSheetRow): Promise<void> {
  const sheetId = process.env.SHEET_ID!;
  const tab = process.env.SHEET_TAB || "templates";
  const token = await googleAccessToken();
  const auth = { Authorization: `Bearer ${token}` };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values`;

  const headerRes = await fetch(`${base}/${encodeURIComponent(`${tab}!1:1`)}`, {
    headers: auth,
    signal: AbortSignal.timeout(8000),
  });
  const headerBody = (await headerRes.json()) as { values?: string[][]; error?: { message?: string } };
  if (!headerRes.ok) throw new Error(`sheet header read failed: ${headerBody.error?.message || headerRes.status}`);
  const headers = (headerBody.values?.[0] || []).map((h) => String(h).trim().toLowerCase());
  if (!headers.length) throw new Error(`sheet tab "${tab}" has no header row`);

  const byHeader = toHeaderValues(row);
  const values = headers.map((h) => byHeader[h] ?? "");

  const appendRes = await fetch(
    `${base}/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!appendRes.ok) {
    const err = (await appendRes.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`sheet append failed: ${err?.error?.message || appendRes.status}`);
  }
}

async function appendViaWebhook(row: TemplateSheetRow): Promise<void> {
  const res = await fetch(process.env.SHEETS_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET, row: toHeaderValues(row) }),
    signal: AbortSignal.timeout(8000),
    redirect: "follow", // Apps Script answers via 302 to script.googleusercontent.com
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !body?.ok) throw new Error(`webhook append failed: HTTP ${res.status} ${body?.error || ""}`);
}

/** Append the row to the tracking sheet. Returns true when a row was written. */
export async function logTemplateRowToSheet(row: TemplateSheetRow): Promise<boolean> {
  try {
    if (sheetsApiConfigured()) {
      await appendViaSheetsApi(row);
      return true;
    }
    if (webhookConfigured()) {
      await appendViaWebhook(row);
      return true;
    }
    return false;
  } catch (err) {
    captureError(err, { route: "sheetLog" });
    return false;
  }
}
