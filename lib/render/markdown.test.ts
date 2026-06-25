import { describe, expect, it } from "vitest";
import { BRANDS } from "../config/brands";
import { buildUrl, paragraphsToHtml, parseInlineMarkdown } from "./markdown";

const brand = BRANDS.bra_goddess;

describe("markdown renderer", () => {
  it("builds SendGrid tracked product and home links", () => {
    expect(buildUrl(brand, "daisy-bra")).toBe(`https://${brand.domain}/daisy-bra?{{paramurl}}`);
    expect(buildUrl(brand, null)).toBe(`https://${brand.domain}/?{{paramurl}}`);
  });

  it("renders safe inline markup and escapes raw HTML", () => {
    const html = parseInlineMarkdown("Try [Daisy](slug:daisy-bra) ==today== <script>", brand, "#a02338");
    expect(html).toContain('clicktracking="off"');
    expect(html).toContain("daisy-bra?{{paramurl}}");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>today</strong>");
  });

  it("splits paragraphs into SendGrid div blocks", () => {
    const html = paragraphsToHtml("First paragraph.\n\nSecond **bold** paragraph.", brand, "#a02338");
    expect(html).toContain('style="font-family: inherit; text-align: left">First paragraph.</div>');
    expect(html).toContain("<strong>bold</strong>");
  });
});
