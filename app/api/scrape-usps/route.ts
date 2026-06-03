import { NextRequest, NextResponse } from "next/server";
import { extractUSPs } from "@/lib/scrape";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 20;

const TIMEOUT_MS = 12000;

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

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "URL must be http(s)" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EmailAutoStudio/1.0; +https://emailauto-studio.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return NextResponse.json({ error: `Page returned HTTP ${res.status}` }, { status: 502 });
    const html = await res.text();
    const usps = extractUSPs(html);
    return NextResponse.json({ usps });
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timed out fetching the page" : "Could not fetch the page";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
