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
