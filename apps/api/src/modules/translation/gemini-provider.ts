import { Injectable, Logger } from "@nestjs/common";

import { loadPrompt, type LoadedPrompt } from "./prompt-loader.js";

/**
 * Gemini 2.5 Flash 기반 번역 프로바이더.
 *
 * 공식 REST API(generativelanguage.googleapis.com)를 직접 호출한다. SDK 의존성을
 * 추가하지 않아 dev 셋업이 가볍다. 4-tier Cascade의 Free 경로만 담당하며, Budget
 * 폴백이나 batch API는 이후 ADR-0002 확장에서 붙인다.
 *
 * 데이터 경계: policy/licensing.md §10.5의 "무료 tier에 기여자 편집 본문 금지"는
 * 호출 전 상위 레이어가 검증해야 한다. 여기서는 공개 원문 세그먼트만 들어온다는
 * 전제로 동작.
 */

export class TranslationProviderError extends Error {
  override readonly cause?: unknown;
  readonly httpStatus?: number;
  /** Gemini RetryInfo.retryDelay가 응답에 들어있으면 그 값(ms). 없으면 undefined. */
  readonly retryAfterMs?: number;
  constructor(
    message: string,
    opts?: { cause?: unknown; httpStatus?: number; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "TranslationProviderError";
    this.cause = opts?.cause;
    this.httpStatus = opts?.httpStatus;
    this.retryAfterMs = opts?.retryAfterMs;
  }

  /** 429 또는 메시지에 quota/rate 포함. 429 본문이 "exceeded your current quota"인 경우 등. */
  get isRateLimited(): boolean {
    if (this.httpStatus === 429) return true;
    return /rate limit|quota|exceeded your current/i.test(this.message);
  }

  /** 401/403처럼 당장 재시도해도 의미 없는 종류. 429는 별도 취급이라 permanent가 아님. */
  get isPermanent(): boolean {
    if (this.httpStatus === 401 || this.httpStatus === 403) return true;
    return /API key|permission|invalid argument|unauthorized/i.test(this.message);
  }
}

/**
 * Gemini error body 안의 RetryInfo.retryDelay("40s" 또는 "40.5s")를 ms로 파싱.
 * 못 찾으면 undefined.
 */
export function parseGeminiRetryDelay(rawBody: string): number | undefined {
  // body는 보통 JSON이지만 일부 경로는 plain text로 온다. 정규식이 양쪽 다 처리.
  const match = rawBody.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.round(seconds * 1000);
}

export type TranslationRequest = {
  /** 원문 텍스트. 단일 세그먼트. */
  text: string;
};

export type TranslationOutput = {
  text: string;
  model: string;
  promptHash: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

export type BatchTranslationItem = { id: string; text: string };

export type BatchTranslationOutput = {
  /** 입력 id와 동일한 집합, 동일한 순서로 돌려준다. */
  items: BatchTranslationItem[];
  model: string;
  promptHash: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 60_000;
const PROMPT_FILE_SINGLE = "translate.en-ko.v1.md";
const PROMPT_FILE_BATCH = "translate.en-ko.v2.md";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string; code?: number };
};

@Injectable()
export class GeminiTranslationProvider {
  private readonly logger = new Logger(GeminiTranslationProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly promptCache = new Map<string, LoadedPrompt>();

  constructor(options?: {
    apiKey?: string;
    model?: string;
    endpoint?: string;
    timeoutMs?: number;
  }) {
    this.apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    this.endpoint = options?.endpoint ?? process.env.GEMINI_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.timeoutMs =
      options?.timeoutMs ?? Number(process.env.GEMINI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async translate(req: TranslationRequest): Promise<TranslationOutput> {
    if (!this.apiKey) {
      throw new TranslationProviderError(
        "GEMINI_API_KEY is not set; cannot call Gemini. Set it in the root .env or skip drafting.",
      );
    }

    const prompt = this.getPrompt(PROMPT_FILE_SINGLE);
    const url = `${this.endpoint}/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;
    const body = {
      systemInstruction: {
        parts: [{ text: prompt.body }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: req.text }],
        },
      ],
      generationConfig: {
        temperature: prompt.frontmatter.temperature ?? 0.2,
        maxOutputTokens: prompt.frontmatter.maxOutputTokens ?? 8192,
        responseMimeType: "text/plain",
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TranslationProviderError(
          `Gemini request timed out after ${this.timeoutMs}ms`,
          { cause: err },
        );
      }
      throw new TranslationProviderError("Gemini request failed", { cause: err });
    }
    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const retryAfterMs = res.status === 429 ? parseGeminiRetryDelay(text) : undefined;
      throw new TranslationProviderError(
        `Gemini responded with HTTP ${res.status}: ${text.slice(0, 200)}`,
        { httpStatus: res.status, retryAfterMs },
      );
    }

    const payload = (await res.json()) as GeminiResponse;
    if (payload.error) {
      throw new TranslationProviderError(
        `Gemini API error: ${payload.error.message ?? payload.error.status ?? "unknown"}`,
        { httpStatus: payload.error.code },
      );
    }

    const candidate = payload.candidates?.[0];
    const output = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!output) {
      throw new TranslationProviderError(
        `Gemini returned no candidate text (finishReason=${candidate?.finishReason ?? "unknown"})`,
      );
    }

    this.logger.log(
      `gemini translate ok · model=${this.model} · in=${payload.usageMetadata?.promptTokenCount ?? "?"} out=${payload.usageMetadata?.candidatesTokenCount ?? "?"} · ${latencyMs}ms`,
    );

    return {
      text: output,
      model: this.model,
      promptHash: prompt.hash,
      promptVersion: prompt.versionId,
      inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
      latencyMs,
    };
  }

  /**
   * 여러 세그먼트를 한 요청에 묶어 번역한다. v2 프롬프트와 JSON schema로 구조화 응답을 강제.
   * id 집합이 달라지거나 배열이 아니거나 JSON 파싱 실패면 TranslationProviderError를 던진다.
   */
  async translateBatch(inputs: BatchTranslationItem[]): Promise<BatchTranslationOutput> {
    if (!this.apiKey) {
      throw new TranslationProviderError(
        "GEMINI_API_KEY is not set; cannot call Gemini. Set it in the root .env or skip drafting.",
      );
    }
    if (inputs.length === 0) {
      throw new TranslationProviderError("translateBatch called with empty inputs");
    }

    const prompt = this.getPrompt(PROMPT_FILE_BATCH);
    const url = `${this.endpoint}/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;

    const userPayload = JSON.stringify(
      inputs.map((it) => ({ id: it.id, text: it.text })),
    );

    const body = {
      systemInstruction: { parts: [{ text: prompt.body }] },
      contents: [{ role: "user", parts: [{ text: userPayload }] }],
      generationConfig: {
        temperature: prompt.frontmatter.temperature ?? 0.2,
        maxOutputTokens: prompt.frontmatter.maxOutputTokens ?? 32_768,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              text: { type: "STRING" },
            },
            required: ["id", "text"],
          },
        },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TranslationProviderError(
          `Gemini batch request timed out after ${this.timeoutMs}ms`,
          { cause: err },
        );
      }
      throw new TranslationProviderError("Gemini batch request failed", { cause: err });
    }
    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const retryAfterMs = res.status === 429 ? parseGeminiRetryDelay(text) : undefined;
      throw new TranslationProviderError(
        `Gemini responded with HTTP ${res.status}: ${text.slice(0, 200)}`,
        { httpStatus: res.status, retryAfterMs },
      );
    }

    const payload = (await res.json()) as GeminiResponse;
    if (payload.error) {
      throw new TranslationProviderError(
        `Gemini API error: ${payload.error.message ?? payload.error.status ?? "unknown"}`,
        { httpStatus: payload.error.code },
      );
    }

    const candidate = payload.candidates?.[0];
    const rawText = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!rawText) {
      throw new TranslationProviderError(
        `Gemini returned no candidate text (finishReason=${candidate?.finishReason ?? "unknown"})`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      throw new TranslationProviderError(
        `Gemini batch response was not valid JSON: ${rawText.slice(0, 200)}`,
        { cause: err },
      );
    }

    if (!Array.isArray(parsed)) {
      throw new TranslationProviderError(
        `Gemini batch response was not a JSON array (got ${typeof parsed})`,
      );
    }

    const items: BatchTranslationItem[] = [];
    for (const el of parsed) {
      if (
        !el ||
        typeof el !== "object" ||
        typeof (el as Record<string, unknown>).id !== "string" ||
        typeof (el as Record<string, unknown>).text !== "string"
      ) {
        throw new TranslationProviderError(
          `Gemini batch response item missing id/text: ${JSON.stringify(el).slice(0, 120)}`,
        );
      }
      items.push({
        id: (el as { id: string }).id,
        text: (el as { text: string }).text,
      });
    }

    const expectedIds = new Set(inputs.map((it) => it.id));
    const receivedIds = new Set(items.map((it) => it.id));
    if (expectedIds.size !== receivedIds.size) {
      throw new TranslationProviderError(
        `Gemini batch id count mismatch: expected ${expectedIds.size}, got ${receivedIds.size}`,
      );
    }
    for (const id of expectedIds) {
      if (!receivedIds.has(id)) {
        throw new TranslationProviderError(
          `Gemini batch missing id ${id} in response`,
        );
      }
    }

    this.logger.log(
      `gemini batch ok · items=${items.length} · in=${payload.usageMetadata?.promptTokenCount ?? "?"} out=${payload.usageMetadata?.candidatesTokenCount ?? "?"} · ${latencyMs}ms`,
    );

    return {
      items,
      model: this.model,
      promptHash: prompt.hash,
      promptVersion: prompt.versionId,
      inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
      latencyMs,
    };
  }

  private getPrompt(filename: string): LoadedPrompt {
    const cached = this.promptCache.get(filename);
    if (cached) return cached;
    const loaded = loadPrompt(filename);
    this.promptCache.set(filename, loaded);
    return loaded;
  }
}
