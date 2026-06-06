import type { BodyLayout, Brand, Campaign, EmailModuleKey, ImageOverrides, Product } from "../config/types";
import type { GenBrief, GenProductBlock } from "../briefgen";
import { segJsonKey } from "../briefgen";
import { buildUrl, paragraphsToHtml } from "./markdown";

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

/** Product grid arrangement. stack = 1/row, two = 2/row, three = 3/row, hero_grid = hero full + rest 2/row. */
export type ProductLayout = "stack" | "two" | "three" | "hero_grid";

export interface RenderOptions {
  /** Render a logo image block above the hero (off by default — not all emails have one). */
  includeLogo?: boolean;
  /** Product grid layout (default "stack"). */
  productLayout?: ProductLayout;
  /** Body placement relative to product blocks (default campaign/body continuous). */
  bodyLayout?: BodyLayout;
  /** Drag/drop module flow when bodyLayout is custom. */
  moduleLayout?: EmailModuleKey[];
}

const DEFAULT_MODULE_LAYOUT: EmailModuleKey[] = ["hero", "body_1", "products_1_2", "products_3_4", "products_5_6", "body_2", "body_3"];

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
    <a clicktracking="off" href="${attr(href)}" aria-label="${attr(alt)}"><img class="max-width" border="0" style="${imgStyle}" width="${widthAttr}" alt="${attr(alt)}" data-proportionally-constrained="true" data-responsive="true" src="${src}"></a>
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

// ---- multi-column wrappers (mobile-stacks via the .column rule in the head CSS) ----
/** A row of N equal columns, each `colWidth`px with `gutter`px between. Empty cells pad the row. */
function columnsRow(cells: string[], colWidth: number, gutter: number, blockPad: string): string {
  const dist = cells.map(() => "1").join(",");
  const cols = cells
    .map((inner, i) => {
      const left = i === 0 ? 0 : gutter / 2;
      const right = i === cells.length - 1 ? 0 : gutter / 2;
      return `<table width="${colWidth}" style="width:${colWidth}px; border-spacing:0; border-collapse:collapse; margin:0px ${right}px 0px ${left}px;" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-${i}">
      <tbody><tr><td style="padding:0px;margin:0px;border-spacing:0;">${inner}</td></tr></tbody>
    </table>`;
    })
    .join("\n    ");
  return `<table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" role="module" data-type="columns" style="padding:${blockPad};" bgcolor="" data-distribution="${dist}">
  <tbody><tr role="module-content"><td height="100%" valign="top">
    ${cols}
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
<div style="font-family: inherit; text-align: center">${sm("Want exclusive deals &amp; comfort tips? We'd love to keep in touch — but if you'd rather not, you can ")}<a clicktracking="off" href="{{unsubscribe}}">${sm("opt out here")}</a>${sm(".")}</div>
<div style="font-family: inherit; text-align: center">${sm(`Reply with questions — ${brand.persona} or our experts are ready to help.`)}</div>
<div style="font-family: inherit; text-align: center"><a clicktracking="off" href="${attr(home)}">${sm(`${brand.name}.com`)}</a></div>
<div style="font-family: inherit; text-align: center">${sm(`© ${year} ${brand.name} | `)}<a clicktracking="off" href="${attr(privacy)}">${sm("Privacy Policy")}</a>${sm(" | ")}<a clicktracking="off" href="${attr(returns)}">${sm("Exchanges &amp; Returns")}</a></div>
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

// ---- banner caption (main/sub headline + supplied review, rendered under the hero image) ----
function bannerCaptionBlock(brand: Brand, accent: string, banner: GenBrief["banner"], muid: () => string): string {
  const parts: string[] = [];
  const mainLines = [banner.main_text_1, banner.main_text_2].filter(Boolean) as string[];
  const subLines = [banner.sub_text_1, banner.sub_text_2].filter(Boolean) as string[];
  const reviews = banner.review_texts?.length ? banner.review_texts : banner.review_quote ? [banner.review_quote] : [];
  if (mainLines.length) parts.push(mainLines.map((line) => `==${line.replace(/\n+/g, " ")}==`).join("\n"));
  else if (banner.main_text) parts.push(`==${banner.main_text.replace(/\n+/g, " ")}==`);
  if (subLines.length) parts.push(subLines.join("\n"));
  else if (banner.sub_text) parts.push(banner.sub_text);
  if (banner.trust_booster) parts.push(`**${banner.trust_booster}**`);
  if (banner.emergency) parts.push(`==${banner.emergency}==`);
  reviews.forEach((review) => review && parts.push(`*${review}*`));
  if (!parts.length) return "";
  return textBlock(parts.join("\n\n"), brand, accent, muid, "center");
}

/** A full-width product image block. Text/CTA are expected inside the generated image asset. */
function productBlock(brand: Brand, product: Product | undefined, pb: GenProductBlock, images: ImageOverrides, muid: () => string): string {
  const slug = product?.slug || null;
  const src = attr((slug && images.products?.[slug]) || ph(564, 280, pb.name || product?.name || "Product"));
  const img = imageModule(muid(), buildUrl(brand, slug), src, pb.name || product?.name || "Product", 564, 0, true);
  return columnsSingle(img, "0px 9px 18px 9px", 564, "0px 9px 0px 9px");
}

/** A product image cell for one column of a multi-up row. */
function productCellInner(brand: Brand, product: Product | undefined, pb: GenProductBlock, images: ImageOverrides, muid: () => string, imgW: number): string {
  const slug = product?.slug || null;
  const src = attr((slug && images.products?.[slug]) || ph(imgW, Math.round(imgW * 0.9), pb.name || product?.name || "Product"));
  return imageModule(muid(), buildUrl(brand, slug), src, pb.name || product?.name || "Product", imgW, 0, true);
}

/**
 * Render a full SendGrid-format email for ONE segment of a generated brief.
 * Pulls the segment's subject/preheader + body variant and renders the shared
 * banner + per-product design-brief blocks.
 */
export function renderEmailHTML(
  brand: Brand,
  campaign: Campaign,
  products: Product[],
  brief: GenBrief,
  segment: string,
  images: ImageOverrides = {},
  options: RenderOptions = {}
): string {
  const accent = brand.accent;
  const muid = muidFactory();
  const key = segJsonKey(segment);

  const sl = brief.subject_lines?.[key];
  const preheader = sl?.preheader || "";
  const bodyText = brief.body?.[key] || brief.body?.base || "";
  const bodyLayout = options.bodyLayout || campaign.bodyLayout || "continuous";

  // Product copy blocks come from the brief; pair each to a catalog product by slot order.
  const ordered = [...products].sort((a, b) =>
    a.slug === brand.heroSlug ? -1 : b.slug === brand.heroSlug ? 1 : 0
  );
  const blocks = [...(brief.products || [])].sort((a, b) => (a.slot || 0) - (b.slot || 0));

  const mods: string[] = [];
  mods.push(preheaderBlock(preheader));
  if (options.includeLogo) mods.push(logoBlock(brand, images, muid));

  const bodyParts = bodyText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const bodyChunks = [
    bodyParts.slice(0, 1).join("\n\n"),
    bodyParts.slice(1, 2).join("\n\n"),
    [bodyParts.slice(2).join("\n\n"), brief.ps ? `P.S. ${brief.ps}` : ""].filter(Boolean).join("\n\n"),
  ];
  const pushHero = () => {
    mods.push(heroBlock(brand, images, muid));
    if (brief.banner) {
      const cap = bannerCaptionBlock(brand, accent, brief.banner, muid);
      if (cap) mods.push(cap);
    }
  };
  const pushBody = (index: number) => {
    const text = bodyChunks[index];
    if (text) mods.push(textBlock(text, brand, accent, muid));
  };

  // Product grid — arrangement chosen by the user.
  const layout = options.productLayout || "stack";
  const cell = (idx: number, imgW: number) =>
    idx < blocks.length ? productCellInner(brand, ordered[idx], blocks[idx], images, muid, imgW) : "";
  const pushGridRows = (start: number, perRow: number, colW: number, imgW: number, gutter: number) => {
    for (let i = start; i < blocks.length; i += perRow) {
      const cells = Array.from({ length: perRow }, (_, j) => cell(i + j, imgW));
      mods.push(columnsRow(cells, colW, gutter, "0px 9px 18px 9px"));
    }
  };
  const pushProductRange = (start: number, end: number) => {
    const available = blocks.slice(start, Math.min(end, blocks.length));
    if (!available.length) return;
    if (available.length === 1) {
      mods.push(productBlock(brand, ordered[start], available[0], images, muid));
      return;
    }
    const cells = available.map((_pb, j) => cell(start + j, 282));
    mods.push(columnsRow(cells, 282, 18, "0px 9px 18px 9px"));
  };

  if (bodyLayout === "custom") {
    const sequence = options.moduleLayout?.length ? options.moduleLayout : campaign.moduleLayout?.length ? campaign.moduleLayout : DEFAULT_MODULE_LAYOUT;
    sequence.forEach((key) => {
      if (key === "hero") pushHero();
      else if (key === "body_1") pushBody(0);
      else if (key === "body_2") pushBody(1);
      else if (key === "body_3") pushBody(2);
      else if (key === "products_1_2") pushProductRange(0, 2);
      else if (key === "products_3_4") pushProductRange(2, 4);
      else if (key === "products_5_6") pushProductRange(4, 6);
    });
  } else {
    pushHero();
    const beforeProducts = bodyLayout === "interspersed" ? bodyParts.slice(0, 1).join("\n\n") : bodyText;
    const afterProducts = bodyLayout === "interspersed" ? bodyParts.slice(1).join("\n\n") : "";
    if (beforeProducts) mods.push(textBlock(beforeProducts, brand, accent, muid));
    if (layout === "two") {
      pushGridRows(0, 2, 282, 282, 18);
    } else if (layout === "three") {
      pushGridRows(0, 3, 176, 176, 12);
    } else if (layout === "hero_grid") {
      if (blocks[0]) mods.push(productBlock(brand, ordered[0], blocks[0], images, muid));
      pushGridRows(1, 2, 282, 282, 18);
    } else {
      blocks.forEach((pb, i) => mods.push(productBlock(brand, ordered[i], pb, images, muid)));
    }
    const psText = brief.ps ? `P.S. ${brief.ps}` : "";
    const closingText = [afterProducts, psText].filter(Boolean).join("\n\n");
    if (closingText) mods.push(textBlock(closingText, brand, accent, muid));
  }

  mods.push(footerBlock(brand, campaign, muid));

  return htmlShell(mods.join("\n"));
}
