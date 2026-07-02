import { NextRequest } from "next/server";
import { fetchPublicHtml, PublicFetchError } from "@/lib/publicFetch";
import { extractProductPageDetails, extractUSPs } from "@/lib/scrape";
import { requireActiveUser } from "@/lib/supabaseAdmin";
import { apiError, apiErrorFromCaught, apiOk, rateLimitedResponse } from "@/lib/api/respond";
import { createRateLimiter, requestRateKey } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 20;

const TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 1_500_000;

const scrapeRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  let activeUser: { userId: string } | null = null;
  try {
    activeUser = await requireActiveUser(req);
  } catch (err) {
    return apiErrorFromCaught(err, { status: 401 });
  }

  const rateLimit = scrapeRateLimiter.check(requestRateKey(req, activeUser?.userId));
  if (rateLimit) return rateLimitedResponse(rateLimit.retryAfter);

  let url = "";
  try {
    const body = (await req.json()) as { url?: string };
    url = body.url || "";
  } catch {
    return apiError(400, "bad_request", "Invalid JSON body");
  }

  try {
    const html = await fetchPublicHtml(url, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      tooLargeMessage: "Product page is too large to scrape safely",
    });
    const usps = extractUSPs(html);
    const product = extractProductPageDetails(html, url);
    return apiOk({ usps, product });
  } catch (e) {
    const status = e instanceof PublicFetchError ? e.status : 502;
    return apiErrorFromCaught(e, { status, message: "Could not fetch the page" });
  }
}
