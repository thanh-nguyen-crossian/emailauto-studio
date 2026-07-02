// Minimal, DSN-gated Sentry wiring (docs/IMPROVEMENT_PLAN-2026-07-02.md R5). With no SENTRY_DSN
// set this is a complete no-op — safe for local dev and any deploy that hasn't opted in yet.
// The maintainer can run `npx @sentry/wizard@latest -i nextjs` later for full source-map/release
// integration; this hand-wired version only needs an env var to start capturing server errors.

type SentryModule = typeof import("@sentry/nextjs");

let sentryModulePromise: Promise<SentryModule | null> | null = null;

/** Dynamically imports and initializes the SDK exactly once, only when a DSN is configured. */
function loadSentry(): Promise<SentryModule | null> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return Promise.resolve(null);
  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
          tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
          beforeSend(event) {
            // Never let request bodies (campaign briefs, tokens) leave the server.
            if (event.request) delete event.request.data;
            return event;
          },
        });
        return Sentry;
      })
      .catch(() => null);
  }
  return sentryModulePromise;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "production" || process.env.AI_GENERATION_TELEMETRY === "on") {
    console.error("[api-error]", err instanceof Error ? err.message : err, context || "");
  }
  void loadSentry().then((Sentry) => {
    Sentry?.captureException(err, context ? { extra: context } : undefined);
  });
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  void loadSentry().then((Sentry) => {
    Sentry?.captureMessage(message, context ? { extra: context } : undefined);
  });
}
