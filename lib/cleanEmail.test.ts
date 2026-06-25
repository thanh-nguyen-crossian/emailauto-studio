import { describe, expect, it } from "vitest";
import { cleanForTemplate } from "./cleanEmail";

const MINIMAL_HTML = `<!DOCTYPE html><html><head></head><body><table><tr><td>Hello</td></tr></table></body></html>`;

describe("cleanForTemplate", () => {
  it("returns a CleanResult with html, blocking, warnings, and info arrays", () => {
    const result = cleanForTemplate(MINIMAL_HTML);
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("blocking");
    expect(result).toHaveProperty("warnings");
    expect(result).toHaveProperty("info");
    expect(typeof result.html).toBe("string");
    expect(Array.isArray(result.blocking)).toBe(true);
  });

  it("adds clicktracking=off to anchor tags that lack it", () => {
    const html = `<html><head></head><body><a href="https://example.com">Click</a></body></html>`;
    const result = cleanForTemplate(html);
    expect(result.html).toContain('clicktracking=off');
  });

  it("does not duplicate clicktracking=off on anchors that already have it", () => {
    const html = `<html><head></head><body><a clicktracking=off href="https://example.com">Click</a></body></html>`;
    const result = cleanForTemplate(html);
    const matches = (result.html.match(/clicktracking=off/g) || []).length;
    expect(matches).toBe(1);
  });

  it("adds role=presentation to layout tables", () => {
    const html = `<html><head></head><body><table><tr><td>Content</td></tr></table></body></html>`;
    const result = cleanForTemplate(html);
    expect(result.html).toContain('role="presentation"');
  });

  it("reports originalBytes and cleanedBytes", () => {
    const result = cleanForTemplate(MINIMAL_HTML);
    expect(result.originalBytes).toBeGreaterThan(0);
    expect(result.cleanedBytes).toBeGreaterThan(0);
  });

  it("does not flag merge tags as a blocking issue", () => {
    // A complete email scaffold with unsub link, CTA, and preheader so blocking
    // issues come only from real problems — not from the presence of {{merge tags}}.
    const html = [
      `<html lang="en"><head><title>T</title></head>`,
      `<body>`,
      `<span class="preheader">Preview text here for the email client</span>`,
      `Hi {{first_name}}, check this out.`,
      `<a href="https://bragoddess.com/daisy-bra?{{paramurl}}">Shop Now</a>`,
      `<a href="https://bragoddess.com/unsubscribe?{{paramurl}}">Unsubscribe</a>`,
      `</body></html>`,
    ].join("\n");
    const result = cleanForTemplate(html);
    // Merge tags must not themselves add blocking issues
    const mergeTagBlocking = result.blocking.filter((b) => /\{\{/.test(b));
    expect(mergeTagBlocking).toHaveLength(0);
  });
});
