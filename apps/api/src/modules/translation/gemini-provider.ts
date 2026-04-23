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
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TranslationProviderError";
    this.cause = cause;
  }
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

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 30_000;
const PROMPT_FILE = "translate.en-ko.v1.md";

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
  private cachedPrompt: LoadedPrompt | null = null;

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

    const prompt = this.getPrompt();
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
          err,
        );
      }
      throw new TranslationProviderError("Gemini request failed", err);
    }
    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new TranslationProviderError(
        `Gemini responded with HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const payload = (await res.json()) as GeminiResponse;
    if (payload.error) {
      throw new TranslationProviderError(
        `Gemini API error: ${payload.error.message ?? payload.error.status ?? "unknown"}`,
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

  private getPrompt(): LoadedPrompt {
    if (!this.cachedPrompt) {
      this.cachedPrompt = loadPrompt(PROMPT_FILE);
    }
    return this.cachedPrompt;
  }
}
