import { Injectable, Logger } from "@nestjs/common";

import {
  type BatchTranslationItem,
  type BatchTranslationOutput,
  TranslationProviderError,
  type TranslationOutput,
  type TranslationRequest,
} from "./gemini-provider.js";
import { loadPrompt, type LoadedPrompt } from "./prompt-loader.js";
import type { TranslationProvider } from "./translation-provider.js";

/**
 * OpenRouter 기반 번역 프로바이더. Gemini가 quota/permanent 에러를 내면 Cascade가
 * 이 프로바이더로 폴백해 무료 tier(:free suffix 슬레이트)로 호출한다.
 *
 * OpenRouter는 OpenAI 호환 chat/completions 엔드포인트를 제공한다. Gemini의
 * `responseSchema`는 없으므로 batch 경로에서는 프롬프트(v2)에 이미 들어 있는
 * "JSON 배열만 돌려라" 계약에 의존해 JSON.parse로 파싱한다. 실패 시
 * TranslationProviderError.
 *
 * 기본 모델은 env `LLM_FALLBACK_MODEL`, 미설정 시 `google/gemma-2-9b-it:free`.
 * OpenRouter의 free slate는 때때로 바뀌므로 사용자가 .env로 바꿀 수 있게 뒀다.
 */

// OpenRouter free slate는 공급자(provider)별로 바뀌고 가용성이 유동적.
// 2026-04 시점엔 `google/gemma-3-27b-it:free`가 안정적이고 한국어 품질이
// 괜찮다. 404("No endpoints found") 또는 400("Developer instruction is not
// enabled") 같은 에러가 나오면 `GET https://openrouter.ai/api/v1/models`에서
// 현재 유효한 `:free` slug를 확인하고 LLM_FALLBACK_MODEL로 교체한다.
const DEFAULT_MODEL = "google/gemma-3-27b-it:free";
const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60_000;
const PROMPT_FILE_SINGLE = "translate.en-ko.v1.md";
const PROMPT_FILE_BATCH = "translate.en-ko.v2.md";

type OpenRouterResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: number };
};

@Injectable()
export class OpenRouterTranslationProvider implements TranslationProvider {
  private readonly logger = new Logger(OpenRouterTranslationProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly promptCache = new Map<string, LoadedPrompt>();
  private readonly referer: string;
  private readonly appTitle: string;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    endpoint?: string;
    timeoutMs?: number;
    referer?: string;
    appTitle?: string;
  }) {
    this.apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY;
    // .env의 LLM_FALLBACK_MODEL이 최우선. LLM_BUDGET_MODEL은 M0 초기 의도(cascade tier)라
    // 폴백과 의미가 다르므로 일부러 연결하지 않는다.
    this.model = options?.model ?? process.env.LLM_FALLBACK_MODEL ?? DEFAULT_MODEL;
    this.endpoint = options?.endpoint ?? process.env.OPENROUTER_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.timeoutMs =
      options?.timeoutMs ?? Number(process.env.OPENROUTER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    // OpenRouter는 HTTP-Referer/X-Title을 추천 — ranking/attribution 용도.
    this.referer = options?.referer ?? process.env.WEB_BASE_URL ?? "http://localhost:3001";
    this.appTitle = options?.appTitle ?? "poomgeul";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async translate(req: TranslationRequest): Promise<TranslationOutput> {
    if (!this.apiKey) {
      throw new TranslationProviderError(
        "OPENROUTER_API_KEY is not set; cannot use OpenRouter fallback.",
      );
    }
    const prompt = this.getPrompt(PROMPT_FILE_SINGLE);
    const body = {
      model: this.model,
      temperature: prompt.frontmatter.temperature ?? 0.2,
      max_tokens: prompt.frontmatter.maxOutputTokens ?? 8192,
      // Gemma-3 같은 Google 백엔드 경유 모델은 OpenAI-호환 `system` role을 받지 않는다
      // ("Developer instruction is not enabled"로 400을 돌려준다). 어떤 백엔드로
      // 라우팅되든 동작하도록 system + user를 단일 user 메시지로 병합한다.
      messages: [{ role: "user", content: mergeSystemWithUser(prompt.body, req.text) }],
    };

    const { payload, latencyMs } = await this.postChat(body, "translate");
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new TranslationProviderError(
        `OpenRouter returned no message content (finish=${payload.choices?.[0]?.finish_reason ?? "?"})`,
      );
    }
    return {
      text: content.trim(),
      model: this.model,
      promptHash: prompt.hash,
      promptVersion: prompt.versionId,
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      latencyMs,
    };
  }

  async translateBatch(inputs: BatchTranslationItem[]): Promise<BatchTranslationOutput> {
    if (!this.apiKey) {
      throw new TranslationProviderError(
        "OPENROUTER_API_KEY is not set; cannot use OpenRouter fallback.",
      );
    }
    if (inputs.length === 0) {
      throw new TranslationProviderError("translateBatch called with empty inputs");
    }
    const prompt = this.getPrompt(PROMPT_FILE_BATCH);
    const userPayload = JSON.stringify(inputs.map((it) => ({ id: it.id, text: it.text })));
    const body = {
      model: this.model,
      temperature: prompt.frontmatter.temperature ?? 0.2,
      max_tokens: prompt.frontmatter.maxOutputTokens ?? 32_768,
      // single과 동일하게 system + user 페이로드를 병합. v2 프롬프트가 이미
      // JSON-array 응답 계약을 담고 있어 response_format은 강제하지 않고 파싱
      // 사후검증으로 처리.
      messages: [{ role: "user", content: mergeSystemWithUser(prompt.body, userPayload) }],
    };

    const { payload, latencyMs } = await this.postChat(body, "translateBatch");
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new TranslationProviderError(
        `OpenRouter batch returned no message content (finish=${payload.choices?.[0]?.finish_reason ?? "?"})`,
      );
    }

    const parsed = parseBatchResponse(content);
    if (!parsed) {
      throw new TranslationProviderError(
        `OpenRouter batch returned non-JSON content (first 120 chars: ${content.slice(0, 120)})`,
      );
    }

    // id 집합 일치 검증 — Gemini 쪽 구현과 동일 계약.
    const inputIds = new Set(inputs.map((i) => i.id));
    if (parsed.length !== inputs.length) {
      throw new TranslationProviderError(
        `OpenRouter batch size mismatch: sent ${inputs.length} got ${parsed.length}`,
      );
    }
    for (const r of parsed) {
      if (!inputIds.has(r.id)) {
        throw new TranslationProviderError(`OpenRouter batch returned unknown id=${r.id}`);
      }
    }

    return {
      items: parsed,
      model: this.model,
      promptHash: prompt.hash,
      promptVersion: prompt.versionId,
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      latencyMs,
    };
  }

  private async postChat(
    body: unknown,
    kind: "translate" | "translateBatch",
  ): Promise<{ payload: OpenRouterResponse; latencyMs: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": this.referer,
          "X-Title": this.appTitle,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TranslationProviderError(
          `OpenRouter ${kind} timed out after ${this.timeoutMs}ms`,
          { cause: err },
        );
      }
      throw new TranslationProviderError(`OpenRouter ${kind} request failed`, { cause: err });
    }
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new TranslationProviderError(
        `OpenRouter responded with HTTP ${res.status}: ${text.slice(0, 200)}`,
        { httpStatus: res.status },
      );
    }
    const payload = (await res.json()) as OpenRouterResponse;
    if (payload.error) {
      throw new TranslationProviderError(
        `OpenRouter API error: ${payload.error.message ?? "unknown"}`,
        { httpStatus: payload.error.code },
      );
    }
    this.logger.log(
      `openrouter ${kind} ok · model=${this.model} · in=${payload.usage?.prompt_tokens ?? "?"} out=${payload.usage?.completion_tokens ?? "?"} · ${latencyMs}ms`,
    );
    return { payload, latencyMs };
  }

  private getPrompt(file: string): LoadedPrompt {
    let cached = this.promptCache.get(file);
    if (!cached) {
      cached = loadPrompt(file);
      this.promptCache.set(file, cached);
    }
    return cached;
  }
}

/**
 * system prompt와 user 페이로드를 한 user 메시지로 병합. Google AI Studio 경유
 * 모델(Gemma-3 계열)은 OpenAI-호환 `system` role을 받지 않고 400을 돌려주기
 * 때문에, OpenRouter에서 어떤 백엔드로 라우팅되든 동작하도록 단일 user로 보낸다.
 * 경계가 모호해지지 않도록 명확한 구분선을 넣는다.
 */
function mergeSystemWithUser(systemPrompt: string, userContent: string): string {
  return `${systemPrompt}\n\n---\n\n${userContent}`;
}

/**
 * Gemini와 달리 OpenRouter는 JSON 강제가 provider-dependent. 모델이 앞뒤에
 * markdown fence나 설명을 붙이면 JSON.parse가 깨진다. 대표 패턴만 벗겨본다.
 */
function parseBatchResponse(raw: string): BatchTranslationItem[] | null {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const data = JSON.parse(stripped) as unknown;
    if (!Array.isArray(data)) return null;
    const out: BatchTranslationItem[] = [];
    for (const row of data) {
      if (
        !row ||
        typeof row !== "object" ||
        typeof (row as { id?: unknown }).id !== "string" ||
        typeof (row as { text?: unknown }).text !== "string"
      ) {
        return null;
      }
      out.push({ id: (row as { id: string }).id, text: (row as { text: string }).text });
    }
    return out;
  } catch {
    return null;
  }
}
