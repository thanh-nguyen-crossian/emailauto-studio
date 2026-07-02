export type PreviewGotchaSeverity = "block" | "warn" | "info";

export interface PreviewGotcha {
  severity: PreviewGotchaSeverity;
  message: string;
}

const DARK_PREVIEW_STYLE = `
<style data-emailauto-dark-preview>
  html, body { background: #111827 !important; color: #f8fafc !important; }
  body, table, td, p, div, span, h1, h2, h3, a { color: #f8fafc !important; }
  table, td { background-color: #111827 !important; }
  [style*="background:#fff"], [style*="background: #fff"],
  [style*="background-color:#fff"], [style*="background-color: #fff"] {
    background-color: #172033 !important;
  }
  a { color: #93c5fd !important; }
</style>`;

function textOnly(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlByteSize(html: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(html).length : html.length;
}

function hasNonEmptyAlt(tag: string): boolean {
  const match = tag.match(/\salt\s*=\s*(["'])(.*?)\1/i);
  return Boolean(match?.[2]?.trim());
}

export function analyzePreviewGotchas(html: string): PreviewGotcha[] {
  const gotchas: PreviewGotcha[] = [];
  const bytes = htmlByteSize(html);
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const linkTags = html.match(/<a\b[^>]*href\s*=/gi) || [];
  const missingAlt = imgTags.filter((tag) => !hasNonEmptyAlt(tag)).length;
  const imageOnlyLinks = (html.match(/<a\b[\s\S]*?<\/a>/gi) || []).filter((anchor) => /<img\b/i.test(anchor) && !textOnly(anchor)).length;

  if (bytes > 102 * 1024) {
    gotchas.push({ severity: "block", message: `HTML is ${Math.round(bytes / 1024)}KB; Gmail can clip above 102KB.` });
  } else if (bytes > 90 * 1024) {
    gotchas.push({ severity: "warn", message: `HTML is ${Math.round(bytes / 1024)}KB; close to Gmail's clipping zone.` });
  }
  if (!/<html\b[^>]*\slang\s*=/i.test(html)) {
    gotchas.push({ severity: "warn", message: "Missing html lang attribute." });
  }
  if (missingAlt > 0) {
    gotchas.push({ severity: "warn", message: `${missingAlt} image${missingAlt === 1 ? "" : "s"} missing alt text.` });
  }
  if (imageOnlyLinks > 0) {
    gotchas.push({ severity: "info", message: `${imageOnlyLinks} linked image${imageOnlyLinks === 1 ? "" : "s"} should carry descriptive alt text.` });
  }
  if (linkTags.length > 22) {
    gotchas.push({ severity: "info", message: `${linkTags.length} links found; keep the click path focused.` });
  }
  if (/<img\b[^>]*(?:src|background)\s*=\s*(["'])http:\/\//i.test(html)) {
    gotchas.push({ severity: "warn", message: "At least one image uses http instead of https." });
  }
  if (textOnly(html).length < 250 && imgTags.length >= 4) {
    gotchas.push({ severity: "warn", message: "Low text-to-image balance; preview carefully in inbox clients." });
  }
  return gotchas;
}

export function withDarkPreviewStyles(html: string): string {
  if (/<style\s+data-emailauto-dark-preview/i.test(html)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${DARK_PREVIEW_STYLE}</head>`);
  return `${DARK_PREVIEW_STYLE}${html}`;
}
