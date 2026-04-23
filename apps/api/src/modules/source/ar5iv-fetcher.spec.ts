import { Ar5ivFetcher, Ar5ivNotFoundError, Ar5ivUpstreamError } from "./ar5iv-fetcher.js";

function mockFetchOnce(body: string, init: Partial<Response> = {}): void {
  globalThis.fetch = jest.fn(async () => {
    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as Response;
  });
}

describe("Ar5ivFetcher.fetchHtml", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the HTML body on 200", async () => {
    mockFetchOnce("<html><body>OK</body></html>");
    const html = await new Ar5ivFetcher().fetchHtml("2310.12345");
    expect(html).toContain("OK");
  });

  it("throws Ar5ivNotFoundError on 404", async () => {
    mockFetchOnce("", { status: 404 });
    await expect(new Ar5ivFetcher().fetchHtml("9999.99999")).rejects.toBeInstanceOf(
      Ar5ivNotFoundError,
    );
  });

  it("throws Ar5ivUpstreamError on 5xx", async () => {
    mockFetchOnce("", { status: 503 });
    await expect(new Ar5ivFetcher().fetchHtml("2310.12345")).rejects.toBeInstanceOf(
      Ar5ivUpstreamError,
    );
  });

  it("throws Ar5ivUpstreamError on network failure", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(new Ar5ivFetcher().fetchHtml("2310.12345")).rejects.toBeInstanceOf(
      Ar5ivUpstreamError,
    );
  });

  it("throws Ar5ivUpstreamError with 'timed out' message on AbortError", async () => {
    globalThis.fetch = jest.fn(async () => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(
      new Ar5ivFetcher({ timeoutMs: 1 }).fetchHtml("2310.12345"),
    ).rejects.toThrow(/timed out/);
  });
});
