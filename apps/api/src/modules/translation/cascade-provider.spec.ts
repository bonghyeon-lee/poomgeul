import { CascadeTranslationProvider } from "./cascade-provider.js";
import {
  type BatchTranslationItem,
  type BatchTranslationOutput,
  TranslationProviderError,
  type TranslationOutput,
  type TranslationRequest,
} from "./gemini-provider.js";
import type { TranslationProvider } from "./translation-provider.js";

type StubOptions = {
  configured?: boolean;
  output?: TranslationOutput;
  batchOutput?: BatchTranslationOutput;
  error?: TranslationProviderError;
};

class StubProvider implements TranslationProvider {
  public singleCalls = 0;
  public batchCalls = 0;
  constructor(private readonly opts: StubOptions) {}
  isConfigured(): boolean {
    return this.opts.configured ?? true;
  }
  async translate(_req: TranslationRequest): Promise<TranslationOutput> {
    this.singleCalls += 1;
    if (this.opts.error) throw this.opts.error;
    if (!this.opts.output) throw new Error("stub: no output configured");
    return this.opts.output;
  }
  async translateBatch(_items: BatchTranslationItem[]): Promise<BatchTranslationOutput> {
    this.batchCalls += 1;
    if (this.opts.error) throw this.opts.error;
    if (!this.opts.batchOutput) throw new Error("stub: no batch output configured");
    return this.opts.batchOutput;
  }
}

const PRIMARY: TranslationOutput = {
  text: "primary 결과",
  model: "gemini-2.5-flash",
  promptHash: "h1",
  promptVersion: "1",
  inputTokens: 10,
  outputTokens: 20,
  latencyMs: 100,
};

const FALLBACK: TranslationOutput = {
  text: "fallback 결과",
  model: "google/gemma-2-9b-it:free",
  promptHash: "h1",
  promptVersion: "1",
  inputTokens: 10,
  outputTokens: 20,
  latencyMs: 500,
};

describe("CascadeTranslationProvider.translate", () => {
  it("primary 성공 시 fallback을 호출하지 않는다", async () => {
    const primary = new StubProvider({ output: PRIMARY });
    const fallback = new StubProvider({ output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    const out = await cascade.translate({ text: "x" });
    expect(out.model).toBe(PRIMARY.model);
    expect(primary.singleCalls).toBe(1);
    expect(fallback.singleCalls).toBe(0);
  });

  it("primary 429 rate-limited면 fallback으로 넘어간다", async () => {
    const primary = new StubProvider({
      error: new TranslationProviderError("quota exceeded", { httpStatus: 429 }),
    });
    const fallback = new StubProvider({ output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    const out = await cascade.translate({ text: "x" });
    expect(out.model).toBe(FALLBACK.model);
    expect(primary.singleCalls).toBe(1);
    expect(fallback.singleCalls).toBe(1);
  });

  it("primary 401 permanent면 fallback으로 넘어간다", async () => {
    const primary = new StubProvider({
      error: new TranslationProviderError("invalid key", { httpStatus: 401 }),
    });
    const fallback = new StubProvider({ output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    const out = await cascade.translate({ text: "x" });
    expect(out.model).toBe(FALLBACK.model);
  });

  it("primary 503 UNAVAILABLE은 fallback하지 않고 그대로 올린다 (상위 backoff가 처리)", async () => {
    const primary = new StubProvider({
      error: new TranslationProviderError("UNAVAILABLE", { httpStatus: 503 }),
    });
    const fallback = new StubProvider({ output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    await expect(cascade.translate({ text: "x" })).rejects.toMatchObject({
      httpStatus: 503,
    });
    expect(fallback.singleCalls).toBe(0);
  });

  it("fallback이 configured되지 않았으면 primary 에러를 그대로 올린다", async () => {
    const primaryErr = new TranslationProviderError("quota", { httpStatus: 429 });
    const primary = new StubProvider({ error: primaryErr });
    const fallback = new StubProvider({ configured: false, output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    await expect(cascade.translate({ text: "x" })).rejects.toBe(primaryErr);
    expect(fallback.singleCalls).toBe(0);
  });

  it("fallback도 실패하면 primary 에러를 반환 (fallback 에러는 삼킨다)", async () => {
    const primaryErr = new TranslationProviderError("quota", { httpStatus: 429 });
    const primary = new StubProvider({ error: primaryErr });
    const fallback = new StubProvider({
      error: new TranslationProviderError("also quota", { httpStatus: 429 }),
    });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    await expect(cascade.translate({ text: "x" })).rejects.toBe(primaryErr);
  });

  it("primary가 configured되지 않았고 fallback이 configured면 바로 fallback 호출", async () => {
    const primary = new StubProvider({ configured: false, output: PRIMARY });
    const fallback = new StubProvider({ output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    const out = await cascade.translate({ text: "x" });
    expect(out.model).toBe(FALLBACK.model);
    expect(primary.singleCalls).toBe(0);
    expect(fallback.singleCalls).toBe(1);
  });

  it("둘 다 configured되지 않았으면 명시적 에러를 던진다", async () => {
    const primary = new StubProvider({ configured: false, output: PRIMARY });
    const fallback = new StubProvider({ configured: false, output: FALLBACK });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    await expect(cascade.translate({ text: "x" })).rejects.toThrow(
      /no translation provider is configured/,
    );
  });
});

describe("CascadeTranslationProvider.translateBatch", () => {
  const batchPrimary: BatchTranslationOutput = {
    items: [{ id: "1", text: "p" }],
    model: PRIMARY.model,
    promptHash: "h2",
    promptVersion: "2",
    inputTokens: null,
    outputTokens: null,
    latencyMs: 100,
  };
  const batchFallback: BatchTranslationOutput = {
    items: [{ id: "1", text: "f" }],
    model: FALLBACK.model,
    promptHash: "h2",
    promptVersion: "2",
    inputTokens: null,
    outputTokens: null,
    latencyMs: 500,
  };

  it("primary rate-limited → fallback 사용", async () => {
    const primary = new StubProvider({
      error: new TranslationProviderError("quota", { httpStatus: 429 }),
    });
    const fallback = new StubProvider({ batchOutput: batchFallback });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    const out = await cascade.translateBatch([{ id: "1", text: "x" }]);
    expect(out.model).toBe(FALLBACK.model);
    expect(primary.batchCalls).toBe(1);
    expect(fallback.batchCalls).toBe(1);
  });

  it("primary 성공 시 그대로 반환", async () => {
    const primary = new StubProvider({ batchOutput: batchPrimary });
    const fallback = new StubProvider({ batchOutput: batchFallback });
    const cascade = new CascadeTranslationProvider(primary, fallback);
    const out = await cascade.translateBatch([{ id: "1", text: "x" }]);
    expect(out.model).toBe(PRIMARY.model);
    expect(fallback.batchCalls).toBe(0);
  });
});
