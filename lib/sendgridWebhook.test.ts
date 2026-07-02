import { createSign, generateKeyPairSync } from "crypto";
import { describe, expect, it } from "vitest";
import {
  hashWebhookEmail,
  normalizeSendGridEvent,
  normalizeSendGridPublicKey,
  verifySendGridEventSignature,
} from "./sendgridWebhook";

function signedFixture(payload: Buffer, timestamp = String(Math.floor(Date.now() / 1000))) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const signer = createSign("sha256");
  signer.update(Buffer.from(timestamp, "utf8"));
  signer.update(payload);
  signer.end();
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    signature: signer.sign(privateKey).toString("base64"),
    timestamp,
  };
}

describe("SendGrid Event Webhook verification", () => {
  it("verifies ECDSA signatures over timestamp + raw payload bytes", () => {
    const payload = Buffer.from('[{"event":"click","email":"person@example.com","timestamp":1783000000}]');
    const signed = signedFixture(payload, "1783000000");
    expect(verifySendGridEventSignature({ ...signed, payload, nowMs: 1783000000 * 1000 })).toBe(true);
  });

  it("rejects tampered payloads and stale timestamps", () => {
    const payload = Buffer.from('[{"event":"open"}]');
    const signed = signedFixture(payload, "1783000000");
    expect(verifySendGridEventSignature({ ...signed, payload: Buffer.from('[{"event":"click"}]'), nowMs: 1783000000 * 1000 })).toBe(false);
    expect(verifySendGridEventSignature({ ...signed, payload, nowMs: 1783000000 * 1000 + 11 * 60 * 1000 })).toBe(false);
  });

  it("normalizes compact public keys into PEM", () => {
    const pem = signedFixture(Buffer.from("[]")).publicKey;
    const compact = pem.replace(/-----[^-]+-----|\s/g, "");
    expect(normalizeSendGridPublicKey(compact)).toContain("-----BEGIN PUBLIC KEY-----");
    expect(normalizeSendGridPublicKey(compact)).toContain("-----END PUBLIC KEY-----");
  });
});

describe("SendGrid Event Webhook normalization", () => {
  it("extracts single-send ids from documented and custom-arg fields", () => {
    const normalized = normalizeSendGridEvent({
      event: "click",
      email: "User@Example.com",
      timestamp: 1783000000,
      url: "https://bragoddess.com/products/daisy-bra",
      sg_event_id: "evt_1",
      sg_message_id: "msg_1",
      custom_args: { singlesend_id: "ss_123" },
    }, "salt");
    expect(normalized).toMatchObject({
      singlesendId: "ss_123",
      event: "click",
      url: "https://bragoddess.com/products/daisy-bra",
      sgEventId: "evt_1",
      sgMessageId: "msg_1",
      sgTimestamp: "2026-07-02T13:46:40.000Z",
    });
    expect(normalized?.emailHash).toBe(hashWebhookEmail("user@example.com", "salt"));
  });

  it("drops invalid events and never returns raw email addresses as the hash", () => {
    expect(normalizeSendGridEvent({ email: "x@example.com" })).toBeNull();
    const normalized = normalizeSendGridEvent({ event: "open", email: "x@example.com" });
    expect(normalized?.emailHash).not.toBe("x@example.com");
  });

  it("creates a deterministic fallback event id when SendGrid omits sg_event_id", () => {
    const event = {
      event: "open",
      email: "x@example.com",
      timestamp: 1783000000,
      sg_message_id: "msg_1",
      singlesend_id: "ss_1",
    };
    const first = normalizeSendGridEvent(event, "salt");
    const second = normalizeSendGridEvent({ ...event }, "salt");
    expect(first?.sgEventId).toMatch(/^[a-f0-9]{64}$/);
    expect(second?.sgEventId).toBe(first?.sgEventId);
  });
});
