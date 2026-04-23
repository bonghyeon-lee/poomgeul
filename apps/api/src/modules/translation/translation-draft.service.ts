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

/**
 * Segment[]를 받아 TranslationSegment INSERT 값을 돌려준다. LLM Provider가 설정되지
 * 않았거나 호출이 실패하면 원문을 text에 그대로 담고 aiDraftText는 null — Reader UI는
 * "(번역 대기)" 대신 원문을 보여주어 최소 가독성을 확보한다.
 *
 * reference 세그먼트는 번역하지 않는다(M0 #3 스펙: 참고문헌은 번역 진행도에서 제외).
 * body/caption/footnote만 LLM에 전달.
 */
@Injectable()
export class TranslationDraftService {
  private readonly logger = new Logger(TranslationDraftService.name);

  constructor(
    @Inject(TRANSLATION_PROVIDER)
    private readonly provider: GeminiTranslationProvider,
  ) {}

  async draftAll(segments: SegmentInput[]): Promise<{
    drafts: DraftedSegment[];
    /** 전체 초벌 결과 요약: ok / skipped(프로바이더 미설정) / partial(일부 실패) / failed(전부 실패). */
    status: "ok" | "skipped" | "partial" | "failed";
    succeeded: number;
    failed: number;
  }> {
    if (!this.provider.isConfigured()) {
      this.logger.warn(
        "translation provider not configured; skipping draft generation (segments will keep original text)",
      );
      return {
        drafts: segments.map((s) => ({
          segmentId: s.segmentId,
          text: s.originalText,
          aiDraftText: null,
          aiDraftSource: null,
          status: "unreviewed",
        })),
        status: "skipped",
        succeeded: 0,
        failed: 0,
      };
    }

    let succeeded = 0;
    let failed = 0;
    const drafts: DraftedSegment[] = [];

    for (const seg of segments) {
      if (seg.kind === "reference") {
        drafts.push({
          segmentId: seg.segmentId,
          text: seg.originalText,
          aiDraftText: null,
          aiDraftSource: null,
          status: "unreviewed",
        });
        continue;
      }

      try {
        const out = await this.provider.translate({ text: seg.originalText });
        drafts.push({
          segmentId: seg.segmentId,
          text: out.text,
          aiDraftText: out.text,
          aiDraftSource: {
            model: out.model,
            promptHash: out.promptHash,
            version: out.promptVersion,
          },
          status: "unreviewed",
        });
        succeeded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `draft failed for segment ${seg.segmentId} (order=${seg.order}, kind=${seg.kind}): ${message}`,
        );
        drafts.push({
          segmentId: seg.segmentId,
          text: seg.originalText,
          aiDraftText: null,
          aiDraftSource: null,
          status: "unreviewed",
        });
        failed += 1;
        // transient failure에 대한 backoff·재시도는 M1에서. 지금은 개별 세그먼트 실패를
        // 원문 유지로 받아넘긴다(guides/llm-integration.md §실패·재시도).
        if (err instanceof TranslationProviderError && isPermanent(message)) {
          // 권한/형식 오류가 확실하면 이후 세그먼트에 시도해도 모두 실패할 가능성이 높음.
          this.logger.warn(
            "permanent provider error detected; aborting further draft calls in this batch",
          );
          // 남은 세그먼트는 원문 유지로 채운 뒤 종료.
          for (const remaining of segments.slice(segments.indexOf(seg) + 1)) {
            const draft: DraftedSegment = {
              segmentId: remaining.segmentId,
              text: remaining.originalText,
              aiDraftText: null,
              aiDraftSource: null,
              status: "unreviewed",
            };
            drafts.push(draft);
            failed += 1;
          }
          break;
        }
      }
    }

    let status: "ok" | "partial" | "failed";
    const translatable = segments.filter((s) => s.kind !== "reference").length;
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
}

function isPermanent(message: string): boolean {
  return /401|403|API key|permission|invalid argument/i.test(message);
}
