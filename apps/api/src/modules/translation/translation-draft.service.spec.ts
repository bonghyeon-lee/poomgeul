import {
  type BatchTranslationItem,
  type BatchTranslationOutput,
  type TranslationOutput,
  GeminiTranslationProvider,
  TranslationProviderError,
} from "./gemini-provider.js";
import {
  TranslationDraftService,
  type SegmentInput,
} from "./translation-draft.service.js";

function segs(...items: Array<Partial<SegmentInput>>): SegmentInput[] {
  return items.map((p, i) => ({
    segmentId: p.segmentId ?? `seg-${i}`,
    order: p.order ?? i,
    kind: p.kind ?? "body",
    originalText: p.originalText ?? `text-${i}`,
  }));
}

function defaultBatch(inputs: BatchTranslationItem[]): BatchTranslationOutput {
  return {
    items: inputs.map((i) => ({ id: i.id, text: `번역:${i.text}` })),
    model: "gemini-2.5-flash",
    promptHash: "deadbeef",
    promptVersion: "translate.en-ko.v2",
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
  };
}

function defaultSingle(): TranslationOutput {
  return {
    text: "번역",
    model: "gemini-2.5-flash",
    promptHash: "deadbeef",
    promptVersion: "translate.en-ko.v1",
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
  };
}

function stubProvider(
  behavior: Partial<GeminiTranslationProvider> = {},
): GeminiTranslationProvider {
  return {
    isConfigured: () => true,
    translate: async () => defaultSingle(),
    translateBatch: async (inputs: BatchTranslationItem[]) => defaultBatch(inputs),
    ...behavior,
  } as unknown as GeminiTranslationProvider;
}

describe("TranslationDraftService.draftAll (batch chunks)", () => {
  it("returns skipped status and leaves originalText when provider is not configured", async () => {
    const provider = stubProvider({ isConfigured: () => false });
    const svc = new TranslationDraftService(provider, { minCallIntervalMs: 0 });
    const result = await svc.draftAll(segs({ originalText: "hi" }, { originalText: "bye" }));
    expect(result.status).toBe("skipped");
    expect(result.drafts[0]!.text).toBe("hi");
    expect(result.drafts[0]!.aiDraftText).toBeNull();
    expect(result.drafts[1]!.text).toBe("bye");
  });

  it("translates body/caption/footnote in a single chunk and passes references through verbatim", async () => {
    let batchCalls = 0;
    const provider = stubProvider({
      translateBatch: async (inputs) => {
        batchCalls += 1;
        return defaultBatch(inputs);
      },
    });
    const svc = new TranslationDraftService(provider, { minCallIntervalMs: 0 });
    const input = segs(
      { kind: "body", originalText: "body a" },
      { kind: "caption", originalText: "caption a" },
      { kind: "reference", originalText: "Smith, J. (2024)." },
      { kind: "footnote", originalText: "note a" },
    );
    const result = await svc.draftAll(input);
    expect(result.status).toBe("ok");
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    // reference 제외한 3개가 한 chunk로 갔어야 함.
    expect(batchCalls).toBe(1);
    const ref = result.drafts.find((d) => d.segmentId === "seg-2");
    expect(ref!.text).toBe("Smith, J. (2024).");
    expect(ref!.aiDraftText).toBeNull();
  });

  it("chunks translatable segments by chunkSize", async () => {
    const chunkCalls: Array<BatchTranslationItem[]> = [];
    const provider = stubProvider({
      translateBatch: async (inputs) => {
        chunkCalls.push(inputs);
        return defaultBatch(inputs);
      },
    });
    const svc = new TranslationDraftService(provider, {
      minCallIntervalMs: 0,
      chunkSize: 2,
    });
    const result = await svc.draftAll(
      segs(
        { originalText: "a" },
        { originalText: "b" },
        { originalText: "c" },
        { originalText: "d" },
        { originalText: "e" },
      ),
    );
    expect(result.status).toBe("ok");
    // 5개 → chunk 2+2+1 = 3 호출.
    expect(chunkCalls).toHaveLength(3);
    expect(chunkCalls[0]!.map((i) => i.id)).toEqual(["seg-0", "seg-1"]);
    expect(chunkCalls[2]!.map((i) => i.id)).toEqual(["seg-4"]);
  });

  it("falls back to per-segment calls when a chunk transient fails", async () => {
    let batchCalls = 0;
    let singleCalls = 0;
    const provider = stubProvider({
      translateBatch: async () => {
        batchCalls += 1;
        throw new TranslationProviderError("schema mismatch");
      },
      translate: async ({ text }) => {
        singleCalls += 1;
        if (text.includes("fail")) throw new TranslationProviderError("transient 5xx");
        return defaultSingle();
      },
    });
    const svc = new TranslationDraftService(provider, {
      minCallIntervalMs: 0,
      chunkSize: 8,
      rateLimitRetryDelayMs: 0,
    });
    const result = await svc.draftAll(
      segs(
        { originalText: "a" },
        { originalText: "b (will fail)" },
        { originalText: "c" },
      ),
    );
    expect(batchCalls).toBeGreaterThanOrEqual(1);
    expect(singleCalls).toBe(3);
    expect(result.status).toBe("partial");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.drafts[1]!.text).toBe("b (will fail)");
    expect(result.drafts[1]!.aiDraftText).toBeNull();
  });

  it("aborts remaining chunks when a permanent auth error surfaces on batch call", async () => {
    let batchCalls = 0;
    const provider = stubProvider({
      translateBatch: async () => {
        batchCalls += 1;
        throw new TranslationProviderError("Gemini responded with HTTP 401", {
          httpStatus: 401,
        });
      },
    });
    const svc = new TranslationDraftService(provider, {
      minCallIntervalMs: 0,
      chunkSize: 2,
    });
    const result = await svc.draftAll(
      segs(
        { originalText: "a" },
        { originalText: "b" },
        { originalText: "c" },
        { originalText: "d" },
      ),
    );
    expect(result.status).toBe("failed");
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(4);
    expect(batchCalls).toBe(1);
    for (const d of result.drafts) expect(d.aiDraftText).toBeNull();
  });

  it("retries once after a batch 429 and succeeds on second attempt", async () => {
    let batchCalls = 0;
    const provider = stubProvider({
      translateBatch: async (inputs) => {
        batchCalls += 1;
        if (batchCalls === 1) {
          throw new TranslationProviderError("Gemini responded with HTTP 429: quota", {
            httpStatus: 429,
          });
        }
        return defaultBatch(inputs);
      },
    });
    const svc = new TranslationDraftService(provider, {
      rateLimitRetryDelayMs: 0,
      minCallIntervalMs: 0,
    });
    const result = await svc.draftAll(segs({ originalText: "a" }, { originalText: "b" }));
    expect(result.status).toBe("ok");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    // chunk 1회 + 재시도 1회 = 2.
    expect(batchCalls).toBe(2);
  });

  it("stops calling the provider when batch 429 repeats on retry", async () => {
    let batchCalls = 0;
    const provider = stubProvider({
      translateBatch: async () => {
        batchCalls += 1;
        throw new TranslationProviderError("Gemini responded with HTTP 429: quota exceeded", {
          httpStatus: 429,
        });
      },
    });
    const svc = new TranslationDraftService(provider, {
      rateLimitRetryDelayMs: 0,
      minCallIntervalMs: 0,
      chunkSize: 2,
    });
    const result = await svc.draftAll(
      segs(
        { originalText: "a" },
        { originalText: "b" },
        { originalText: "c" },
        { originalText: "d" },
      ),
    );
    expect(result.status).toBe("failed");
    expect(result.failed).toBe(4);
    // 첫 chunk 시도 1 + 재시도 1 = 2. 이후 chunk는 provider 호출 없이 fallback.
    expect(batchCalls).toBe(2);
  });

  it("waits at least minCallIntervalMs between chunks", async () => {
    const callTimes: number[] = [];
    const provider = stubProvider({
      translateBatch: async (inputs) => {
        callTimes.push(Date.now());
        return defaultBatch(inputs);
      },
    });
    const interval = 50;
    const svc = new TranslationDraftService(provider, {
      minCallIntervalMs: interval,
      chunkSize: 1,
    });
    await svc.draftAll(segs({ originalText: "a" }, { originalText: "b" }));
    expect(callTimes).toHaveLength(2);
    const gap = callTimes[1]! - callTimes[0]!;
    expect(gap).toBeGreaterThanOrEqual(interval - 10);
  });

  it("retries a batch 503 with exponential backoff and succeeds on later attempt", async () => {
    let batchCalls = 0;
    const provider = stubProvider({
      translateBatch: async (inputs) => {
        batchCalls += 1;
        if (batchCalls <= 2) {
          throw new TranslationProviderError(
            `Gemini responded with HTTP 503: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}`,
            { httpStatus: 503 },
          );
        }
        return defaultBatch(inputs);
      },
    });
    const svc = new TranslationDraftService(provider, {
      minCallIntervalMs: 0,
      unavailableBackoffMs: [0, 0, 0],
    });
    const result = await svc.draftAll(segs({ originalText: "a" }, { originalText: "b" }));
    expect(result.status).toBe("ok");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    // 처음 2회 503 + 3회차 성공 = 총 3회.
    expect(batchCalls).toBe(3);
  });

  it("halts remaining chunks when 503 persists through all backoff attempts", async () => {
    let batchCalls = 0;
    const provider = stubProvider({
      translateBatch: async () => {
        batchCalls += 1;
        throw new TranslationProviderError("Gemini responded with HTTP 503: UNAVAILABLE", {
          httpStatus: 503,
        });
      },
    });
    const svc = new TranslationDraftService(provider, {
      minCallIntervalMs: 0,
      unavailableBackoffMs: [0, 0],
      chunkSize: 2,
    });
    const result = await svc.draftAll(
      segs(
        { originalText: "a" },
        { originalText: "b" },
        { originalText: "c" },
        { originalText: "d" },
      ),
    );
    expect(result.status).toBe("failed");
    expect(result.failed).toBe(4);
    // 첫 chunk: 초기 1회 + backoff 2회 = 3회. 이후 chunk는 provider 호출 없이 fallback.
    expect(batchCalls).toBe(3);
    for (const d of result.drafts) expect(d.aiDraftText).toBeNull();
  });

  it("honors Gemini retryAfterMs on first batch 429 before retrying", async () => {
    let batchCalls = 0;
    const retryAfter = 50;
    const provider = stubProvider({
      translateBatch: async (inputs) => {
        batchCalls += 1;
        if (batchCalls === 1) {
          throw new TranslationProviderError("Gemini responded with HTTP 429", {
            httpStatus: 429,
            retryAfterMs: retryAfter,
          });
        }
        return defaultBatch(inputs);
      },
    });
    const svc = new TranslationDraftService(provider, {
      rateLimitRetryDelayMs: 1,
      minCallIntervalMs: 0,
    });
    const start = Date.now();
    const result = await svc.draftAll(segs({ originalText: "a" }));
    const elapsed = Date.now() - start;
    expect(result.status).toBe("ok");
    expect(batchCalls).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(retryAfter - 10);
  });
});
