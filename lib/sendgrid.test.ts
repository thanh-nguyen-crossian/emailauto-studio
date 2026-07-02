import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();
vi.mock("@sendgrid/client", () => ({
  default: {
    setApiKey: vi.fn(),
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

// F1.3/F2.1 (docs/IMPROVEMENT_PLAN-2026-07-02.md): mocked-client tests of the new SendGrid
// Marketing Campaign Stats + Single Send API wrappers. Fixture shapes follow the documented
// response format (see the doc links atop lib/sendgrid.ts) — validate against a real SendGrid
// account during F1.3's manual verification step before relying on these in production.

beforeEach(() => {
  requestMock.mockReset();
  process.env.SENDGRID_API_KEY = "test-key";
});

describe("getSingleSendStats", () => {
  it("aggregates stats across every result (an A/B Single Send has one entry per variation)", async () => {
    requestMock.mockResolvedValueOnce([
      {},
      {
        results: [
          { stats: { delivered: 100, unique_opens: 40, unique_clicks: 10, bounces: 1, unsubscribes: 2, spam_reports: 0 } },
          { stats: { delivered: 100, unique_opens: 50, unique_clicks: 15, bounces: 0, unsubscribes: 1, spam_reports: 1 } },
        ],
      },
    ]);
    const { getSingleSendStats } = await import("./sendgrid");
    const stats = await getSingleSendStats("ss_1");
    expect(stats).toEqual({ delivered: 200, uniqueOpens: 90, uniqueClicks: 25, bounces: 1, unsubscribes: 3, spamReports: 1 });
  });

  it("returns all-zero stats when results is empty (send not yet delivered)", async () => {
    requestMock.mockResolvedValueOnce([{}, { results: [] }]);
    const { getSingleSendStats } = await import("./sendgrid");
    const stats = await getSingleSendStats("ss_2");
    expect(stats.delivered).toBe(0);
    expect(stats.uniqueClicks).toBe(0);
  });

  it("surfaces a 403 as a Marketing-scope hint", async () => {
    requestMock.mockRejectedValueOnce({ response: { statusCode: 403, body: { errors: [{ message: "access denied" }] } } });
    const { getSingleSendStats } = await import("./sendgrid");
    await expect(getSingleSendStats("ss_3")).rejects.toThrow(/Marketing scope/);
  });
});

describe("getSingleSendClickStats", () => {
  it("maps each result to a url -> unique_clicks record", async () => {
    requestMock.mockResolvedValueOnce([
      {},
      { results: [{ url: "https://bragoddess.com/a", unique_clicks: 5 }, { url: "https://bragoddess.com/b", unique_clicks: 2 }] },
    ]);
    const { getSingleSendClickStats } = await import("./sendgrid");
    const byUrl = await getSingleSendClickStats("ss_1");
    expect(byUrl).toEqual({ "https://bragoddess.com/a": 5, "https://bragoddess.com/b": 2 });
  });

  it("falls back to clicks when unique_clicks is absent", async () => {
    requestMock.mockResolvedValueOnce([{}, { results: [{ url: "https://x.com/a", clicks: 3 }] }]);
    const { getSingleSendClickStats } = await import("./sendgrid");
    expect(await getSingleSendClickStats("ss_1")).toEqual({ "https://x.com/a": 3 });
  });
});

describe("listSingleSends", () => {
  it("maps the result array to summaries", async () => {
    requestMock.mockResolvedValueOnce([
      {},
      { result: [{ id: "ss_1", name: "July sale", status: "triggered", send_at: "2026-07-01T00:00:00Z" }] },
    ]);
    const { listSingleSends } = await import("./sendgrid");
    expect(await listSingleSends()).toEqual([{ id: "ss_1", name: "July sale", status: "triggered", sendAt: "2026-07-01T00:00:00Z" }]);
  });
});

describe("listContactLists", () => {
  it("maps the result array to contact lists", async () => {
    requestMock.mockResolvedValueOnce([{}, { result: [{ id: "list_1", name: "Active customers", contact_count: 12000 }] }]);
    const { listContactLists } = await import("./sendgrid");
    expect(await listContactLists()).toEqual([{ id: "list_1", name: "Active customers", contactCount: 12000 }]);
  });

  it("follows SendGrid pagination and de-duplicates list ids", async () => {
    requestMock
      .mockResolvedValueOnce([{}, {
        result: [{ id: "list_1", name: "Active customers", contact_count: 12000 }],
        _metadata: { next: "https://api.sendgrid.com/v3/marketing/lists?page_size=1&page_token=next_page" },
      }])
      .mockResolvedValueOnce([{}, {
        result: [
          { id: "list_1", name: "Active customers duplicate", contact_count: 12000 },
          { id: "list_2", name: "VIP buyers", contact_count: 900 },
        ],
      }]);
    const { listContactLists } = await import("./sendgrid");
    expect(await listContactLists(1, 3)).toEqual([
      { id: "list_1", name: "Active customers", contactCount: 12000 },
      { id: "list_2", name: "VIP buyers", contactCount: 900 },
    ]);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls[1][0].url).toContain("page_token=next_page");
  });
});

describe("listSingleSendsPaginated", () => {
  it("follows SendGrid pagination for Single Send summaries", async () => {
    requestMock
      .mockResolvedValueOnce([{}, {
        result: [{ id: "ss_1", name: "July A", status: "draft", send_at: null }],
        _metadata: { next: "https://api.sendgrid.com/v3/marketing/singlesends?page_size=1&page_token=ss_next" },
      }])
      .mockResolvedValueOnce([{}, { result: [{ id: "ss_2", name: "July B", status: "scheduled", send_at: "2026-07-03T00:00:00Z" }] }]);
    const { listSingleSendsPaginated } = await import("./sendgrid");
    expect(await listSingleSendsPaginated(1, 3)).toEqual([
      { id: "ss_1", name: "July A", status: "draft", sendAt: null },
      { id: "ss_2", name: "July B", status: "scheduled", sendAt: "2026-07-03T00:00:00Z" },
    ]);
    expect(requestMock.mock.calls[1][0].url).toContain("page_token=ss_next");
  });
});

describe("createSingleSend", () => {
  it("posts the expected body shape and returns id/status", async () => {
    requestMock.mockResolvedValueOnce([{}, { id: "ss_new", status: "draft" }]);
    const { createSingleSend } = await import("./sendgrid");
    const result = await createSingleSend({
      name: "Test send",
      subject: "Hello",
      html: "<p>hi</p>",
      listIds: ["list_1"],
      designId: "design_1",
    });
    expect(result).toEqual({ id: "ss_new", status: "draft" });
    const [request] = requestMock.mock.calls[0];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/v3/marketing/singlesends");
    expect(request.body.send_to.list_ids).toEqual(["list_1"]);
    expect(request.body.email_config.design_id).toBe("design_1");
  });
});

describe("scheduleSingleSend", () => {
  it("PUTs the schedule endpoint with the given send_at", async () => {
    requestMock.mockResolvedValueOnce([{}, { status: "scheduled" }]);
    const { scheduleSingleSend } = await import("./sendgrid");
    const result = await scheduleSingleSend("ss_1", "now");
    expect(result).toEqual({ status: "scheduled" });
    const [request] = requestMock.mock.calls[0];
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("/v3/marketing/singlesends/ss_1/schedule");
    expect(request.body).toEqual({ send_at: "now" });
  });
});
