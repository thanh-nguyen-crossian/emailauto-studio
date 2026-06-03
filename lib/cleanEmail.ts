// Port of the team's "Email Tools" Google Apps Script. Cleans/optimizes the studio's
// SendGrid-format HTML and runs QA before it becomes a Dynamic Template — so the manual
// export → Google Doc → script → re-import loop is no longer needed.

export interface CleanResult {
  html: string;
  blocking: string[];
  warnings: string[];
  info: string[];
  originalBytes: number;
  cleanedBytes: number;
}

const GMAIL_CLIP = 102 * 1024;
const SAFE_TARGET = 80 * 1024;

const DARK_MODE_BLOCK = `
<style type="text/css">
@media (prefers-color-scheme: dark) {
  body,
  .wrapper,
  .email-container,
  .body-cell {
    background-color: #121212 !important;
    color: #e8e8e8 !important;
  }
  .email-header,
  .email-footer { background-color: #1e1e1e !important; }
  a { color: #8ab4f8 !important; }
  img.logo,
  img[class*="logo"],
  img[class*="icon"] { filter: none !important; }
}
</style>
`;

function stripTags(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, "");
}
function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ").replace(/&zwnj;/gi, "").replace(/&mdash;/gi, "-")
    .replace(/&ndash;/gi, "-").replace(/&copy;/gi, "(c)").replace(/&reg;/gi, "(r)")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}
function unique(arr: string[]): string[] {
  const seen: Record<string, boolean> = {};
  return arr.filter((x) => {
    const k = x.toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}
function fmt(b: number): string {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}
function ensureMeta(html: string, test: RegExp, tag: string): string {
  if (test.test(html)) return html;
  return html.replace(/(<head[^>]*>)/i, `$1\n  ${tag}`);
}
/** Strip HTML comments but preserve Outlook MSO conditionals. */
function stripCommentsPreserveMso(html: string): string {
  return html.replace(/<!--([\s\S]*?)-->/g, (full, inner) =>
    /\[if/i.test(inner) || /\[endif\]/i.test(inner) || /<!\[endif\]/i.test(full) ? full : ""
  );
}

const CSS_JUNK =
  /inherit|initial|border-image-|font-variant-|font-optical-sizing|font-kerning|font-feature-settings|font-variation-settings|white-space-collapse|text-wrap-mode|-webkit-text-stroke-width|text-decoration-thickness|text-decoration-style|text-decoration-color|orphans|widows|word-spacing|letter-spacing:\s*normal|box-sizing:\s*border-box|float:\s*none|font-language-override/i;

export function cleanForTemplate(input: string): CleanResult {
  let text = input;
  const blocking: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const originalBytes = Buffer.byteLength(input, "utf8");
  let trackingPixelCount = 0;
  let extractedContent = "";

  // STEP 2 — preheader extraction (Mailchimp/SendGrid module-content block)
  const extractRegex = /<tr>\s*<td role="module-content">\s*<p>([\s\S]*?)<\/p>\s*<\/td>\s*<\/tr>/i;
  const em = text.match(extractRegex);
  if (em && em[1]) {
    extractedContent = decodeEntities(stripTags(em[1])).trim();
    text = text.replace(extractRegex, "");
  }

  // STEP 3 — click-tracking off
  text = text.replace(/<a\b(?![^>]*\bclicktracking=)([^>]*?)\bhref=/gi, "<a$1clicktracking=off href=");

  // STEP 4 — head meta block
  text = ensureMeta(text, /http-equiv=["']Content-Type["']/i, '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">');
  text = ensureMeta(text, /name=["']viewport["']/i, '<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  text = ensureMeta(text, /name=["']x-apple-disable-message-reformatting["']/i, '<meta name="x-apple-disable-message-reformatting">');
  text = ensureMeta(text, /name=["']color-scheme["']/i, '<meta name="color-scheme" content="light dark">');
  text = ensureMeta(text, /name=["']supported-color-schemes["']/i, '<meta name="supported-color-schemes" content="light dark">');
  if (!/<title\b[^>]*>/i.test(text)) text = text.replace(/(<head[^>]*>)/i, "$1\n  <title>Email</title>");

  // STEP 5 — CSS bloat removal
  text = text.replace(/style="([^"]+)"/gi, (_, styles: string) => {
    const cleaned = styles.split(";").map((s) => s.trim()).filter((s) => s && !CSS_JUNK.test(s)).join("; ");
    return cleaned ? `style="${cleaned};"` : "";
  });

  // STEP 6 — empty div/span removal (skip td: spacer cells are structural)
  for (let i = 0; i < 3; i++) text = text.replace(/<(div|span)[^>]*>\s*<\/\1>/gi, "");

  // STEP 7 — strip builder metadata, module roles, comments (preserve MSO)
  text = text.replace(
    /\sdata-(muid|mc-[a-z-]+|type|proportionally-constrained|responsive|distribution|body-style|link-color|editor-version|editor|preview|test|tracking|builder)="[^"]*"/gi,
    ""
  );
  text = text.replace(/\srole="(module|module-content|modules-container|content-container)"/gi, "");
  text = stripCommentsPreserveMso(text);

  // STEP 8a — language
  text = text.replace(/<html([^>]*)>/i, (m, attrs: string) =>
    attrs.toLowerCase().includes("lang=") ? m : `<html lang="en"${attrs}>`
  );

  // STEP 8b — role="presentation" on layout tables
  text = text.replace(/<table(?![^>]*\brole=)(?![^>]*\bscope=)([^>]*)>/gi, '<table role="presentation"$1>');

  // STEP 8c — unsubscribe detection
  const hasUnsub =
    /<a\b[^>]*href=["'][^"']*(unsubscribe|optout|opt-out|preferences|manage-subscription)[^"']*["'][^>]*>/i.test(text) ||
    /List-Unsubscribe/i.test(text);
  if (!hasUnsub) blocking.push("No unsubscribe link detected. Required by CAN-SPAM and GDPR.");
  const unsubIndex = text.search(/unsubscribe|optout|opt-out|manage-subscription/i);
  if (unsubIndex > 90000) warnings.push(`Unsubscribe link appears very late (byte offset ${unsubIndex}). Gmail may hide it if clipped.`);

  // STEP 9 — image fixes
  text = text.replace(/<img([^>]*)>/gi, (_, attrs: string) => {
    let a = attrs;
    if (/width=["']?1["']?/i.test(a) && /height=["']?1["']?/i.test(a)) {
      trackingPixelCount++;
      return `<img${a}>`;
    }
    if (!/\balt=["'][\s\S]*?["']/i.test(a)) a += ' alt="" aria-hidden="true"';
    if (!/\bborder=/i.test(a)) a += ' border="0"';
    if (/style="/i.test(a)) {
      if (!/display:\s*block/i.test(a)) a = a.replace(/style="/i, 'style="display:block; ');
    } else a += ' style="display:block;"';
    return `<img${a}>`;
  });
  if (trackingPixelCount > 0) info.push(`${trackingPixelCount} tracking pixel(s) detected and kept.`);

  // STEP 10 — dark mode CSS
  if (!/@media\s*\(prefers-color-scheme:\s*dark\)/i.test(text)) {
    text = text.replace(/(<\/head>)/i, DARK_MODE_BLOCK + "$1");
  }

  // STEP 11 — safe minification
  text = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join("\n");

  // STEP 12 — preheader handling (re-add as a hidden span if absent)
  const existing = text.match(/<span[^>]*class=["'][^"']*preheader[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  let preheaderText = extractedContent;
  if (!preheaderText && existing && existing[1]) {
    preheaderText = decodeEntities(stripTags(existing[1])).replace(/‌/g, "").replace(/\s+/g, " ").trim();
  }
  if (!existing) {
    preheaderText = preheaderText || "REPLACE THIS PREHEADER TEXT";
    let padding = "";
    for (let p = 0; p < 80; p++) padding += "&zwnj;&nbsp;&zwnj;&nbsp;";
    const span = `<span class="preheader" style="color:transparent;display:none;height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;visibility:hidden;width:0;">${escapeHtml(preheaderText)}${padding}</span>`;
    text = text.replace(/(<body[^>]*>)/i, `$1\n${span}`);
  }
  if (/REPLACE THIS PREHEADER TEXT/i.test(text)) {
    blocking.push("Preheader placeholder detected. Replace with real copy before sending.");
  } else if (preheaderText) {
    if (preheaderText.length < 35) warnings.push(`Preheader is short (${preheaderText.length} chars). Aim for 40-100.`);
    else if (preheaderText.length > 140) warnings.push(`Preheader is long (${preheaderText.length} chars). Some inboxes truncate it.`);
  }

  // STEP 13 — global link formatter (?utm_term=…&{{paramurl}})
  text = text.replace(
    /href=["'](https:\/\/[a-z0-9\-.]*(bragoddess|gentslux|luxfitting|santafare)\.com)([^"']*)["']/gi,
    (_m, domain: string, _brand: string, path: string) => {
      let cleanPath = path.split("?")[0];
      if (!cleanPath) cleanPath = "/";
      let utmTerm = "home";
      if (cleanPath === "/" || cleanPath === "") {
        utmTerm = "home";
        cleanPath = "/";
      } else if (cleanPath === "/static/privacy" || cleanPath === "/static/privacy/") {
        utmTerm = "privacy";
      } else if (cleanPath === "/static/exchanges-returns" || cleanPath === "/static/exchanges-returns/") {
        utmTerm = "exchanges_returns";
      } else {
        const segs = cleanPath.split("/").filter(Boolean);
        utmTerm = segs.length > 0 ? segs[0] : "product";
      }
      return `href="${domain}${cleanPath}?utm_term=${utmTerm}&{{paramurl}}"`;
    }
  );

  // STEP 14 — CTA quality checks
  const ctaRegex = /<a\b[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
  let ctaCount = 0;
  const weak: string[] = [];
  let cr: RegExpExecArray | null;
  while ((cr = ctaRegex.exec(text)) !== null) {
    const label = decodeEntities(stripTags(cr[1] || "")).replace(/\s+/g, " ").trim();
    if (label) {
      ctaCount++;
      if (/^(click here|learn more|read more|here|more)$/i.test(label)) weak.push(label);
    }
  }
  if (ctaCount === 0) blocking.push("No CTA links detected. Add at least one call-to-action.");
  if (weak.length) warnings.push(`Weak CTA text: "${unique(weak).join('", "')}". Use specific action text.`);

  // STEP 15 — final size check
  const cleanedBytes = Buffer.byteLength(text, "utf8");
  if (cleanedBytes > GMAIL_CLIP) blocking.push(`HTML is ${fmt(cleanedBytes)}, over Gmail's 102 KB clip limit.`);
  else if (cleanedBytes > SAFE_TARGET) warnings.push(`HTML is ${fmt(cleanedBytes)} (over 80 KB). ESP tags may push it past Gmail's clip limit.`);
  info.push("Verify SPF, DKIM, and DMARC in your ESP before sending.");

  return { html: text, blocking, warnings, info, originalBytes, cleanedBytes };
}
