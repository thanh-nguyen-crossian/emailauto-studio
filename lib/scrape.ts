// USP extraction from a product page's HTML. Mirrors the email-brief-generator heuristic
// (list items + elements whose class hints at a feature/benefit/usp) but runs server-side
// with regex instead of DOMParser, so there is no CORS proxy and no browser dependency.

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&hellip;": "…", "&rsquo;": "'", "&lsquo;": "'",
  "&ldquo;": "“", "&rdquo;": "”",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// Common nav / chrome / boilerplate lines to drop (these recur on storefronts and content sites).
const NAV = /^(main page|contents|current events|random article|about|about us|contact|contact us|help|home|shop|shop now|cart|account|login|log in|sign in|register|search|menu|reviews|review|faq|faqs|privacy|privacy policy|terms|returns|exchanges|shipping|track order|wishlist|categories|all products|new arrivals|best ?sellers|gift cards?|clearance|sale|subscribe|newsletter|follow us|share|next|previous|read more|learn more|view all|see all)$/i;

/** Reject lines that are clearly not USPs: nav, countdown timers, review bylines, number/price junk. */
function isNoise(t: string): boolean {
  if (NAV.test(t)) return true;
  if (/^[-–—•·*]/.test(t)) return true; // starts with a dash/bullet — usually a review byline residue
  if (/\d\s*[hms]\b.*\d\s*[hms]\b/i.test(t)) return true; // countdown timer (2+ time units, e.g. "00 h 13 m")
  if (/^\W*[\d\s:.,hdms%$+]+\W*$/i.test(t)) return true; // mostly numbers / time / price symbols
  if (/,\s*\d{1,3}\s*[-–—]\s*[A-Za-z]/.test(t)) return true; // "— Linda M., 62 - Florida" review byline
  const letters = (t.match(/[a-z]/gi) || []).length;
  if (letters < t.length * 0.5) return true; // < 50% letters = junk
  return false;
}

/** Pull candidate USP strings from raw HTML. Returns up to `max` clean, deduped lines. */
export function extractUSPs(html: string, max = 6): string[] {
  // Decode JSON unicode escapes first so HTML embedded in __NEXT_DATA__/JSON (common on React
  // storefronts, where product copy isn't in the static DOM) becomes real tags we can parse.
  let src = String(html || "").replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  src = src.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

  const items: string[] = [];
  const push = (raw: string) => {
    const t = stripTags(raw);
    if (t.length > 5 && t.length < 120 && !/[\n\r]/.test(t) && !isNoise(t)) items.push(t);
  };

  // 1) every <li>…</li>
  for (const m of src.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) push(m[1]);
  // 2) p/div/span/h* whose class hints feature/benefit/usp/highlight
  for (const m of src.matchAll(
    /<(p|div|span|h[1-6])\b[^>]*class="[^"]*(?:usp|feature|benefit|highlight)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi
  )) {
    push(m[2]);
  }
  // 3) bolded benefit phrases (product feature headers are usually <strong>/<b>)
  for (const m of src.matchAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)) push(m[2]);

  // case-insensitive dedupe, preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of items) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out.slice(0, max);
}

export interface ProductPageDetails {
  name: string;
  price: string;
  review: string;
  image: string;
  highlights: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function metaContent(html: string, key: string): string {
  const escaped = escapeRegExp(key);
  const re = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>`, "i");
  return htmlAttr(html, re);
}

function normalizeAbsoluteUrl(raw: string, baseUrl?: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return value;
  }
}

function cleanProductName(raw: string): string {
  const text = stripTags(raw)
    .replace(/\s+/g, " ")
    .replace(/\s*(?:\||–|—)\s*(?:official\s+)?(?:store|shop|online store).*$/i, "")
    .trim();
  const split = text.split(/\s+(?:\||–|—)\s+/).map((part) => part.trim()).filter(Boolean);
  return (split[0] || text).replace(/\s+[-|]\s*$/, "").slice(0, 120);
}

function normalizePrice(raw: string): string {
  const text = stripTags(raw).replace(/,/g, "").trim();
  const match = /(?:USD|US\$|\$|💲)?\s*(\d{1,4}(?:\.\d{2})?)/i.exec(text);
  return match ? match[1] : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function ldText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(ldText).find(Boolean) || "";
  const record = asRecord(value);
  if (!record) return "";
  return ldText(record["@value"] || record.name || record.text || record.url);
}

function flattenJsonLd(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    value.forEach((item) => flattenJsonLd(item, out));
    return out;
  }
  const record = asRecord(value);
  if (!record) return out;
  out.push(record);
  if (Array.isArray(record["@graph"])) flattenJsonLd(record["@graph"], out);
  return out;
}

function ldTypeIncludes(record: Record<string, unknown>, type: string): boolean {
  const value = record["@type"];
  const wanted = type.toLowerCase();
  if (Array.isArray(value)) return value.some((item) => String(item).toLowerCase() === wanted);
  return String(value || "").toLowerCase() === wanted;
}

function jsonLdRecords(html: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["'][^"']*ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = decodeEntities(match[1] || "").replace(/^\s*<!--|-->\s*$/g, "").trim();
    if (!raw) continue;
    try {
      flattenJsonLd(JSON.parse(raw), records);
    } catch {
      /* Some storefronts emit invalid JSON-LD; fall back to meta tags. */
    }
  }
  return records;
}

function productJsonLd(html: string): Record<string, unknown> | null {
  return jsonLdRecords(html).find((record) => ldTypeIncludes(record, "Product")) || null;
}

function priceFromJsonLd(product: Record<string, unknown> | null): string {
  if (!product) return "";
  const offers = Array.isArray(product.offers) ? product.offers : product.offers ? [product.offers] : [];
  for (const offer of offers) {
    const record = asRecord(offer);
    if (!record) continue;
    const price = normalizePrice(ldText(record.price || record.lowPrice || record.highPrice));
    if (price) return price;
    const spec = asRecord(record.priceSpecification);
    const specPrice = spec ? normalizePrice(ldText(spec.price)) : "";
    if (specPrice) return specPrice;
  }
  return normalizePrice(ldText(product.price));
}

function reviewFromJsonLd(product: Record<string, unknown> | null): string {
  if (!product) return "";
  const reviews = Array.isArray(product.review) ? product.review : product.review ? [product.review] : [];
  for (const review of reviews) {
    const record = asRecord(review);
    const text = record ? ldText(record.reviewBody || record.description || record.name) : ldText(review);
    if (text.length >= 12 && text.length <= 220 && !isNoise(text)) return text;
  }
  return "";
}

function imageFromJsonLd(product: Record<string, unknown> | null, baseUrl?: string): string {
  if (!product) return "";
  return normalizeAbsoluteUrl(ldText(product.image), baseUrl);
}

function reviewFromHtml(html: string): string {
  for (const match of html.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
    const text = stripTags(match[1]).replace(/\s+/g, " ").trim();
    if (text.length >= 20 && text.length <= 220 && !isNoise(text)) return text;
  }
  return "";
}

/** Extract product metadata for custom product links. Values are source-backed and may be blank. */
export function extractProductPageDetails(html: string, pageUrl?: string): ProductPageDetails {
  const src = String(html || "");
  const product = productJsonLd(src);
  const name =
    cleanProductName(ldText(product?.name)) ||
    cleanProductName(metaContent(src, "og:title")) ||
    cleanProductName(metaContent(src, "twitter:title")) ||
    cleanProductName(htmlAttr(src, /<title[^>]*>([\s\S]*?)<\/title>/i)) ||
    cleanProductName(htmlAttr(src, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
  const price =
    priceFromJsonLd(product) ||
    normalizePrice(metaContent(src, "product:price:amount")) ||
    normalizePrice(metaContent(src, "og:price:amount")) ||
    normalizePrice(htmlAttr(src, /(?:sale|regular)?\s*price[^<]{0,40}([\$💲]?\s*\d{1,4}(?:[.,]\d{2})?)/i));
  const image =
    imageFromJsonLd(product, pageUrl) ||
    normalizeAbsoluteUrl(metaContent(src, "og:image") || metaContent(src, "twitter:image"), pageUrl);
  const review = reviewFromJsonLd(product) || reviewFromHtml(src);
  return {
    name,
    price,
    review,
    image,
    highlights: extractPageHighlights(src, 5),
  };
}

const TONE_WORDS = [
  "warm", "friendly", "personal", "helpful", "caring", "calm", "confident", "practical",
  "premium", "luxury", "elegant", "sophisticated", "minimal", "modern", "bold", "playful",
  "energetic", "inviting", "trustworthy", "thoughtful", "comfortable", "romantic", "heritage",
  "crafted", "durable", "breathable", "soft", "effortless", "exclusive", "timeless", "giftable",
];
const TEXT_STOPWORDS = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between", "brand", "brands",
  "cart", "collection", "customer", "customers", "email", "every", "feature", "features", "from",
  "have", "home", "into", "learn", "more", "order", "page", "privacy", "product", "products",
  "return", "returns", "shipping", "shop", "store", "than", "that", "their", "there", "these",
  "this", "with", "your",
]);

function htmlAttr(html: string, pattern: RegExp): string {
  const m = pattern.exec(html);
  return m ? stripTags(m[1] || "") : "";
}

export function extractPageHighlights(html: string, max = 5): string[] {
  const src = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const candidates: string[] = [
    htmlAttr(src, /<title[^>]*>([\s\S]*?)<\/title>/i),
    htmlAttr(src, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i),
    htmlAttr(src, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i),
  ];
  for (const m of src.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) candidates.push(stripTags(m[1]));

  const seen = new Set<string>();
  return candidates
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12 && s.length <= 180 && !isNoise(s))
    .filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

export function extractPageToneKeywords(html: string, max = 8): string[] {
  const highlights = extractPageHighlights(html, 8).join(" ");
  const visible = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20000);
  const text = decodeEntities(`${highlights} ${visible}`).toLowerCase();
  const scores = new Map<string, number>();

  TONE_WORDS.forEach((word) => {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const count = text.match(re)?.length || 0;
    if (count) scores.set(word, count + (highlights.toLowerCase().includes(word) ? 2 : 0));
  });

  if (scores.size < max) {
    const words = text.match(/\b[a-z][a-z-]{5,}\b/g) || [];
    words.forEach((word) => {
      if (TEXT_STOPWORDS.has(word) || NAV.test(word) || /\d/.test(word)) return;
      scores.set(word, (scores.get(word) || 0) + 0.25);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, max);
}
