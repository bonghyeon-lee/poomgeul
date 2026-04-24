import { TranslationProviderError } from "./gemini-provider.js";
import { OpenRouterTranslationProvider } from "./openrouter-provider.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenRouterTranslationProvider", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("isConfigured reflects apiKey presence", () => {
    const withKey = new OpenRouterTranslationProvider({ apiKey: "sk-x" });
    expect(withKey.isConfigured()).toBe(true);
    const withoutKey = new OpenRouterTranslationProvider({ apiKey: "" });
    expect(withoutKey.isConfigured()).toBe(false);
  });

  it("translate: auth header와 model을 body에 담아 보내고 content를 돌려준다", async () => {
    const spy = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>()
      .mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: "한국어 번역" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 8, completion_tokens: 12 },
        }),
      );
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterTranslationProvider({
      apiKey: "sk-test",
      model: "test-model:free",
    });
    const out = await provider.translate({ text: "hello" });

    expect(out.text).toBe("한국어 번역");
    expect(out.model).toBe("test-model:free");
    expect(out.inputTokens).toBe(8);
    expect(out.outputTokens).toBe(12);

    const [, init] = spy.mock.calls[0] ?? [];
    expect(init).toBeDefined();
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init?.body)) as { model: string; messages: unknown[] };
    expect(body.model).toBe("test-model:free");
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("translate: HTTP 429는 rate-limited TranslationProviderError로 매핑", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response("Too Many Requests", { status: 429 }),
      ) as unknown as typeof globalThis.fetch;
    const provider = new OpenRouterTranslationProvider({ apiKey: "sk-x" });
    await expect(provider.translate({ text: "x" })).rejects.toMatchObject({
      httpStatus: 429,
    });
  });

  it("translateBatch: 올바른 JSON 배열 응답을 파싱하고 id 집합을 검증", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { id: "a", text: "A번역" },
                { id: "b", text: "B번역" },
              ]),
            },
          },
        ],
        usage: {},
      }),
    ) as unknown as typeof globalThis.fetch;

    const provider = new OpenRouterTranslationProvider({ apiKey: "sk-x", model: "m:free" });
    const out = await provider.translateBatch([
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]);
    expect(out.items).toEqual([
      { id: "a", text: "A번역" },
      { id: "b", text: "B번역" },
    ]);
    expect(out.model).toBe("m:free");
  });

  it("translateBatch: markdown fence로 감싼 JSON도 파싱한다", async () => {
    const fenced = '```json\n[{"id":"a","text":"A"}]\n```';
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: fenced } }], usage: {} }),
      ) as unknown as typeof globalThis.fetch;
    const provider = new OpenRouterTranslationProvider({ apiKey: "sk-x" });
    const out = await provider.translateBatch([{ id: "a", text: "A" }]);
    expect(out.items).toEqual([{ id: "a", text: "A" }]);
  });

  it("translateBatch: 크기가 맞지 않으면 TranslationProviderError", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify([{ id: "a", text: "A" }]) } }],
        usage: {},
      }),
    ) as unknown as typeof globalThis.fetch;
    const provider = new OpenRouterTranslationProvider({ apiKey: "sk-x" });
    await expect(
      provider.translateBatch([
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ]),
    ).rejects.toThrow(TranslationProviderError);
  });

  it("translateBatch: 알 수 없는 id가 오면 TranslationProviderError", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify([{ id: "zzz", text: "X" }]) } }],
        usage: {},
      }),
    ) as unknown as typeof globalThis.fetch;
    const provider = new OpenRouterTranslationProvider({ apiKey: "sk-x" });
    await expect(provider.translateBatch([{ id: "a", text: "A" }])).rejects.toThrow(/unknown id/);
  });
});
