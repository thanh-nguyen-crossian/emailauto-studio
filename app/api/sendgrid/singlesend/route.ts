import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiErrorFromCaught, apiOk, rateLimitedResponse } from "@/lib/api/respond";
import { createRateLimiter, requestRateKey } from "@/lib/api/rateLimit";
import { cleanForTemplate } from "@/lib/cleanEmail";
import { requireActiveUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSingleSend, listContactLists, scheduleSingleSend } from "@/lib/sendgrid";

export const runtime = "nodejs";
export const maxDuration = 40;

const singleSendLimiter = createRateLimiter({ windowMs: 60_000, max: 8 });

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(160),
  html: z.string().min(1),
  listIds: z.array(z.string().trim().min(1)).min(1).max(20),
  designId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  suppressionGroupId: z.number().int().positive().optional(),
  sendAt: z.union([z.literal("now"), z.string().datetime()]).optional(),
  confirmSchedule: z.boolean().optional(),
  overrideQualityGate: z.boolean().optional(),
  sendHistoryRowIds: z.array(z.string().uuid()).max(60).optional(),
}).refine((value) => value.designId || value.templateId, {
  message: "designId or templateId is required",
  path: ["designId"],
});

async function activeUserOrResponse(req: NextRequest) {
  try {
    return { user: await requireActiveUser(req), response: null };
  } catch (err) {
    return { user: null, response: apiErrorFromCaught(err, { status: 401 }) };
  }
}

export async function GET(req: NextRequest) {
  const { user, response } = await activeUserOrResponse(req);
  if (response) return response;
  const rateLimit = singleSendLimiter.check(requestRateKey(req, user?.userId));
  if (rateLimit) return rateLimitedResponse(rateLimit.retryAfter);

  try {
    const lists = await listContactLists();
    return apiOk({ lists });
  } catch (err) {
    return apiErrorFromCaught(err, { status: 502, code: "upstream_error", context: { route: "sendgrid/singlesend:list" } });
  }
}

export async function POST(req: NextRequest) {
  const { user, response } = await activeUserOrResponse(req);
  if (response) return response;
  const rateLimit = singleSendLimiter.check(requestRateKey(req, user?.userId));
  if (rateLimit) return rateLimitedResponse(rateLimit.retryAfter);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "bad_request", "Invalid JSON body");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, "bad_request", "Invalid Single Send request", {
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
    });
  }
  const input = parsed.data;
  if (input.sendAt && !input.confirmSchedule) {
    return apiError(400, "bad_request", "Set confirmSchedule=true to schedule or send a Single Send");
  }
  if (input.sendAt && input.sendAt !== "now") {
    const sendTime = Date.parse(input.sendAt);
    if (!Number.isFinite(sendTime) || sendTime < Date.now() + 60_000) {
      return apiError(400, "bad_request", "Schedule time must be at least 1 minute in the future");
    }
  }

  const clean = cleanForTemplate(input.html);
  if (clean.blocking.length && !input.overrideQualityGate) {
    return apiError(422, "unprocessable", "Pre-send quality gate blocked Single Send creation. Fix blockers or override intentionally.", {
      blocking: clean.blocking,
      warnings: clean.warnings,
      info: clean.info,
      originalBytes: clean.originalBytes,
      cleanedBytes: clean.cleanedBytes,
    });
  }

  try {
    const created = await createSingleSend({ ...input, html: clean.html });
    const schedule = input.sendAt ? await scheduleSingleSend(created.id, input.sendAt) : undefined;
    if (user?.userId && input.sendHistoryRowIds?.length) {
      let update = supabaseAdmin()
        .from("send_history")
        .update({ singlesend_id: created.id })
        .eq("user_id", user.userId)
        .in("id", input.sendHistoryRowIds);
      update = input.designId
        ? update.eq("design_id", input.designId)
        : input.templateId
          ? update.eq("template_id", input.templateId)
          : update;
      const { error } = await update;
      if (error) throw new Error(error.message);
    }
    return apiOk({
      ...created,
      scheduled: schedule?.status || null,
      blocking: clean.blocking,
      warnings: clean.warnings,
      info: clean.info,
      originalBytes: clean.originalBytes,
      cleanedBytes: clean.cleanedBytes,
    });
  } catch (err) {
    return apiErrorFromCaught(err, { status: 502, code: "upstream_error", context: { route: "sendgrid/singlesend:create" } });
  }
}
