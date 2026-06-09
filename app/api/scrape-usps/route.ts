import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractUSPs } from "@/lib/scrape";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 20;

const TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 1_500_000;

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 198 && (b === 18 || b === 19) ||
      a >= 224
    );
  }
  if (version === 6) {
    const h = address.toLowerCase();
    return h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
  }
  return false;
}

async function validatePublicFetchTarget(url: URL): Promise<string | null> {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return "Local or private URLs are not allowed";
  }
  if (isIP(host)) return isPrivateAddress(host) ? "Local or private URLs are not allowed" : null;

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
      return "Local or private URLs are not allowed";
    }
  } catch {
    return "Could not resolve URL host";
  }
  return null;
}

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
  const targetError = await validatePublicFetchTarget(parsed);
  if (targetError) return NextResponse.json({ error: targetError }, { status: 400 });

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
    const type = res.headers.get("content-type") || "";
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) {
      return NextResponse.json({ error: "URL did not return an HTML page" }, { status: 415 });
    }
    const length = Number(res.headers.get("content-length") || "0");
    if (length > MAX_HTML_BYTES) {
      return NextResponse.json({ error: "Product page is too large to scrape safely" }, { status: 413 });
    }
    const html = await res.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return NextResponse.json({ error: "Product page is too large to scrape safely" }, { status: 413 });
    }
    const usps = extractUSPs(html);
    return NextResponse.json({ usps });
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timed out fetching the page" : "Could not fetch the page";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
