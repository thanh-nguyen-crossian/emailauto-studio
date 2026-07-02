import { NextRequest } from "next/server";
import { apiError, apiErrorFromCaught, apiOk } from "@/lib/api/respond";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeSendGridEvent,
  type NormalizedSendGridEvent,
  SENDGRID_EVENT_SIGNATURE_HEADER,
  SENDGRID_EVENT_TIMESTAMP_HEADER,
  verifySendGridEventSignature,
} from "@/lib/sendgridWebhook";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const publicKey = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY || "";
  if (!publicKey.trim()) {
    return apiError(500, "server_error", "SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY is not configured");
  }

  const signature = req.headers.get(SENDGRID_EVENT_SIGNATURE_HEADER) || "";
  const timestamp = req.headers.get(SENDGRID_EVENT_TIMESTAMP_HEADER) || "";
  const payload = Buffer.from(await req.arrayBuffer());
  const verified = verifySendGridEventSignature({ publicKey, timestamp, payload, signature });
  if (!verified) return apiError(401, "unauthorized", "Invalid SendGrid webhook signature");

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString("utf8"));
  } catch {
    return apiError(400, "bad_request", "Invalid JSON body");
  }

  const events = Array.isArray(parsed) ? parsed : [parsed];
  const rows = events
    .map((event) => normalizeSendGridEvent(event, process.env.SENDGRID_EVENT_EMAIL_HASH_SALT || ""))
    .filter((event): event is NormalizedSendGridEvent => !!event)
    .map((event) => ({
      singlesend_id: event.singlesendId,
      event: event.event,
      email_hash: event.emailHash,
      url: event.url,
      sg_event_id: event.sgEventId,
      sg_message_id: event.sgMessageId,
      sg_timestamp: event.sgTimestamp,
      raw: event.raw,
    }));

  if (!rows.length) return apiOk({ inserted: 0, ignored: events.length });

  try {
    const { error } = await supabaseAdmin()
      .from("send_events")
      .upsert(rows, { onConflict: "sg_event_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } catch (err) {
    return apiErrorFromCaught(err, { status: 500, context: { route: "webhooks/sendgrid" } });
  }

  return apiOk({ inserted: rows.length, ignored: events.length - rows.length });
}
