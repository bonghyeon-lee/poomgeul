import { GeminiTranslationProvider, TranslationProviderError } from "./gemini-provider.js";
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

function stubProvider(
  behavior: Partial<GeminiTranslationProvider>,
): GeminiTranslationProvider {
  return {
    isConfigured: () => true,
    translate: async () => ({
      text: "번역",
      model: "gemini-2.5-flash",
      promptHash: "deadbeef",
      promptVersion: "translate.en-ko.v1",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
    }),
    ...behavior,
  } as unknown as GeminiTranslationProvider;
}

describe("TranslationDraftService.draftAll", () => {
  it("returns skipped status and leaves originalText when provider is not configured", async () => {
    const provider = stubProvider({ isConfigured: () => false });
    const svc = new TranslationDraftService(provider);
    const result = await svc.draftAll(segs({ originalText: "hi" }, { originalText: "bye" }));
    expect(result.status).toBe("skipped");
    expect(result.drafts[0]!.text).toBe("hi");
    expect(result.drafts[0]!.aiDraftText).toBeNull();
    expect(result.drafts[1]!.text).toBe("bye");
  });

  it("translates body/caption/footnote but passes references through verbatim", async () => {
    let calls = 0;
    const provider = stubProvider({
      translate: async () => {
        calls += 1;
        return {
          text: `번역-${calls}`,
          model: "gemini-2.5-flash",
          promptHash: "deadbeef",
          promptVersion: "translate.en-ko.v1",
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
        };
      },
    });
    const svc = new TranslationDraftService(provider);
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
    // reference는 provider 호출 건너뜀
    expect(calls).toBe(3);
    const ref = result.drafts.find((d) => d.segmentId === "seg-2");
    expect(ref!.text).toBe("Smith, J. (2024).");
    expect(ref!.aiDraftText).toBeNull();
  });

  it("reports partial when some segments fail and keeps original text as fallback", async () => {
    let calls = 0;
    const provider = stubProvider({
      translate: async () => {
        calls += 1;
        if (calls === 2) throw new TranslationProviderError("transient 5xx");
        return {
          text: `번역-${calls}`,
          model: "gemini-2.5-flash",
          promptHash: "deadbeef",
          promptVersion: "translate.en-ko.v1",
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
        };
      },
    });
    const svc = new TranslationDraftService(provider);
    const result = await svc.draftAll(
      segs(
        { originalText: "a" },
        { originalText: "b (will fail)" },
        { originalText: "c" },
      ),
    );
    expect(result.status).toBe("partial");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.drafts[1]!.text).toBe("b (will fail)");
    expect(result.drafts[1]!.aiDraftText).toBeNull();
    expect(result.drafts[2]!.aiDraftText).toBe("번역-3");
  });

  it("aborts remaining segments when a permanent auth error surfaces", async () => {
    let calls = 0;
    const provider = stubProvider({
      translate: async () => {
        calls += 1;
        throw new TranslationProviderError("Gemini responded with HTTP 401", {
          httpStatus: 401,
        });
      },
    });
    const svc = new TranslationDraftService(provider);
    const result = await svc.draftAll(
      segs({ originalText: "a" }, { originalText: "b" }, { originalText: "c" }),
    );
    expect(result.status).toBe("failed");
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(3);
    // 영구 에러는 첫 실패 뒤 나머지 호출을 생략.
    expect(calls).toBe(1);
    // 전 세그먼트가 원문 유지로 채워짐.
    for (const d of result.drafts) expect(d.aiDraftText).toBeNull();
  });

  it("retries once after a 429 (rate limit) and succeeds on second attempt", async () => {
    let calls = 0;
    const provider = stubProvider({
      translate: async () => {
        calls += 1;
        if (calls === 1) {
          throw new TranslationProviderError("Gemini responded with HTTP 429: quota", {
            httpStatus: 429,
          });
        }
        return {
          text: "번역",
          model: "gemini-2.5-flash",
          promptHash: "deadbeef",
          promptVersion: "translate.en-ko.v1",
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
        };
      },
    });
    const svc = new TranslationDraftService(provider, { rateLimitRetryDelayMs: 0 });
    const result = await svc.draftAll(segs({ originalText: "a" }, { originalText: "b" }));
    expect(result.status).toBe("ok");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    // 첫 세그먼트에 1회 재시도 + 두 번째 세그먼트 1회 = 총 3 호출.
    expect(calls).toBe(3);
  });

  it("stops calling the provider when the retry after 429 also returns 429", async () => {
    let calls = 0;
    const provider = stubProvider({
      translate: async () => {
        calls += 1;
        throw new TranslationProviderError("Gemini responded with HTTP 429: quota exceeded", {
          httpStatus: 429,
        });
      },
    });
    const svc = new TranslationDraftService(provider, { rateLimitRetryDelayMs: 0 });
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
    // 첫 세그먼트에서 1번 + 재시도 1번 = 2회. 나머지 세그먼트는 provider 호출 없이 fallback.
    expect(calls).toBe(2);
    for (const d of result.drafts) expect(d.aiDraftText).toBeNull();
  });
});
