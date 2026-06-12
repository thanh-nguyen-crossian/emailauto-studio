import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class PublicFetchError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PublicFetchError";
    this.status = status;
  }
}

export interface FetchPublicHtmlOptions {
  timeoutMs?: number;
  maxBytes?: number;
  tooLargeMessage?: string;
}

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

async function validatePublicFetchTarget(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new PublicFetchError("Local or private URLs are not allowed", 400);
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new PublicFetchError("Local or private URLs are not allowed", 400);
    return;
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
      throw new PublicFetchError("Local or private URLs are not allowed", 400);
    }
  } catch (err) {
    if (err instanceof PublicFetchError) throw err;
    throw new PublicFetchError("Could not resolve URL host", 400);
  }
}

export async function fetchPublicHtml(input: string, options: FetchPublicHtmlOptions = {}): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new PublicFetchError("Invalid URL", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PublicFetchError("URL must be http(s)", 400);
  }

  await validatePublicFetchTarget(parsed);

  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const tooLarge = options.tooLargeMessage || "Page is too large to scrape safely";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EmailAutoStudio/1.0; +https://emailauto-studio.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new PublicFetchError(`Page returned HTTP ${res.status}`, 502);
    const type = res.headers.get("content-type") || "";
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) {
      throw new PublicFetchError("URL did not return an HTML page", 415);
    }
    const length = Number(res.headers.get("content-length") || "0");
    if (length > maxBytes) throw new PublicFetchError(tooLarge, 413);
    const html = await res.text();
    if (Buffer.byteLength(html, "utf8") > maxBytes) throw new PublicFetchError(tooLarge, 413);
    return html;
  } catch (err) {
    if (err instanceof PublicFetchError) throw err;
    const msg = err instanceof Error && err.name === "AbortError" ? "Timed out fetching the page" : "Could not fetch the page";
    throw new PublicFetchError(msg, 502);
  } finally {
    clearTimeout(timer);
  }
}
