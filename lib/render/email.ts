import type { Brand, Campaign, ImageOverrides, Product, VariantCopy } from "../config/types";
import { buildUrl, paragraphsToHtml, parseInlineMarkdown } from "./markdown";

// Renders a real SendGrid **Design** (module format) so the exported HTML round-trips into
// SendGrid's editor and renders identically to the team's existing templates. Structure mirrors
// the extracted Source/WinEmailTemps exports: role="module" data-type="columns|image|text",
// data-distribution, class="column column-N", widths 564 (full) / 528 (text) / 282 (2-up), and
// …/{slug}?{{paramurl}} links. No bulletproof button (real templates link the images + inline
// text) and no dark-mode block (real templates are light) — so export == a SendGrid design.

export const PLACEHOLDER_HOST = "placehold.co";
function ph(w: number, h: number, label: string): string {
  return `https://placehold.co/${w}x${h}/eeeeee/999999?text=${encodeURIComponent(label)}`;
}
export function isPlaceholderImage(url: string): boolean {
  return !url || url.includes(PLACEHOLDER_HOST) || url.toUpperCase().includes("PLACEHOLDER");
}

// Escape a (user-pasted) URL for safe use inside an HTML attribute — prevents attribute breakout.
function attr(url: string): string {
  return String(url || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface RenderOptions {
  /** Render a logo image block above the hero (off by default — not all emails have one). */
  includeLogo?: boolean;
}

// ---- module-id generator (data-muid); counter-based, deterministic per render ----
function muidFactory() {
  let n = 0;
  return () => `auto-${++n}`;
}

// ---- image module (inner <table data-type="image">) ----
function imageModule(
  muid: string,
  href: string,
  src: string,
  alt: string,
  widthAttr: number,
  bottomPad: number,
  fullWidth = true
): string {
  const imgStyle = fullWidth
    ? "display:block; color:#000000; text-decoration:none; font-family:Helvetica, arial, sans-serif; font-size:16px; max-width:100% !important; width:100%; height:auto !important;"
    : "display:block; color:#000000; text-decoration:none; font-family:Helvetica, arial, sans-serif; font-size:16px; max-width:100% !important; height:auto !important;";
  return `<table class="wrapper" role="module" data-type="image" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;" data-muid="${muid}">
  <tbody><tr><td style="font-size:6px; line-height:10px; padding:0px 0px ${bottomPad}px 0px;" valign="top" align="center">
    <a href="${href}"><img class="max-width" border="0" style="${imgStyle}" width="${widthAttr}" alt="${alt}" data-proportionally-constrained="true" data-responsive="true" src="${src}"></a>
  </td></tr></tbody>
</table>`;
}

// ---- text module (inner <table data-type="text">) ----
function textModule(muid: string, contentHtml: string, lineHeight = 24, innerPad = "0px 0px 0px 0px"): string {
  return `<table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;" data-muid="${muid}" data-mc-module-version="2019-10-22">
  <tbody><tr><td style="padding:${innerPad}; line-height:${lineHeight}px; text-align:inherit; background-color:#FFFFFF;" height="100%" valign="top" bgcolor="#FFFFFF" role="module-content">${contentHtml}</td></tr></tbody>
</table>`;
}

// ---- single-column wrapper (data-distribution="1") ----
function columnsSingle(inner: string, blockPad: string, colWidth: number, colMargin: string): string {
  return `<table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" role="module" data-type="columns" style="padding:${blockPad};" bgcolor="" data-distribution="1">
  <tbody><tr role="module-content"><td height="100%" valign="top">
    <table width="${colWidth}" style="width:${colWidth}px; border-spacing:0; border-collapse:collapse; margin:${colMargin};" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-0">
      <tbody><tr><td style="padding:0px;margin:0px;border-spacing:0;">${inner}</td></tr></tbody>
    </table>
  </td></tr></tbody>
</table>`;
}

// ---- two-column wrapper (data-distribution="1,1"), two 282 cells ----
function columnsTwo(left: string, right: string): string {
  return `<table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" role="module" data-type="columns" style="padding:0px 9px 18px 9px;" bgcolor="" data-distribution="1,1">
  <tbody><tr role="module-content"><td height="100%" valign="top">
    <table width="282" style="width:282px; border-spacing:0; border-collapse:collapse; margin:0px 9px 0px 0px;" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-0">
      <tbody><tr><td style="padding:0px;margin:0px;border-spacing:0;">${left}</td></tr></tbody>
    </table>
    <table width="282" style="width:282px; border-spacing:0; border-collapse:collapse; margin:0px 0px 0px 9px;" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-1">
      <tbody><tr><td style="padding:0px;margin:0px;border-spacing:0;">${right}</td></tr></tbody>
    </table>
  </td></tr></tbody>
</table>`;
}

// ---- block builders ----
function preheaderBlock(text: string): string {
  return `<table class="module preheader preheader-hide" role="module" data-type="preheader" border="0" cellpadding="0" cellspacing="0" width="100%" style="display: none !important; mso-hide: all; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0;">
  <tbody><tr><td role="module-content"><p>${text}</p></td></tr></tbody>
</table>`;
}

function logoBlock(brand: Brand, images: ImageOverrides, muid: () => string): string {
  const src = attr(images.logo || ph(160, 48, `${brand.name} logo`));
  return columnsSingle(
    imageModule(muid(), buildUrl(brand, null), src, brand.name, 160, 0, false),
    "18px 9px 6px 9px",
    564,
    "0px 9px 0px 9px"
  );
}

function heroBlock(brand: Brand, images: ImageOverrides, muid: () => string): string {
  const src = attr(images.hero || ph(564, 280, "Hero banner"));
  return columnsSingle(
    imageModule(muid(), buildUrl(brand, null), src, `${brand.name} offer`, 564, 0, true),
    "0px 9px 18px 9px",
    564,
    "0px 9px 0px 9px"
  );
}

function textBlock(text: string, brand: Brand, accent: string, muid: () => string, align: "left" | "center" = "left"): string {
  return columnsSingle(
    textModule(muid(), paragraphsToHtml(text, brand, accent, align)),
    "0px 18px 18px 18px",
    528,
    "0px 18px 0px 18px"
  );
}

function productImageInner(brand: Brand, product: Product, images: ImageOverrides, muid: () => string): string {
  const src = attr(images.products?.[product.slug] || ph(265, 265, product.name));
  return imageModule(muid(), buildUrl(brand, product.slug), src, product.name, 282, 18, true);
}

/** A 2-up product image row (or a single full-width image for an odd leftover). */
function productRow(brand: Brand, pair: Product[], images: ImageOverrides, muid: () => string): string {
  if (pair.length === 2) {
    return columnsTwo(productImageInner(brand, pair[0], images, muid), productImageInner(brand, pair[1], images, muid));
  }
  const p = pair[0];
  const src = attr(images.products?.[p.slug] || ph(564, 280, p.name));
  return columnsSingle(
    imageModule(muid(), buildUrl(brand, p.slug), src, p.name, 564, 0, true),
    "0px 9px 18px 9px",
    564,
    "0px 9px 0px 9px"
  );
}

function footerBlock(brand: Brand, campaign: Campaign, muid: () => string): string {
  const year = (campaign.sendDate || "2026").slice(0, 4);
  const home = buildUrl(brand, null);
  const privacy = `https://${brand.domain}/static/privacy?{{paramurl}}`;
  const returns = `https://${brand.domain}/static/exchanges-returns?{{paramurl}}`;
  const sm = (t: string) =>
    `<span style="font-family: arial, helvetica, sans-serif; font-size: 12px; color:#000000">${t}</span>`;
  const content = `<div>
<div style="font-family: inherit; text-align: center">${sm(`Thanks for shopping at ${brand.name}`)}</div>
<div style="font-family: inherit; text-align: center">${sm("You're part of the family! We hope you love your {{product_label}} from {{purchase_date}} (#{{code}}).")}</div>
<div style="font-family: inherit; text-align: center">${sm("Want exclusive deals &amp; comfort tips? We'd love to keep in touch — but if you'd rather not, you can ")}<a href="{{unsubscribe}}">${sm("opt out here")}</a>${sm(".")}</div>
<div style="font-family: inherit; text-align: center">${sm(`Reply with questions — ${brand.persona} or our experts are ready to help.`)}</div>
<div style="font-family: inherit; text-align: center"><a href="${home}">${sm(`${brand.name}.com`)}</a></div>
<div style="font-family: inherit; text-align: center">${sm(`© ${year} ${brand.name} | `)}<a href="${privacy}">${sm("Privacy Policy")}</a>${sm(" | ")}<a href="${returns}">${sm("Exchanges &amp; Returns")}</a></div>
<div></div></div>`;
  return columnsSingle(
    textModule(muid(), content, 20, "0px 9px 0px 9px"),
    "9px 0px 0px 0px",
    564,
    "0px 18px 0px 18px"
  );
}

// ---- head + body scaffold (verbatim SendGrid Design shell) ----
function htmlShell(modules: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html data-editor-version="2" class="sg-campaigns" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1">
    <!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=Edge"><!--<![endif]-->
    <!--[if (gte mso 9)|(IE)]>
    <xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
    <![endif]-->
    <!--[if (gte mso 9)|(IE)]>
  <style type="text/css">
    body {width: 600px;margin: 0 auto;}
    table {border-collapse: collapse;}
    table, td {mso-table-lspace: 0pt;mso-table-rspace: 0pt;}
    img {-ms-interpolation-mode: bicubic;}
  </style>
<![endif]-->
    <style type="text/css">
    body, p, div { font-family: arial,helvetica,sans-serif; font-size: 16px; }
    body { color: #000000; }
    body a { color: #606060; text-decoration: none; }
    p { margin: 0; padding: 0; }
    table.wrapper { width:100% !important; table-layout: fixed; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; -moz-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img.max-width { max-width: 100% !important; }
    .column.of-2 { width: 50%; }
    .column.of-3 { width: 33.333%; }
    .column.of-4 { width: 25%; }
    @media screen and (max-width:480px) {
      .preheader .rightColumnContent, .footer .rightColumnContent { text-align: left !important; }
      table.wrapper-mobile { width: 100% !important; table-layout: fixed; }
      img.max-width { height: auto !important; max-width: 100% !important; }
      a.bulletproof-button { display: block !important; width: auto !important; font-size: 80%; padding-left: 0 !important; padding-right: 0 !important; }
      .columns { width: 100% !important; }
      .column { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; margin-left: 0 !important; margin-right: 0 !important; }
      .social-icon-column { display: inline-block !important; }
    }
  </style>
    <!--user entered Head Start--><!--End Head user entered-->
  </head>
  <body>
    <center class="wrapper" data-link-color="#606060" data-body-style="font-size:16px; font-family:arial,helvetica,sans-serif; color:#000000; background-color:#FFFFFF;">
      <div class="webkit">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" class="wrapper" bgcolor="#FFFFFF">
          <tr><td valign="top" bgcolor="#FFFFFF" width="100%">
            <table width="100%" role="content-container" class="outer" align="center" cellpadding="0" cellspacing="0" border="0">
              <tr><td width="100%">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td>
                    <!--[if mso]><center><table><tr><td width="600"><![endif]-->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;" align="center">
                      <tr><td role="modules-container" style="padding:0px 0px 0px 0px; color:#000000; text-align:left;" bgcolor="#FFFFFF" width="100%" align="left">
${modules}
                      </td></tr>
                    </table>
                    <!--[if mso]></td></tr></table></center><![endif]-->
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </div>
    </center>
  </body>
</html>`;
}

function toPairs(products: Product[]): Product[][] {
  const pairs: Product[][] = [];
  for (let i = 0; i < products.length; i += 2) pairs.push(products.slice(i, i + 2));
  return pairs;
}

/** Render a full SendGrid-format email for one variant. */
export function renderEmailHTML(
  brand: Brand,
  campaign: Campaign,
  products: Product[],
  copy: VariantCopy,
  images: ImageOverrides = {},
  options: RenderOptions = {}
): string {
  const accent = copy.accent || brand.accent;
  const layout = campaign.layout || brand.layout;
  const muid = muidFactory();

  // Hero product first.
  const ordered = [...products].sort((a, b) =>
    a.slug === brand.heroSlug ? -1 : b.slug === brand.heroSlug ? 1 : 0
  );
  const pairs = toPairs(ordered);

  const mods: string[] = [];
  mods.push(preheaderBlock(copy.preheader));
  if (options.includeLogo) mods.push(logoBlock(brand, images, muid));
  mods.push(heroBlock(brand, images, muid));
  mods.push(textBlock(copy.intro, brand, accent, muid));

  if (layout === "narrative") {
    // hero → intro → row → middle → row → closing → row(s) → P.S. → footer
    if (pairs[0]) mods.push(productRow(brand, pairs[0], images, muid));
    mods.push(textBlock(copy.middle, brand, accent, muid));
    if (pairs[1]) mods.push(productRow(brand, pairs[1], images, muid));
    if (copy.closing) mods.push(textBlock(copy.closing, brand, accent, muid));
    for (const pair of pairs.slice(2)) mods.push(productRow(brand, pair, images, muid));
    if (copy.ps) {
      // Strip a leading "P.S." the model may already have written, so we don't double it.
      const psBody = copy.ps.replace(/^\s*p\.?\s*s\.?\s*[:.\-]?\s*/i, "");
      mods.push(textBlock(`**P.S.** ${psBody}`, brand, accent, muid, "center"));
    }
  } else {
    // simple: hero → intro → row → row → middle → row(s) → footer
    if (pairs[0]) mods.push(productRow(brand, pairs[0], images, muid));
    if (pairs[1]) mods.push(productRow(brand, pairs[1], images, muid));
    mods.push(textBlock(copy.middle, brand, accent, muid));
    for (const pair of pairs.slice(2)) mods.push(productRow(brand, pair, images, muid));
  }

  mods.push(footerBlock(brand, campaign, muid));

  return htmlShell(mods.join("\n"));
}
