// Next.js server instrumentation hook (runs once per server instance startup).
// See lib/observability/sentry.ts — everything here is a no-op unless SENTRY_DSN is set.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
  }
}

export async function onRequestError(...args: Parameters<NonNullable<typeof import("@sentry/nextjs").captureRequestError>>) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
