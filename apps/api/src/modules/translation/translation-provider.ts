import type {
  BatchTranslationItem,
  BatchTranslationOutput,
  TranslationOutput,
  TranslationRequest,
} from "./gemini-provider.js";

export type { BatchTranslationItem, BatchTranslationOutput, TranslationOutput, TranslationRequest };

/**
 * 번역 프로바이더의 최소 계약. Gemini REST 직호출, OpenRouter 직호출, 이들의
 * Cascade 래퍼가 모두 이 shape을 구현한다. draft service는 이 interface만
 * 참조해 실제 구현을 교체 가능.
 *
 * TranslationOutput·BatchTranslationOutput의 `model` 필드에는 **실제 번역을
 * 수행한 모델 식별자**가 들어간다(OpenRouter slug 또는 Gemini 모델명 그대로).
 * Reader UI가 이 값으로 "어떤 모델로 번역했는지" 배지를 그린다.
 */
export interface TranslationProvider {
  isConfigured(): boolean;
  translate(req: TranslationRequest): Promise<TranslationOutput>;
  translateBatch(items: BatchTranslationItem[]): Promise<BatchTranslationOutput>;
}
