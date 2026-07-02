import { describe, expect, it } from "vitest";
import { analyzePreviewGotchas, withDarkPreviewStyles } from "./previewUtils";

describe("analyzePreviewGotchas", () => {
  it("warns on missing lang and missing image alt text", () => {
    const gotchas = analyzePreviewGotchas("<html><body><img src=\"https://cdn.example.com/a.jpg\"><p>Hello</p></body></html>");
    expect(gotchas.some((g) => /lang/i.test(g.message))).toBe(true);
    expect(gotchas.some((g) => /missing alt/i.test(g.message))).toBe(true);
  });

  it("blocks Gmail clipping-sized HTML", () => {
    const html = `<html lang="en"><body>${"a".repeat(103 * 1024)}</body></html>`;
    expect(analyzePreviewGotchas(html).some((g) => g.severity === "block" && /clip/i.test(g.message))).toBe(true);
  });

  it("keeps a clean lightweight preview quiet", () => {
    const html = "<html lang=\"en\"><body><p>Comfort copy with a clear link.</p><a href=\"https://example.com\">Shop</a></body></html>";
    expect(analyzePreviewGotchas(html)).toEqual([]);
  });
});

describe("withDarkPreviewStyles", () => {
  it("injects dark preview styles before the head closes", () => {
    const html = "<html><head><title>x</title></head><body>Copy</body></html>";
    const dark = withDarkPreviewStyles(html);
    expect(dark).toContain("data-emailauto-dark-preview");
    expect(dark.indexOf("data-emailauto-dark-preview")).toBeLessThan(dark.indexOf("</head>"));
  });

  it("does not inject the style twice", () => {
    const once = withDarkPreviewStyles("<html><body>Copy</body></html>");
    const twice = withDarkPreviewStyles(once);
    expect((twice.match(/data-emailauto-dark-preview/g) || []).length).toBe(1);
  });
});
