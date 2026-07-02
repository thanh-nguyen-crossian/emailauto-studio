// Client-safe reader for the `{ error: { code, message } }` envelope every route now returns
// (docs/IMPROVEMENT_PLAN-2026-07-02.md R5). Also accepts the old flat `{ error: "message" }`
// shape so any response we haven't touched yet still degrades gracefully.

export function errorMessage(data: unknown, fallback = "Request failed"): string {
  const e = (data as { error?: unknown } | null | undefined)?.error;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

export function errorCode(data: unknown): string | undefined {
  const e = (data as { error?: unknown } | null | undefined)?.error;
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return undefined;
}
