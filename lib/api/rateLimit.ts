// In-memory sliding-window-ish (fixed-window) rate limiter shared by every route that spends
// money or hits an external API. Extracted from the ad-hoc limiter that used to live only in
// app/api/generate-copy/route.ts (docs/IMPROVEMENT_PLAN-2026-07-02.md R5).
//
// In-memory means limits reset on cold start/redeploy and aren't shared across serverless
// instances — acceptable for this app's traffic per the existing generate-copy precedent; a
// durable store (Upstash/Redis) would be a follow-up if abuse becomes a real problem.

export interface RateLimitResult {
  retryAfter: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult | null;
}

export interface RateLimiterOptions {
  windowMs: number;
  /** Max requests per window. 0 (or less) disables the limiter entirely. */
  max: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string): RateLimitResult | null {
      if (opts.max <= 0) return null;
      const now = Date.now();
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        return null;
      }
      if (current.count >= opts.max) {
        return { retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
      }
      current.count += 1;
      return null;
    },
  };
}

/** Per-user key when signed in, else best-effort per-IP — mirrors generate-copy's original logic. */
export function requestRateKey(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return `ip:${forwarded || realIp || "local"}`;
}
