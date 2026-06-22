"use client";

// Excel export of the generated brief(s), mirroring email-brief-generator's exportToExcel —
// but as SpreadsheetML 2003 (hand-written XML, zero dependencies). One worksheet per option
// (A/B), label/value rows in 2-up pairs, fixed column widths, wrapped multiline cells.
// Opens natively in Excel and Google Sheets.

import type { GenBrief } from "./briefgen";
import type { CampaignOps } from "./config/types";
import { toDeliverableBrief } from "./present/cleanBrief";

type Row = (string | null)[];

function opsToText(ops?: CampaignOps): string {
  if (!ops) return "";
  return [
    `Provider: ${ops.provider || "sendgrid"}`,
    [ops.senderName, ops.senderEmail].filter(Boolean).length
      ? `Sender: ${[ops.senderName, ops.senderEmail].filter(Boolean).join(" / ")}`
      : "",
    ops.replyTo ? `Reply-to: ${ops.replyTo}` : "",
    ops.audienceSource ? `Audience source: ${ops.audienceSource}` : "",
    ops.segmentRule ? `Segment rule: ${ops.segmentRule}` : "",
    `Consent: ${ops.consentBasis || "prior_purchase_or_opt_in"}${ops.doubleOptIn ? " + double opt-in" : ""}`,
    ops.suppressionNotes ? `Suppression: ${ops.suppressionNotes}` : "",
    ops.scheduleWindow ? `Schedule: ${ops.scheduleWindow}` : "",
    `Tracking: opens ${ops.trackOpens === false ? "off" : "on"}, clicks ${ops.trackClicks === false ? "off" : "on"}`,
    ops.utmPlan ? `UTM: ${ops.utmPlan}` : "",
    ops.publicArchive ? "Public archive: on" : "",
    ops.complianceNotes ? `Compliance: ${ops.complianceNotes}` : "",
  ].filter(Boolean).join("\n");
}

function briefToRows(rawBrief: GenBrief, ops?: CampaignOps): Row[] {
  const brief = toDeliverableBrief(rawBrief);
  const rows: Row[] = [];
  const addRow = (col2?: string | null, col3?: string | null, col4?: string | null, col5?: string | null) =>
    rows.push([null, col2 || null, col3 || null, col4 || null, col5 || null]);
  const spacer = () => rows.push([null, null, null, null, null]);

  spacer();

  const opsText = opsToText(ops);
  if (opsText) {
    addRow("Send ops", opsText);
    spacer();
  }

  // Subject lines + preheaders — paired 2-per-row
  const segs = Object.entries(brief.subject_lines || {});
  const segCode = (k: string) => k.replace("seg_", "").replace("_", "-");
  const subjectValue = (v: (typeof segs)[number][1] | undefined) =>
    [
      v?.subject || "",
      ...(v?.options || []).map((o, i) => `Option ${i + 1}: ${o.subject}`),
    ]
      .filter(Boolean)
      .join("\n");
  const preheaderValue = (v: (typeof segs)[number][1] | undefined) =>
    [
      v?.preheader || "",
      ...(v?.options || []).map((o, i) => `Option ${i + 1}: ${o.preheader}${o.shared_thread ? `\nThread: ${o.shared_thread}` : ""}`),
    ]
      .filter(Boolean)
      .join("\n");
  const bodyOptionsValue = () =>
    Object.entries(brief.body_options || {})
      .map(([key, options]) =>
        [
          (key === "base" ? "Base" : "SEG " + segCode(key).toUpperCase()) + " options",
          ...(options || []).map((o, i) =>
            [
              `Option ${o.label || i + 1}`,
              o.body ? `Body: ${o.body}` : "",
              o.ps ? `P.S.: ${o.ps}` : "",
              o.placement_note ? `Placement: ${o.placement_note}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          ),
        ]
          .filter(Boolean)
          .join("\n")
      )
      .filter(Boolean)
      .join("\n\n");
  const bannerOptionsValue = (b: GenBrief["banner"]) =>
    (b.options || [])
      .map((o, i) =>
        [
          `Option ${o.label || i + 1}`,
          "Main text 1: " + (o.main_text_1 || ""),
          "Main text 2: " + (o.main_text_2 || ""),
          "Main text 3: " + (o.main_text_3 || ""),
          "Sub text 1: " + (o.sub_text_1 || ""),
          "Sub text 2: " + (o.sub_text_2 || ""),
          "Sub text 3: " + (o.sub_text_3 || ""),
          "CTA: " + (o.cta || ""),
          "Main image: " + (o.main_image || ""),
          "Sub image: " + (o.sub_image || ""),
          "Trust-booster: " + (o.trust_booster || ""),
          "Emergency: " + (o.emergency || ""),
          "Review: " + (o.review_texts || []).join(" | "),
          "Image guidance: " + (o.image_guidance || ""),
        ]
          .filter((line) => !/: $/.test(line))
          .join("\n")
      )
      .join("\n\n");
  for (let i = 0; i < segs.length; i += 2) {
    const [k1, v1] = segs[i];
    const pair = segs[i + 1];
    const s1 = segCode(k1);
    if (pair) {
      const [k2, v2] = pair;
      const s2 = segCode(k2);
      addRow("Subject " + s1, subjectValue(v1), "Subject " + s2, subjectValue(v2));
      addRow("PreHeader " + s1, preheaderValue(v1), "PreHeader " + s2, preheaderValue(v2));
    } else {
      addRow("Subject " + s1, subjectValue(v1));
      addRow("PreHeader " + s1, preheaderValue(v1));
    }
  }
  spacer();

  addRow("Theme", brief.theme || "");

  const b = brief.banner || ({} as GenBrief["banner"]);
  addRow(
    "Banner",
    [
      b.logo_stars,
      "Main text 1: " + (b.main_text_1 || b.main_text || ""),
      "Main text 2: " + (b.main_text_2 || ""),
      "Main text 3: " + (b.main_text_3 || ""),
      "Sub text 1: " + (b.sub_text_1 || b.sub_text || ""),
      "Sub text 2: " + (b.sub_text_2 || ""),
      "Sub text 3: " + (b.sub_text_3 || ""),
      "Main image: " + (b.main_image || ""),
      "Sub image: " + (b.sub_image || ""),
      "Trust-booster: " + (b.trust_booster || ""),
      "Emergency: " + (b.emergency || ""),
      "Image: " + (b.image_guidance || ""),
      "Review: " + ((b.review_texts || []).join("\n") || b.review_quote || ""),
      "CTA: " + (b.cta || ""),
      (() => { const bov = bannerOptionsValue(b); return bov ? "A/B options:\n" + bov : ""; })(),
    ]
      .filter(Boolean)
      .join("\n")
  );

  const bodyText = Object.entries(brief.body || {})
    .map(([k, v]) => (k === "base" ? "Base" : "SEG " + segCode(k).toUpperCase()) + "\n" + v)
    .join("\n\n");
  addRow("Body", bodyText);
  const bodyOptions = bodyOptionsValue();
  if (bodyOptions) addRow("Body A/B options", bodyOptions);
  if (brief.ps) addRow("P.S.", brief.ps);

  addRow("Product images", "Rendered as linked image modules only\n- text and CTA live inside generated images\n- no caption/CTA under product images");
  spacer();

  // Products in 2-up pairs
  const prods = brief.products || [];
  const makeText = (p: (typeof prods)[number] | undefined) =>
    p
      ? [
          "Product image: " + p.name,
          "Image headline: " + (p.main_text || ""),
          "Image sub text: " + (p.sub_text || ""),
          "Image CTA: " + (p.cta || ""),
          "Main image: " + (p.main_image || p.image_options?.[0]?.main_image || ""),
          "Sub image: " + (p.sub_image || p.image_options?.[0]?.sub_image || ""),
          "Alt text: " + (p.alt_text || p.image_options?.[0]?.alt_text || ""),
          "Image notes: " + (p.image_notes || p.image_options?.[0]?.notes || ""),
          p.popup_badge ? "Popout: " + p.popup_badge : "",
          ...(p.usps || []).map((u) => "+ " + u),
          p.review ? "Review: " + p.review : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  for (let i = 0; i < prods.length; i += 2) {
    const p1 = prods[i];
    const p2 = prods[i + 1];
    addRow("Product " + (i + 1), makeText(p1), p2 ? "Product " + (i + 2) : null, makeText(p2));
    spacer();
  }

  return rows;
}

// ---- SpreadsheetML 2003 serialization ----
function escXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "&#10;");
}

function plainText(value: string): string {
  return String(value)
    .replace(/\[([^\]]+)\]\((?:slug:[^)]+|home|https?:\/\/[^)]+)\)/gi, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cellXml(v: string | null, bold: boolean): string {
  if (v == null || v === "") return "<Cell/>";
  return `<Cell${bold ? ' ss:StyleID="label"' : ""}><Data ss:Type="String">${escXml(plainText(v))}</Data></Cell>`;
}

// Column widths in points (≈ source's char widths 3/18/70/18/70 × 7).
const COL_WIDTHS = [21, 126, 490, 126, 490];

function sheetXml(name: string, rows: Row[]): string {
  const cols = COL_WIDTHS.map((w) => `<Column ss:Width="${w}"/>`).join("");
  // Bold the label columns (indexes 1 and 3); columns 2 and 4 are their values.
  const body = rows.map((r) => `<Row>${r.map((v, i) => cellXml(v, i === 1 || i === 3)).join("")}</Row>`).join("");
  return `<Worksheet ss:Name="${escXml(name)}"><Table>${cols}${body}</Table></Worksheet>`;
}

/** Excel sheet names: ≤31 chars, none of []:*?/\ */
function safeSheetName(s: string): string {
  return s.replace(/[\[\]:*?/\\]/g, "-").slice(0, 31);
}

/** Build and download a SpreadsheetML 2003 workbook with one sheet per generated option. */
export async function exportBriefsToExcel(
  options: { a?: GenBrief; b?: GenBrief },
  brand: string,
  dateLabel: string,
  ops?: CampaignOps
): Promise<void> {
  const sheets = (["a", "b"] as const)
    .filter((opt) => options[opt])
    .map((opt) => sheetXml(safeSheetName(`${brand}_${dateLabel}_${opt.toUpperCase()}`), briefToRows(options[opt]!, ops)))
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
  <Style ss:ID="label"><Font ss:Bold="1"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
 </Styles>
 ${sheets}
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${brand}_brief_${dateLabel}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
