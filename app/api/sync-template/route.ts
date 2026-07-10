import { NextRequest } from "next/server";
import { createDynamicTemplate } from "@/lib/sendgrid";
import { cleanForTemplate } from "@/lib/cleanEmail";
import { requireActiveUser } from "@/lib/supabaseAdmin";
import { apiError, apiErrorFromCaught, apiOk, rateLimitedResponse } from "@/lib/api/respond";
import { createRateLimiter, requestRateKey } from "@/lib/api/rateLimit";
import { captureError } from "@/lib/observability/sentry";
import { logTemplateRowToSheet } from "@/lib/sheetLog";

export const runtime = "nodejs";
export const maxDuration = 30;

const syncTemplateRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  let activeUser: { userId: string } | null = null;
  try {
    activeUser = await requireActiveUser(req);
  } catch (err) {
    return apiErrorFromCaught(err, { status: 401 });
  }

  const rateLimit = syncTemplateRateLimiter.check(requestRateKey(req, activeUser?.userId));
  if (rateLimit) return rateLimitedResponse(rateLimit.retryAfter);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "bad_request", "Invalid JSON body");
  }

  const { name, html, subject, overrideQualityGate } = (body || {}) as { name?: string; html?: string; subject?: string; overrideQualityGate?: boolean };
  if (!name || !html) {
    return apiError(400, "bad_request", "name and html are required");
  }

  // Run the team's clean/optimize/QA pass before creating the template.
  const clean = cleanForTemplate(html);
  if (clean.blocking.length && !overrideQualityGate) {
    return apiError(422, "unprocessable", "Pre-send quality gate blocked SendGrid template sync. Fix blockers or override intentionally.", {
      blocking: clean.blocking,
      warnings: clean.warnings,
      info: clean.info,
      originalBytes: clean.originalBytes,
      cleanedBytes: clean.cleanedBytes,
    });
  }

  try {
    const tpl = await createDynamicTemplate({ name, html: clean.html, subject: subject || name });
    // Task 4 — auto-fill the team tracking sheet ("templates" tab) after a successful push.
    const sheetLogged = await logTemplateRowToSheet({
      date: new Date().toISOString().slice(0, 10),
      name,
      subject: subject || name,
      type: "template",
      template_id: tpl.templateId,
      sendgrid_url: tpl.editorUrl,
      status: "created",
      user_id: activeUser?.userId,
    });
    return apiOk({
      ...tpl,
      sheetLogged,
      blocking: clean.blocking,
      warnings: clean.warnings,
      info: clean.info,
      originalBytes: clean.originalBytes,
      cleanedBytes: clean.cleanedBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template sync failed";
    const status = message.includes("SENDGRID_API_KEY") ? 500 : 502;
    captureError(err, { route: "sync-template", status });
    return apiError(status, status === 500 ? "server_error" : "upstream_error", message, {
      blocking: clean.blocking,
      warnings: clean.warnings,
    });
  }
}
