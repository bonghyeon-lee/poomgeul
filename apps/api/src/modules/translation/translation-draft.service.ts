import { Inject, Injectable, Logger } from "@nestjs/common";

import { GeminiTranslationProvider, TranslationProviderError } from "./gemini-provider.js";

type SegmentKind = "body" | "caption" | "footnote" | "reference";

export const TRANSLATION_PROVIDER = Symbol("TRANSLATION_PROVIDER");

export type SegmentInput = {
  segmentId: string;
  order: number;
  kind: SegmentKind;
  originalText: string;
};

export type DraftedSegment = {
  segmentId: string;
  /** 번역된 텍스트. 실패 시 원문을 그대로 담는다(스펙상 draft 값이 반드시 있어야 함). */
  text: string;
  /** 실제 AI가 만든 초벌. 번역 실패면 null로 두어 Reader UI가 '원문 유지' 상태임을 알 수 있게 한다. */
  aiDraftText: string | null;
  aiDraftSource: { model: string; promptHash: string; version: string } | null;
  /** 초벌 상태. 'unreviewed'는 LLM이 성공한 경우, 'unreviewed'로 둬도 되지만 UI가 참고할 수 있게 별도 필드. */
  status: "unreviewed";
};

export type DraftAllResult = {
  drafts: DraftedSegment[];
  /** 전체 초벌 결과 요약. */
  status: "ok" | "skipped" | "partial" | "failed";
  succeeded: number;
  failed: number;
};

export const RATE_LIMIT_RETRY_DELAY_MS = 8_000;

/**
 * 성공한 호출 사이 강제 최소 간격. Gemini Free tier의 RPM 15 상한을 보수적으로 지키려면
 * 호출 간 4초 이상(= 분당 15회 이하)가 되어야 한다. 지연 자체를 포함한 호출 주기가 이보다
 * 짧으면 추가 sleep으로 맞춘다.
 */
export const DEFAULT_MIN_CALL_INTERVAL_MS = 4_000;

/**
 * Segment[]를 받아 TranslationSegment INSERT 값을 돌려준다. LLM Provider가 설정되지
 * 않았거나 호출이 실패하면 원문을 text에 그대로 담고 aiDraftText는 null — Reader UI는
 * "(번역 대기)" 대신 원문을 보여주어 최소 가독성을 확보한다.
 *
 * reference 세그먼트는 번역하지 않는다(M0 #3 스펙: 참고문헌은 번역 진행도에서 제외).
 * body/caption/footnote만 LLM에 전달.
 *
 * Rate limit(429) 처리:
 *   - 첫 번째 429: 짧은 backoff 후 1회 재시도.
 *   - 두 번째 429(또는 배치 중 반복 감지): "rate-limited" 플래그를 세우고 이후 세그먼트는
 *     provider를 부르지 않고 원문 유지로 빠르게 채운다. Free tier의 분당 쿼터가 탔을 때
 *     연속으로 더 때려봐야 모두 실패라 의미 없고, 일일 쿼터가 탔다면 더더욱 그렇다.
 */
@Injectable()
export class TranslationDraftService {
  private readonly logger = new Logger(TranslationDraftService.name);
  private readonly retryDelayMs: number;
  private readonly minCallIntervalMs: number;

  constructor(
    @Inject(TRANSLATION_PROVIDER)
    private readonly provider: GeminiTranslationProvider,
    options?: { rateLimitRetryDelayMs?: number; minCallIntervalMs?: number },
  ) {
    this.retryDelayMs = options?.rateLimitRetryDelayMs ?? RATE_LIMIT_RETRY_DELAY_MS;
    this.minCallIntervalMs = options?.minCallIntervalMs ?? DEFAULT_MIN_CALL_INTERVAL_MS;
  }

  async draftAll(segments: SegmentInput[]): Promise<DraftAllResult> {
    if (!this.provider.isConfigured()) {
      this.logger.warn(
        "translation provider not configured; skipping draft generation (segments will keep original text)",
      );
      return {
        drafts: segments.map((s) => fallbackDraft(s)),
        status: "skipped",
        succeeded: 0,
        failed: 0,
      };
    }

    let succeeded = 0;
    let failed = 0;
    let rateLimited = false;
    let permanentErr = false;
    let lastCallFinishedAt = 0;
    const drafts: DraftedSegment[] = [];

    for (const seg of segments) {
      if (seg.kind === "reference") {
        drafts.push(fallbackDraft(seg));
        continue;
      }

      // 앞선 세그먼트에서 rate limit / permanent error를 만났다면 provider를 더 부르지 않는다.
      if (rateLimited || permanentErr) {
        drafts.push(fallbackDraft(seg));
        failed += 1;
        continue;
      }

      // RPM 상한 준수: 직전 호출 종료 후 minCallIntervalMs 이상 지날 때까지 기다린다.
      if (this.minCallIntervalMs > 0 && lastCallFinishedAt > 0) {
        const elapsed = Date.now() - lastCallFinishedAt;
        const slack = this.minCallIntervalMs - elapsed;
        if (slack > 0) await sleep(slack);
      }

      const outcome = await this.translateWithRetry(seg);
      lastCallFinishedAt = Date.now();
      switch (outcome.kind) {
        case "ok":
          drafts.push({
            segmentId: seg.segmentId,
            text: outcome.text,
            aiDraftText: outcome.text,
            aiDraftSource: outcome.source,
            status: "unreviewed",
          });
          succeeded += 1;
          break;
        case "rate-limited":
          drafts.push(fallbackDraft(seg));
          failed += 1;
          rateLimited = true;
          // 한 번만 사용자에게 알리는 수준으로 경고.
          this.logger.warn(
            `rate limit (HTTP 429) hit at segment order=${seg.order}; remaining ${
              segments.length - segments.indexOf(seg) - 1
            } segment(s) will keep original text without further calls`,
          );
          break;
        case "permanent":
          drafts.push(fallbackDraft(seg));
          failed += 1;
          permanentErr = true;
          this.logger.warn(
            `permanent provider error at segment order=${seg.order}; aborting remaining calls in this batch`,
          );
          break;
        case "transient":
          drafts.push(fallbackDraft(seg));
          failed += 1;
          this.logger.warn(
            `draft failed for segment ${seg.segmentId} (order=${seg.order}, kind=${seg.kind}): ${outcome.message}`,
          );
          break;
      }
    }

    const translatable = segments.filter((s) => s.kind !== "reference").length;
    let status: "ok" | "partial" | "failed";
    if (translatable === 0) {
      status = "ok";
    } else if (failed === 0) {
      status = "ok";
    } else if (succeeded === 0) {
      status = "failed";
    } else {
      status = "partial";
    }

    return { drafts, status, succeeded, failed };
  }

  private async translateWithRetry(seg: SegmentInput): Promise<
    | {
        kind: "ok";
        text: string;
        source: { model: string; promptHash: string; version: string };
      }
    | { kind: "rate-limited"; message: string }
    | { kind: "permanent"; message: string }
    | { kind: "transient"; message: string }
  > {
    try {
      const out = await this.provider.translate({ text: seg.originalText });
      return {
        kind: "ok",
        text: out.text,
        source: { model: out.model, promptHash: out.promptHash, version: out.promptVersion },
      };
    } catch (err) {
      if (err instanceof TranslationProviderError && err.isRateLimited) {
        // 첫 429: provider가 준 retryDelay를 우선 존중, 없으면 기본 backoff.
        const waitMs = err.retryAfterMs ?? this.retryDelayMs;
        this.logger.warn(
          `rate limit on first attempt for segment order=${seg.order}; backing off ${waitMs}ms ${err.retryAfterMs !== undefined ? "(retryDelay from Gemini)" : "(default)"} and retrying once`,
        );
        await sleep(waitMs);
        try {
          const retry = await this.provider.translate({ text: seg.originalText });
          return {
            kind: "ok",
            text: retry.text,
            source: {
              model: retry.model,
              promptHash: retry.promptHash,
              version: retry.promptVersion,
            },
          };
        } catch (retryErr) {
          const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (retryErr instanceof TranslationProviderError && retryErr.isRateLimited) {
            return { kind: "rate-limited", message: msg };
          }
          if (retryErr instanceof TranslationProviderError && retryErr.isPermanent) {
            return { kind: "permanent", message: msg };
          }
          return { kind: "transient", message: msg };
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof TranslationProviderError && err.isPermanent) {
        return { kind: "permanent", message };
      }
      return { kind: "transient", message };
    }
  }
}

function fallbackDraft(seg: SegmentInput): DraftedSegment {
  return {
    segmentId: seg.segmentId,
    text: seg.originalText,
    aiDraftText: null,
    aiDraftSource: null,
    status: "unreviewed",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
