import type { Brand } from "../config/types";

// Inline markdown → SendGrid-style inline HTML (spans/strong/links), matching the markup of
// real SendGrid Design exports. Body CSS sets arial/16px/#000, so plain runs need no span;
// emphasized and linked runs get an explicit span like SendGrid's editor emits.
//
// Conventions (from CLAUDE.md):
//   [Name](slug:productslug) -> product link  …/{slug}?{{paramurl}}
//   [text](home)             -> homepage link …/?{{paramurl}}
//   ==text==                 -> brand accent + bold
//   **bold** *em* __underline__
// {{paramurl}} is a SendGrid link-tracking merge tag — emitted literally.

const FONT = "arial, helvetica, sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Product/home URL following the real template pattern: path + ?{{paramurl}} (no UTM soup). */
export function buildUrl(brand: Brand, slug: string | null): string {
  const path = slug ? slug : "";
  return `https://${brand.domain}/${path}?{{paramurl}}`;
}

function accentSpan(text: string, accent: string): string {
  return `<span style="font-family: ${FONT}; font-size: 16px; color: ${accent}"><strong>${text}</strong></span>`;
}

/** Convert inline markdown to SendGrid-style inline HTML. */
export function parseInlineMarkdown(input: string, brand: Brand, accent: string): string {
  let s = escapeHtml(input);

  // [Name](slug:productslug) -> product link
  s = s.replace(
    /\[([^\]]+)\]\(slug:([a-z0-9_-]+)\)/g,
    (_m, label, slug) => `<a href="${buildUrl(brand, slug)}">${accentSpan(label, accent)}</a>`
  );
  // [text](home) -> homepage link
  s = s.replace(
    /\[([^\]]+)\]\(home\)/g,
    (_m, label) => `<a href="${buildUrl(brand, null)}">${accentSpan(label, accent)}</a>`
  );
  // ==text== -> accent + bold
  s = s.replace(/==([^=]+)==/g, (_m, t) => accentSpan(t, accent));
  // **bold**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // __underline__
  s = s.replace(/__([^_]+)__/g, "<u>$1</u>");
  // *em* (after ** so it doesn't eat bold markers)
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

/**
 * Split a copy block into SendGrid text-module markup:
 * <div>{<div>paragraph</div>…}<div></div></div>
 */
// Defensive scannability split: break a long paragraph (no intentional line breaks) into
// ~2-sentence chunks of ≤ ~220 chars, so the email never renders a wall of text — even if the
// model returns one long run-on paragraph. Paragraphs with single \n (e.g. sign-offs) or short
// paragraphs are left untouched.
function splitForScannability(p: string, max = 260, target = 200): string[] {
  if (p.length <= max || p.includes("\n")) return [p];
  const sentences = p.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > target) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function paragraphsToHtml(
  text: string,
  brand: Brand,
  accent: string,
  align: "left" | "center" = "left"
): string {
  const divs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitForScannability(p))
    .map((p) => {
      // Single newlines within a paragraph become <br> (e.g. a multi-line sign-off).
      const inner = parseInlineMarkdown(p, brand, accent).replace(/\n/g, "<br>");
      return `<div style="font-family: inherit; text-align: ${align}">${inner}</div>`;
    })
    .join("\n");
  return `<div>${divs}<div></div></div>`;
}
