"use client";

// Excel export of the generated brief(s), mirroring email-brief-generator's exportToExcel —
// but as SpreadsheetML 2003 (hand-written XML, zero dependencies). One worksheet per option
// (A/B), label/value rows in 2-up pairs, fixed column widths, wrapped multiline cells.
// Opens natively in Excel and Google Sheets.

import { PLAYBOOK_REQUIRED_QA, type GenBrief } from "./briefgen";

type Row = (string | null)[];

function briefToRows(brief: GenBrief): Row[] {
  const rows: Row[] = [];
  const addRow = (col2?: string | null, col3?: string | null, col4?: string | null, col5?: string | null) =>
    rows.push([null, col2 || null, col3 || null, col4 || null, col5 || null]);
  const spacer = () => rows.push([null, null, null, null, null]);

  spacer();

  const d = brief.creative_direction || ({} as GenBrief["creative_direction"]);
  const h = d.hook_contract || ({} as GenBrief["creative_direction"]["hook_contract"]);
  addRow("Angle", d.angle || "", "Framework", d.framework || "");
  addRow("Flow", d.flow || "", "Differentiator", d.differentiator || "");
  addRow(
    "Hook Contract",
    [
      "Segment: " + (h.segment_insight || ""),
      "Emotion: " + (h.emotion || ""),
      "Hero: " + (h.hero_product || ""),
      "Proof/price: " + (h.proof_or_price || ""),
      "Urgency: " + (h.urgency || ""),
      "Avoid: " + (h.avoid_rule || ""),
    ].join("\n")
  );
  spacer();

  // Subject lines + preheaders — paired 2-per-row
  const segs = Object.entries(brief.subject_lines || {});
  const segCode = (k: string) => k.replace("seg_", "").replace("_", "-");
  for (let i = 0; i < segs.length; i += 2) {
    const [k1, v1] = segs[i];
    const pair = segs[i + 1];
    const s1 = segCode(k1);
    if (pair) {
      const [k2, v2] = pair;
      const s2 = segCode(k2);
      addRow("Subject " + s1, v1?.subject || "", "Subject " + s2, v2?.subject || "");
      addRow("PreHeader " + s1, v1?.preheader || "", "PreHeader " + s2, v2?.preheader || "");
    } else {
      addRow("Subject " + s1, v1?.subject || "");
      addRow("PreHeader " + s1, v1?.preheader || "");
    }
  }
  spacer();

  addRow("Theme", brief.theme || "");

  const b = brief.banner || ({} as GenBrief["banner"]);
  addRow(
    "Banner",
    [
      b.logo_stars,
      "Main text: " + (b.main_text || ""),
      "Sub text: " + (b.sub_text || ""),
      "Image: " + (b.image_guidance || ""),
      "Review: " + (b.review_quote || ""),
      "CTA: " + (b.cta || ""),
    ]
      .filter(Boolean)
      .join("\n")
  );

  const bodyText = Object.entries(brief.body || {})
    .map(([k, v]) => (k === "base" ? "Base" : "SEG " + segCode(k).toUpperCase()) + "\n" + v)
    .join("\n\n");
  addRow("Body", bodyText);

  const q = brief.quality_checks || ({} as GenBrief["quality_checks"]);
  addRow(
    "Quality Gate",
    PLAYBOOK_REQUIRED_QA.map((field) => field.replace(/_/g, " ") + ": " + ((q as unknown as Record<string, string>)[field] || "")).join("\n")
  );

  addRow("Product images", "Layout as previous template\n- model-wearing product shots\n- relevant supporting images");
  spacer();

  // Products in 2-up pairs
  const prods = brief.products || [];
  const makeText = (p: (typeof prods)[number] | undefined) =>
    p
      ? [
          "Product image: " + p.name,
          "Main text: " + (p.main_text || ""),
          "Sub text: " + (p.sub_text || ""),
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
    addRow(null, p1 ? "CTA: " + (p1.cta || "") : "", null, p2 ? "CTA: " + (p2.cta || "") : "");
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

function cellXml(v: string | null, bold: boolean): string {
  if (v == null || v === "") return "<Cell/>";
  return `<Cell${bold ? ' ss:StyleID="label"' : ""}><Data ss:Type="String">${escXml(v)}</Data></Cell>`;
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
  dateLabel: string
): Promise<void> {
  const sheets = (["a", "b"] as const)
    .filter((opt) => options[opt])
    .map((opt) => sheetXml(safeSheetName(`${brand}_${dateLabel}_${opt.toUpperCase()}`), briefToRows(options[opt]!)))
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
