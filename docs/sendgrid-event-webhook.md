# SendGrid Event Webhook Setup

EmailAuto Studio can ingest SendGrid engagement events at `/api/webhooks/sendgrid`.

## Setup

1. Apply `supabase/migrations/0005_send_events.sql`.
2. In SendGrid, open **Settings → Mail Settings → Event Webhooks**.
3. Create or edit the webhook and set the Post URL to:
   `https://emailauto-studio-rust.vercel.app/api/webhooks/sendgrid`
4. Enable engagement events needed for performance learning: delivered, open, click, unsubscribe, bounce, spam report.
5. Enable **Signed Event Webhook**, save, then copy the public verification key.
6. Set these Vercel environment variables:
   - `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`
   - `SENDGRID_EVENT_EMAIL_HASH_SALT`

## Notes

- The route rejects unsigned or stale requests before parsing JSON.
- Signature verification uses the raw request bytes plus the Twilio timestamp header.
- Recipient emails are never stored directly; the route stores a salted SHA-256 hash.
- Events are append-only in `send_events`; aggregate folding into `send_history` can run later from the same data.
