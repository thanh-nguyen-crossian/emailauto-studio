import { NextResponse } from "next/server";
import { captureError } from "@/lib/observability/sentry";

// Standard JSON error envelope used by every app/api/* route, per
// docs/IMPROVEMENT_PLAN-2026-07-02.md R5. Shape: { error: { code, message }, ...extra }.
// `extra` carries route-specific diagnostic payloads (e.g. `blocking`/`warnings` from the
// pre-send quality gate) at the top level for backward-compatible client consumption —
// see lib/api/clientError.ts for the client-side reader.

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "unprocessable"
  | "upstream_error"
  | "server_error"
  | "cancelled";

export type ApiErrorExtra = Record<string, unknown>;

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: ApiErrorExtra,
  headers?: HeadersInit
): NextResponse {
  return NextResponse.json({ error: { code, message }, ...(extra || {}) }, { status, headers });
}

export function apiOk<T extends object>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 422:
      return "unprocessable";
    case 429:
      return "rate_limited";
    case 499:
      return "cancelled";
    default:
      return status >= 500 ? "server_error" : "bad_request";
  }
}

/**
 * Convert a caught value (an `HttpError` from lib/supabaseAdmin, or any other thrown error) into
 * a standard envelope response. Reports 5xx failures to Sentry (server_error/upstream_error only —
 * 4xx client mistakes aren't incidents).
 */
export function apiErrorFromCaught(
  err: unknown,
  fallback: { status?: number; code?: ApiErrorCode; message?: string; context?: Record<string, unknown> } = {}
): NextResponse {
  const httpErr = err as { status?: number; message?: string };
  const status = typeof httpErr?.status === "number" ? httpErr.status : fallback.status || 500;
  const code = fallback.code || codeForStatus(status);
  const message = httpErr?.message || (err instanceof Error ? err.message : fallback.message) || "Request failed";
  if (status >= 500) captureError(err, { ...fallback.context, status, code });
  return apiError(status, code, message);
}

export function rateLimitedResponse(retryAfter: number, message = "Rate limit reached"): NextResponse {
  return apiError(429, "rate_limited", `${message}. Try again in ${retryAfter}s.`, undefined, {
    "Retry-After": String(retryAfter),
  });
}
