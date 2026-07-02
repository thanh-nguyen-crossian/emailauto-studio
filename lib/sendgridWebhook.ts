import { createHash, createPublicKey, createVerify } from "crypto";

export const SENDGRID_EVENT_SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
export const SENDGRID_EVENT_TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

export interface NormalizedSendGridEvent {
  singlesendId: string | null;
  event: string;
  emailHash: string | null;
  url: string | null;
  sgEventId: string | null;
  sgMessageId: string | null;
  sgTimestamp: string | null;
  raw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function normalizeSendGridPublicKey(input: string): string {
  const key = input.trim().replace(/\\n/g, "\n");
  if (/-----BEGIN PUBLIC KEY-----/.test(key)) return key;
  const compact = key.replace(/\s+/g, "");
  const wrapped = compact.match(/.{1,64}/g)?.join("\n") || compact;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

export function verifySendGridEventSignature(input: {
  publicKey: string;
  timestamp: string;
  payload: Buffer;
  signature: string;
  nowMs?: number;
  toleranceMs?: number;
}): boolean {
  if (!input.publicKey.trim() || !input.timestamp.trim() || !input.signature.trim()) return false;
  const tsNumber = Number(input.timestamp);
  const timestampMs = Number.isFinite(tsNumber) ? (tsNumber > 9_999_999_999 ? tsNumber : tsNumber * 1000) : NaN;
  const toleranceMs = input.toleranceMs ?? 10 * 60 * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs((input.nowMs ?? Date.now()) - timestampMs) > toleranceMs) return false;
  try {
    const verifier = createVerify("sha256");
    verifier.update(Buffer.from(input.timestamp, "utf8"));
    verifier.update(input.payload);
    verifier.end();
    return verifier.verify(createPublicKey(normalizeSendGridPublicKey(input.publicKey)), Buffer.from(input.signature, "base64"));
  } catch {
    return false;
  }
}

export function hashWebhookEmail(email: unknown, salt = ""): string | null {
  const clean = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!clean) return null;
  return createHash("sha256").update(`${salt}:${clean}`).digest("hex");
}

function eventTimestamp(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const ms = n > 9_999_999_999 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function extractSingleSendId(raw: Record<string, unknown>): string | null {
  const uniqueArgs = asRecord(raw.unique_args);
  const customArgs = asRecord(raw.custom_args);
  const newsletter = asRecord(raw.newsletter);
  return (
    asString(raw.singlesend_id) ||
    asString(raw.single_send_id) ||
    asString(raw.marketing_campaign_id) ||
    asString(uniqueArgs.singlesend_id) ||
    asString(uniqueArgs.single_send_id) ||
    asString(customArgs.singlesend_id) ||
    asString(customArgs.single_send_id) ||
    asString(newsletter.newsletter_send_id)
  );
}

function eventFingerprint(parts: {
  singlesendId: string | null;
  event: string;
  emailHash: string | null;
  url: string | null;
  sgMessageId: string | null;
  sgTimestamp: string | null;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

export function normalizeSendGridEvent(value: unknown, emailHashSalt = ""): NormalizedSendGridEvent | null {
  const raw = asRecord(value);
  const event = asString(raw.event);
  if (!event) return null;
  const singlesendId = extractSingleSendId(raw);
  const emailHash = hashWebhookEmail(raw.email, emailHashSalt);
  const url = asString(raw.url);
  const sgMessageId = asString(raw.sg_message_id);
  const sgTimestamp = eventTimestamp(raw.timestamp);
  const sgEventId = asString(raw.sg_event_id) || eventFingerprint({ singlesendId, event, emailHash, url, sgMessageId, sgTimestamp });
  return {
    singlesendId,
    event,
    emailHash,
    url,
    sgEventId,
    sgMessageId,
    sgTimestamp,
    raw,
  };
}
