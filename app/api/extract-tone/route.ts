import { NextRequest, NextResponse } from "next/server";
import { fetchPublicHtml, PublicFetchError } from "@/lib/publicFetch";
import { extractPageHighlights, extractPageToneKeywords } from "@/lib/scrape";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 20;

const TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;

export async function POST(req: NextRequest) {
  try {
    await requireActiveUser(req);
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  let url = "";
  try {
    const body = (await req.json()) as { url?: string };
    url = body.url || "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const html = await fetchPublicHtml(url, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      tooLargeMessage: "Brand page is too large to analyze safely",
    });
    return NextResponse.json({
      toneKeywords: extractPageToneKeywords(html),
      highlights: extractPageHighlights(html),
    });
  } catch (e) {
    const status = e instanceof PublicFetchError ? e.status : 502;
    const error = e instanceof Error ? e.message : "Could not analyze the page";
    return NextResponse.json({ error }, { status });
  }
}
