import client from "@sendgrid/client";

// SendGrid v3 Web API wrapper (server-side only). Scope: create a Design in the Design Library
// from the studio's generated HTML. No audience, nothing sendable — a human builds the Single
// Send from the design inside SendGrid.

let configured = false;
function getClient() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not set");
  if (!configured) {
    client.setApiKey(apiKey);
    configured = true;
  }
  return client;
}

export interface CreateDesignInput {
  name: string;
  html: string;
  subject: string;
}

export interface CreatedDesign {
  id: string;
  name: string;
  /** Best-effort link to the design in the SendGrid UI. */
  editorUrl: string;
}

interface SendGridError {
  code?: number;
  response?: { statusCode?: number; body?: { errors?: { message?: string }[] } };
}

/** Pull SendGrid's real error message + a hint when it's a missing-scope 403. */
function describeError(err: unknown): string {
  const e = err as SendGridError;
  const status = e.response?.statusCode ?? e.code;
  const detail = e.response?.body?.errors?.[0]?.message || (err instanceof Error ? err.message : "request failed");
  if (status === 403) {
    return `SendGrid 403: ${detail}. The API key is missing the Marketing scope — create a key with Marketing → Read/Write (Designs live under Marketing).`;
  }
  if (status === 401) return `SendGrid 401: ${detail}. The API key is invalid or revoked.`;
  return `SendGrid error${status ? ` ${status}` : ""}: ${detail}`;
}

/** Thrown by the F1.3/F2.1 stats + Single Send functions — carries the HTTP status so callers can back off on 429. */
export class SendGridApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SendGridApiError";
    this.status = status;
  }
}

function toSendGridError(err: unknown): SendGridApiError {
  const e = err as SendGridError;
  const status = e.response?.statusCode ?? e.code;
  return new SendGridApiError(describeError(err), status);
}

/** POST /v3/designs — store the HTML as a reusable design (editor: "code"). */
export async function createDesign(input: CreateDesignInput): Promise<CreatedDesign> {
  let body: unknown;
  try {
    [, body] = await getClient().request({
      method: "POST",
      url: "/v3/designs",
      body: {
        name: input.name,
        editor: "code", // we provide raw HTML, not the drag-and-drop tree
        html_content: input.html,
        subject: input.subject,
        generate_plain_content: true,
      },
    });
  } catch (err) {
    throw new Error(describeError(err));
  }

  const id = (body as { id?: string })?.id ?? "";
  return {
    id,
    name: input.name,
    editorUrl: id
      ? `https://mc.sendgrid.com/design-library/your-designs/${id}/edit`
      : "https://mc.sendgrid.com/design-library/your-designs",
  };
}

export interface CreatedTemplate {
  templateId: string;
  versionId: string;
  editorUrl: string;
}

/**
 * Create a Dynamic (transactional) Template:
 *   POST /v3/templates              { name, generation: "dynamic" }     -> template_id
 *   POST /v3/templates/{id}/versions { ..., active: 1 }                 -> version_id
 */
export async function createDynamicTemplate(input: CreateDesignInput): Promise<CreatedTemplate> {
  const c = getClient();
  let templateId = "";
  try {
    const [, tbody] = await c.request({
      method: "POST",
      url: "/v3/templates",
      body: { name: input.name, generation: "dynamic" },
    });
    templateId = (tbody as { id?: string })?.id ?? "";
  } catch (err) {
    throw new Error(describeError(err));
  }
  if (!templateId) throw new Error("SendGrid did not return a template id");

  let versionId = "";
  try {
    const [, vbody] = await c.request({
      method: "POST",
      url: `/v3/templates/${templateId}/versions`,
      body: {
        template_id: templateId,
        name: input.name,
        subject: input.subject,
        html_content: input.html,
        active: 1,
        generate_plain_content: true,
      },
    });
    versionId = (vbody as { id?: string })?.id ?? "";
  } catch (err) {
    throw new Error(describeError(err));
  }

  return {
    templateId,
    versionId,
    editorUrl: `https://mc.sendgrid.com/dynamic-templates/${templateId}/version/${versionId}/editor`,
  };
}

// ---- F1.3/F2.1: Marketing Campaign Stats + Single Send API ----
// Docs: https://docs.sendgrid.com/api-reference/marketing-campaign-stats/get-single-send-stats-by-id
//       https://docs.sendgrid.com/api-reference/marketing-campaign-stats/get-single-send-click-tracking-stats-by-id
// These endpoints need the API key to carry Marketing → Read (Read/Write for create/schedule).

export interface SingleSendStats {
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounces: number;
  unsubscribes: number;
  spamReports: number;
}

interface SingleSendStatsResultStats {
  delivered?: number;
  unique_opens?: number;
  unique_clicks?: number;
  bounces?: number;
  unsubscribes?: number;
  spam_reports?: number;
}

/**
 * GET /v3/marketing/stats/singlesends/{id} — aggregates `stats` across every entry in `results`
 * (a Single Send with an A/B test has one entry per variation; a plain send has one).
 */
export async function getSingleSendStats(singlesendId: string): Promise<SingleSendStats> {
  let body: unknown;
  try {
    [, body] = await getClient().request({ method: "GET", url: `/v3/marketing/stats/singlesends/${singlesendId}` });
  } catch (err) {
    throw toSendGridError(err);
  }
  const results = ((body as { results?: { stats?: SingleSendStatsResultStats }[] })?.results) || [];
  const totals: SingleSendStats = { delivered: 0, uniqueOpens: 0, uniqueClicks: 0, bounces: 0, unsubscribes: 0, spamReports: 0 };
  for (const r of results) {
    const s = r.stats || {};
    totals.delivered += s.delivered || 0;
    totals.uniqueOpens += s.unique_opens || 0;
    totals.uniqueClicks += s.unique_clicks || 0;
    totals.bounces += s.bounces || 0;
    totals.unsubscribes += s.unsubscribes || 0;
    totals.spamReports += s.spam_reports || 0;
  }
  return totals;
}

/** GET /v3/marketing/stats/singlesends/{id}/links — per-URL click counts. */
export async function getSingleSendClickStats(singlesendId: string): Promise<Record<string, number>> {
  let body: unknown;
  try {
    [, body] = await getClient().request({ method: "GET", url: `/v3/marketing/stats/singlesends/${singlesendId}/links` });
  } catch (err) {
    throw toSendGridError(err);
  }
  const results = ((body as { results?: { url?: string; unique_clicks?: number; clicks?: number }[] })?.results) || [];
  const byUrl: Record<string, number> = {};
  for (const r of results) {
    if (!r.url) continue;
    byUrl[r.url] = r.unique_clicks ?? r.clicks ?? 0;
  }
  return byUrl;
}

export interface SingleSendSummary {
  id: string;
  name: string;
  status: string;
  sendAt: string | null;
}

/** GET /v3/marketing/singlesends — for the "Link Single Send" picker (F1.2) and F2.1's launcher. */
export async function listSingleSends(pageSize = 50): Promise<SingleSendSummary[]> {
  let body: unknown;
  try {
    [, body] = await getClient().request({ method: "GET", url: `/v3/marketing/singlesends?page_size=${pageSize}` });
  } catch (err) {
    throw toSendGridError(err);
  }
  const result = ((body as { result?: { id?: string; name?: string; status?: string; send_at?: string | null }[] })?.result) || [];
  return result.map((r) => ({ id: r.id || "", name: r.name || "", status: r.status || "", sendAt: r.send_at || null }));
}

export interface ContactList {
  id: string;
  name: string;
  contactCount: number;
}

/** GET /v3/marketing/lists — audience picker for F2.1's "Create Single Send" modal. */
export async function listContactLists(): Promise<ContactList[]> {
  let body: unknown;
  try {
    [, body] = await getClient().request({ method: "GET", url: "/v3/marketing/lists?page_size=100" });
  } catch (err) {
    throw toSendGridError(err);
  }
  const result = ((body as { result?: { id?: string; name?: string; contact_count?: number }[] })?.result) || [];
  return result.map((r) => ({ id: r.id || "", name: r.name || "", contactCount: r.contact_count || 0 }));
}

export interface CreateSingleSendInput {
  name: string;
  subject: string;
  html: string;
  listIds: string[];
  /** One of designId/templateId must be supplied — a Single Send needs an existing Design or Dynamic Template. */
  designId?: string;
  templateId?: string;
  suppressionGroupId?: number;
}

export interface CreatedSingleSend {
  id: string;
  status: string;
}

/**
 * POST /v3/marketing/singlesends — creates a Single Send in draft status. Never called by this
 * app's own verification (docs/IMPROVEMENT_PLAN-2026-07-02.md F2.1 is code-only per the
 * maintainer's "never trigger a real send" instruction) — the maintainer tests this against a
 * real SendGrid account post-merge.
 */
export async function createSingleSend(input: CreateSingleSendInput): Promise<CreatedSingleSend> {
  let body: unknown;
  try {
    [, body] = await getClient().request({
      method: "POST",
      url: "/v3/marketing/singlesends",
      body: {
        name: input.name,
        send_to: { list_ids: input.listIds },
        email_config: {
          subject: input.subject,
          html_content: input.html,
          generate_plain_content: true,
          ...(input.designId ? { design_id: input.designId } : {}),
          ...(input.templateId ? { template_id: input.templateId } : {}),
          ...(input.suppressionGroupId ? { suppression_group_id: input.suppressionGroupId } : {}),
        },
      },
    });
  } catch (err) {
    throw toSendGridError(err);
  }
  const b = body as { id?: string; status?: string };
  return { id: b.id || "", status: b.status || "draft" };
}

/**
 * PUT /v3/marketing/singlesends/{id}/schedule — `sendAt` of "now" sends immediately, else an ISO
 * timestamp. Same never-called-in-verification note as `createSingleSend`.
 */
export async function scheduleSingleSend(singlesendId: string, sendAt: "now" | string): Promise<{ status: string }> {
  let body: unknown;
  try {
    [, body] = await getClient().request({
      method: "PUT",
      url: `/v3/marketing/singlesends/${singlesendId}/schedule`,
      body: { send_at: sendAt },
    });
  } catch (err) {
    throw toSendGridError(err);
  }
  return { status: (body as { status?: string })?.status || "scheduled" };
}
