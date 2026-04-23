import { GeminiTranslationProvider, TranslationProviderError } from "./gemini-provider.js";

function mockFetch(responses: Array<{ status?: number; body: unknown } | Error>): void {
  let i = 0;
  globalThis.fetch = jest.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("mock fetch exhausted");
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
      json: async () => (typeof r.body === "string" ? JSON.parse(r.body) : r.body),
    } as Response;
  });
}

const originalFetch = globalThis.fetch;

describe("GeminiTranslationProvider", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("isConfigured() reflects GEMINI_API_KEY presence", () => {
    expect(new GeminiTranslationProvider({ apiKey: "x" }).isConfigured()).toBe(true);
    expect(new GeminiTranslationProvider({ apiKey: undefined }).isConfigured()).toBe(false);
  });

  it("throws if API key is missing when translate() is called", async () => {
    const p = new GeminiTranslationProvider({ apiKey: undefined });
    await expect(p.translate({ text: "hi" })).rejects.toBeInstanceOf(TranslationProviderError);
  });

  it("returns translated text, token counts, and prompt metadata on 200", async () => {
    mockFetch([
      {
        body: {
          candidates: [{ content: { parts: [{ text: "안녕하세요." }] }, finishReason: "STOP" }],
          usageMetadata: {
            promptTokenCount: 12,
            candidatesTokenCount: 7,
            totalTokenCount: 19,
          },
        },
      },
    ]);
    const out = await new GeminiTranslationProvider({ apiKey: "test" }).translate({
      text: "Hello.",
    });
    expect(out.text).toBe("안녕하세요.");
    expect(out.inputTokens).toBe(12);
    expect(out.outputTokens).toBe(7);
    expect(out.model).toBe("gemini-2.5-flash");
    expect(out.promptVersion).toBe("translate.en-ko.v1");
    expect(out.promptHash).toMatch(/^[0-9a-f]{8}$/);
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("throws TranslationProviderError on non-2xx status", async () => {
    mockFetch([{ status: 429, body: "rate limit" }]);
    await expect(
      new GeminiTranslationProvider({ apiKey: "test" }).translate({ text: "x" }),
    ).rejects.toThrow(/HTTP 429/);
  });

  it("parses retryDelay from a Gemini 429 body into retryAfterMs", async () => {
    const rateBody = JSON.stringify({
      error: {
        code: 429,
        message: "quota exceeded",
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "40s" }],
      },
    });
    mockFetch([{ status: 429, body: rateBody }]);
    try {
      await new GeminiTranslationProvider({ apiKey: "test" }).translate({ text: "x" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TranslationProviderError);
      const e = err as TranslationProviderError;
      expect(e.httpStatus).toBe(429);
      expect(e.isRateLimited).toBe(true);
      expect(e.retryAfterMs).toBe(40_000);
    }
  });

  it("classifies 503 UNAVAILABLE as isServiceUnavailable", async () => {
    const body = JSON.stringify({
      error: {
        code: 503,
        message: "This model is currently experiencing high demand.",
        status: "UNAVAILABLE",
      },
    });
    mockFetch([{ status: 503, body }]);
    try {
      await new GeminiTranslationProvider({ apiKey: "test" }).translate({ text: "x" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TranslationProviderError);
      const e = err as TranslationProviderError;
      expect(e.httpStatus).toBe(503);
      expect(e.isServiceUnavailable).toBe(true);
      expect(e.isRateLimited).toBe(false);
      expect(e.isPermanent).toBe(false);
    }
  });

  it("throws TranslationProviderError when the response has no candidate text", async () => {
    mockFetch([{ body: { candidates: [{ content: { parts: [] } }] } }]);
    await expect(
      new GeminiTranslationProvider({ apiKey: "test" }).translate({ text: "x" }),
    ).rejects.toThrow(/no candidate text/);
  });

  it("throws TranslationProviderError on an explicit API error body", async () => {
    mockFetch([
      {
        body: {
          error: { message: "invalid argument", status: "INVALID_ARGUMENT" },
        },
      },
    ]);
    await expect(
      new GeminiTranslationProvider({ apiKey: "test" }).translate({ text: "x" }),
    ).rejects.toThrow(/invalid argument/);
  });

  it("wraps AbortError as a timeout error", async () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    mockFetch([err]);
    await expect(
      new GeminiTranslationProvider({ apiKey: "test", timeoutMs: 1 }).translate({
        text: "x",
      }),
    ).rejects.toThrow(/timed out/);
  });

  it("wraps arbitrary network errors as TranslationProviderError", async () => {
    mockFetch([new Error("ECONNRESET")]);
    await expect(
      new GeminiTranslationProvider({ apiKey: "test" }).translate({ text: "x" }),
    ).rejects.toBeInstanceOf(TranslationProviderError);
  });
});
