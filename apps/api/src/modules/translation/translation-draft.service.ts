import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  type BatchTranslationItem,
  GeminiTranslationProvider,
  TranslationProviderError,
} from "./gemini-provider.js";

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
  /** 실제 AI가 만든 초벌. 번역 실패면 null. */
  aiDraftText: string | null;
  aiDraftSource: { model: string; promptHash: string; version: string } | null;
  status: "unreviewed";
};

export type DraftAllResult = {
  drafts: DraftedSegment[];
  status: "ok" | "skipped" | "partial" | "failed";
  succeeded: number;
  failed: number;
};

export const RATE_LIMIT_RETRY_DELAY_MS = 8_000;

/**
 * 묶음 호출 사이 강제 최소 간격. Gemini Free tier RPM 15를 보수적으로 지키려면 호출 간
 * 4s 이상. chunk 8개짜리 호출이면 분당 15회여도 세그먼트 120개/분 처리 가능.
 */
export const DEFAULT_MIN_CALL_INTERVAL_MS = 4_000;

/** 묶음 번역의 기본 chunk 크기. 너무 크면 모델이 포맷을 흐리고, 너무 작으면 호출 수 이득이 줄어든다. */
export const DEFAULT_CHUNK_SIZE = 8;

/**
 * Segment[]를 받아 묶음(batch) 번역을 돌려 TranslationSegment INSERT 값을 돌려준다.
 *
 * 전략:
 *   1) reference는 번역하지 않고 원문 유지. 나머지(body/caption/footnote)를 인접 순서대로
 *      chunk(기본 8개)로 묶어 GeminiTranslationProvider.translateBatch 호출.
 *   2) chunk 성공 → 각 id의 응답을 그대로 draft로 채움.
 *   3) chunk 실패(transient) → chunk 내 세그먼트를 개별 translate()로 재시도. 한 세그먼트가
 *      실패해도 나머지는 살릴 수 있어 "하나 때문에 8개가 전부 원문 유지"가 되는 건 피한다.
 *   4) rate-limited / permanent 에러는 배치 중단 플래그를 세우고 남은 chunk는 원문 유지로.
 *   5) chunk 사이 minCallIntervalMs 강제. chunk 내부의 개별 fallback 호출도 같은 간격 준수.
 */
@Injectable()
export class TranslationDraftService {
  private readonly logger = new Logger(TranslationDraftService.name);
  private readonly retryDelayMs: number;
  private readonly minCallIntervalMs: number;
  private readonly chunkSize: number;

  constructor(
    @Inject(TRANSLATION_PROVIDER)
    private readonly provider: GeminiTranslationProvider,
    options?: {
      rateLimitRetryDelayMs?: number;
      minCallIntervalMs?: number;
      chunkSize?: number;
    },
  ) {
    this.retryDelayMs = options?.rateLimitRetryDelayMs ?? RATE_LIMIT_RETRY_DELAY_MS;
    this.minCallIntervalMs = options?.minCallIntervalMs ?? DEFAULT_MIN_CALL_INTERVAL_MS;
    this.chunkSize = Math.max(1, options?.chunkSize ?? DEFAULT_CHUNK_SIZE);
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

    // 출력은 입력과 같은 순서로 유지. reference는 아예 호출 안 하므로 자리에 fallback을 바로 넣는다.
    const bySegmentId = new Map<string, DraftedSegment>();
    const translatable: SegmentInput[] = [];
    for (const seg of segments) {
      if (seg.kind === "reference") {
        bySegmentId.set(seg.segmentId, fallbackDraft(seg));
      } else {
        translatable.push(seg);
      }
    }

    let succeeded = 0;
    let failed = 0;
    let rateLimited = false;
    let permanentErr = false;
    let lastCallFinishedAt = 0;

    // chunk 루프.
    for (let i = 0; i < translatable.length; i += this.chunkSize) {
      const chunk = translatable.slice(i, i + this.chunkSize);

      if (rateLimited || permanentErr) {
        for (const seg of chunk) {
          bySegmentId.set(seg.segmentId, fallbackDraft(seg));
          failed += 1;
        }
        continue;
      }

      if (this.minCallIntervalMs > 0 && lastCallFinishedAt > 0) {
        const slack = this.minCallIntervalMs - (Date.now() - lastCallFinishedAt);
        if (slack > 0) await sleep(slack);
      }

      const outcome = await this.translateChunkWithRetry(chunk);
      lastCallFinishedAt = Date.now();

      if (outcome.kind === "ok") {
        for (const item of outcome.items) {
          const seg = chunk.find((s) => s.segmentId === item.id);
          if (!seg) continue; // provider 검증에서 id 집합 일치를 보장하지만 방어적.
          bySegmentId.set(seg.segmentId, {
            segmentId: seg.segmentId,
            text: item.text,
            aiDraftText: item.text,
            aiDraftSource: outcome.source,
            status: "unreviewed",
          });
          succeeded += 1;
        }
        continue;
      }

      if (outcome.kind === "rate-limited") {
        this.logger.warn(
          `rate limit (HTTP 429) hit at chunk starting order=${chunk[0]!.order}; remaining ${
            translatable.length - i - chunk.length
          } translatable segment(s) will keep original text`,
        );
        rateLimited = true;
        for (const seg of chunk) {
          bySegmentId.set(seg.segmentId, fallbackDraft(seg));
          failed += 1;
        }
        continue;
      }

      if (outcome.kind === "permanent") {
        this.logger.warn(
          `permanent provider error at chunk starting order=${chunk[0]!.order}; aborting remaining chunks`,
        );
        permanentErr = true;
        for (const seg of chunk) {
          bySegmentId.set(seg.segmentId, fallbackDraft(seg));
          failed += 1;
        }
        continue;
      }

      // transient/schema/misc 실패 → chunk 안의 세그먼트를 개별 translate()로 살려본다.
      this.logger.warn(
        `chunk translate failed at order=${chunk[0]!.order}: ${outcome.message}; falling back to per-segment calls`,
      );
      for (const seg of chunk) {
        if (rateLimited || permanentErr) {
          bySegmentId.set(seg.segmentId, fallbackDraft(seg));
          failed += 1;
          continue;
        }
        if (this.minCallIntervalMs > 0 && lastCallFinishedAt > 0) {
          const slack = this.minCallIntervalMs - (Date.now() - lastCallFinishedAt);
          if (slack > 0) await sleep(slack);
        }
        const singleOutcome = await this.translateSingleWithRetry(seg);
        lastCallFinishedAt = Date.now();
        if (singleOutcome.kind === "ok") {
          bySegmentId.set(seg.segmentId, {
            segmentId: seg.segmentId,
            text: singleOutcome.text,
            aiDraftText: singleOutcome.text,
            aiDraftSource: singleOutcome.source,
            status: "unreviewed",
          });
          succeeded += 1;
        } else {
          bySegmentId.set(seg.segmentId, fallbackDraft(seg));
          failed += 1;
          if (singleOutcome.kind === "rate-limited") {
            rateLimited = true;
            this.logger.warn(
              `rate limit on single fallback at order=${seg.order}; remaining calls halted`,
            );
          } else if (singleOutcome.kind === "permanent") {
            permanentErr = true;
            this.logger.warn(
              `permanent error on single fallback at order=${seg.order}; aborting`,
            );
          } else {
            this.logger.warn(
              `single-fallback failed for order=${seg.order}: ${singleOutcome.message}`,
            );
          }
        }
      }
    }

    // 입력 순서 유지한 drafts 배열 조립.
    const drafts: DraftedSegment[] = segments.map(
      (seg) => bySegmentId.get(seg.segmentId) ?? fallbackDraft(seg),
    );

    const translatableCount = translatable.length;
    let status: "ok" | "partial" | "failed";
    if (translatableCount === 0) status = "ok";
    else if (failed === 0) status = "ok";
    else if (succeeded === 0) status = "failed";
    else status = "partial";

    return { drafts, status, succeeded, failed };
  }

  private async translateChunkWithRetry(chunk: SegmentInput[]): Promise<
    | {
        kind: "ok";
        items: BatchTranslationItem[];
        source: { model: string; promptHash: string; version: string };
      }
    | { kind: "rate-limited"; message: string }
    | { kind: "permanent"; message: string }
    | { kind: "transient"; message: string }
  > {
    const inputs: BatchTranslationItem[] = chunk.map((s) => ({
      id: s.segmentId,
      text: s.originalText,
    }));
    try {
      const out = await this.provider.translateBatch(inputs);
      return {
        kind: "ok",
        items: out.items,
        source: { model: out.model, promptHash: out.promptHash, version: out.promptVersion },
      };
    } catch (err) {
      if (err instanceof TranslationProviderError && err.isRateLimited) {
        const waitMs = err.retryAfterMs ?? this.retryDelayMs;
        this.logger.warn(
          `rate limit on batch; backing off ${waitMs}ms ${err.retryAfterMs !== undefined ? "(retryDelay from Gemini)" : "(default)"} and retrying once`,
        );
        await sleep(waitMs);
        try {
          const retry = await this.provider.translateBatch(inputs);
          return {
            kind: "ok",
            items: retry.items,
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

  private async translateSingleWithRetry(seg: SegmentInput): Promise<
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
        const waitMs = err.retryAfterMs ?? this.retryDelayMs;
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
