import { Logger } from "@nestjs/common";

import {
  type BatchTranslationItem,
  type BatchTranslationOutput,
  TranslationProviderError,
  type TranslationOutput,
  type TranslationRequest,
} from "./gemini-provider.js";
import type { TranslationProvider } from "./translation-provider.js";

/**
 * Primary → Fallback 2-tier cascade. Gemini의 quota(429)·permanent(401/403)
 * 에러에만 fallback으로 넘긴다. 503(service unavailable)·네트워크 타임아웃처럼
 * 같은 공급자를 다시 시도해야 할 에러는 그대로 올려 TranslationDraftService의
 * 기존 backoff/재시도 경로에 맡긴다(상위에서 이미 구현된 동작을 중복하지 않는다).
 *
 * fallback이 설정되지 않았거나(isConfigured=false) fallback 호출도 실패하면
 * primary 에러를 던진다 — 상위가 "provider 실패"를 판단할 때 원인은 primary가
 * 되어야 유효한 신호.
 */
export class CascadeTranslationProvider implements TranslationProvider {
  private readonly logger = new Logger(CascadeTranslationProvider.name);

  constructor(
    private readonly primary: TranslationProvider,
    private readonly fallback: TranslationProvider,
  ) {}

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async translate(req: TranslationRequest): Promise<TranslationOutput> {
    if (this.primary.isConfigured()) {
      try {
        return await this.primary.translate(req);
      } catch (err) {
        if (!this.shouldFallback(err)) throw err;
        this.logger.warn(
          `primary provider hit ${summarize(err)} — falling back to secondary for single translate`,
        );
        if (this.fallback.isConfigured()) {
          try {
            return await this.fallback.translate(req);
          } catch (fallbackErr) {
            this.logger.warn(`fallback provider also failed: ${summarize(fallbackErr)}`);
            throw err; // 원래 primary 에러를 돌려준다.
          }
        }
        throw err;
      }
    }
    // primary가 configured되지 않은 경우 바로 fallback (환경 이전 단계 대응).
    if (!this.fallback.isConfigured()) {
      throw new TranslationProviderError(
        "no translation provider is configured (neither primary nor fallback)",
      );
    }
    return this.fallback.translate(req);
  }

  async translateBatch(inputs: BatchTranslationItem[]): Promise<BatchTranslationOutput> {
    if (this.primary.isConfigured()) {
      try {
        return await this.primary.translateBatch(inputs);
      } catch (err) {
        if (!this.shouldFallback(err)) throw err;
        this.logger.warn(
          `primary provider hit ${summarize(err)} — falling back to secondary for batch of ${inputs.length}`,
        );
        if (this.fallback.isConfigured()) {
          try {
            return await this.fallback.translateBatch(inputs);
          } catch (fallbackErr) {
            this.logger.warn(`fallback provider also failed: ${summarize(fallbackErr)}`);
            throw err;
          }
        }
        throw err;
      }
    }
    if (!this.fallback.isConfigured()) {
      throw new TranslationProviderError(
        "no translation provider is configured (neither primary nor fallback)",
      );
    }
    return this.fallback.translateBatch(inputs);
  }

  /**
   * primary가 던진 에러 중 "다른 공급자로 재시도할 가치가 있는" 것만 true.
   * - rate-limited (쿼터 고갈): fallback으로 넘김 ✓
   * - permanent (401/403/invalid key): fallback으로 넘김 ✓
   * - 503 / 네트워크 타임아웃: 같은 공급자에게 backoff로 재시도해야 함 → false
   *   (상위 TranslationDraftService가 이미 DEFAULT_UNAVAILABLE_BACKOFF_MS로 처리)
   */
  private shouldFallback(err: unknown): boolean {
    if (!(err instanceof TranslationProviderError)) return false;
    return err.isRateLimited || err.isPermanent;
  }
}

function summarize(err: unknown): string {
  if (err instanceof TranslationProviderError) {
    const bits = [
      err.httpStatus ? `HTTP ${err.httpStatus}` : null,
      err.isRateLimited ? "rate-limited" : null,
      err.isPermanent ? "permanent" : null,
      err.isServiceUnavailable ? "unavailable" : null,
    ].filter((s): s is string => Boolean(s));
    return bits.length > 0 ? bits.join("/") : err.message.slice(0, 80);
  }
  return err instanceof Error ? err.message.slice(0, 80) : String(err);
}
