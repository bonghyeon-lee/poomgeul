import { Chip, type ProposalStatus } from "@/components/ui";

import type { Segment, TranslationSegment } from "../types";

import styles from "./SegmentPair.module.css";

export type SegmentPairProps = {
  segment: Segment;
  translation: TranslationSegment;
  openProposalStatus?: ProposalStatus | null;
};

const KIND_LABEL: Record<Segment["kind"], string> = {
  body: "본문",
  caption: "캡션",
  footnote: "각주",
  reference: "참고문헌",
};

const KIND_CLASS: Record<Segment["kind"], string> = {
  body: "",
  caption: styles.kindCaption!,
  footnote: styles.kindFootnote!,
  reference: styles.kindReference!,
};

function draftSignal(translation: TranslationSegment) {
  if (translation.aiDraftText === null) {
    return { label: "lock · 원문 보존", cls: styles.locked! };
  }
  if (translation.aiDraftText === translation.text) {
    return { label: "AI draft", cls: styles.aiDraft! };
  }
  return { label: "human edited", cls: styles.humanEdited! };
}

/**
 * "provider/slug:suffix" 형태의 긴 모델 식별자를 meta 줄에 얹기 위해 짧게 다듬는다.
 * OpenRouter의 free slate("google/gemma-2-9b-it:free")는 슬래시 뒤 기본명을, Gemini
 * 네이티브 식별자("gemini-2.5-flash")는 그대로 노출한다. AI 번역이 없거나
 * 사람 편집으로 원문 대비 바뀐 세그먼트면 배지를 숨긴다(모델 정보가 더 이상 정확한
 * 출처가 아니기 때문).
 */
function formatModelLabel(source: TranslationSegment["aiDraftSource"]): string | null {
  if (!source?.model) return null;
  const raw = source.model;
  const afterSlash = raw.includes("/") ? (raw.split("/").pop() ?? raw) : raw;
  const suffixSplit = afterSlash.split(":");
  const stem = suffixSplit[0] ?? afterSlash;
  const isFree = suffixSplit[1] === "free";
  return isFree ? `${stem} · free` : stem;
}

export function SegmentPair({ segment, translation, openProposalStatus }: SegmentPairProps) {
  const signal = draftSignal(translation);
  const kindCls = KIND_CLASS[segment.kind];
  const pairCls = [styles.pair, kindCls].filter(Boolean).join(" ");

  return (
    <article className={pairCls} id={`seg-${segment.order}`}>
      <div className={styles.column}>
        <div className={styles.meta}>
          <span className={styles.metaCounter}>§{segment.order}</span>
          <span className={styles.metaDivider}>·</span>
          <span>{KIND_LABEL[segment.kind]}</span>
          <span className={styles.metaDivider}>·</span>
          <span>en</span>
        </div>
        <div className={`${styles.text} ${styles.textOriginal}`}>{segment.originalText}</div>
      </div>
      <div className={styles.column}>
        <div className={styles.meta}>
          <span>ko</span>
          <span className={styles.metaDivider}>·</span>
          <span className={signal.cls}>{signal.label}</span>
          <span className={styles.metaDivider}>·</span>
          <span>v{translation.version}</span>
          {formatModelLabel(translation.aiDraftSource) ? (
            <>
              <span className={styles.metaDivider}>·</span>
              <span
                className={styles.modelBadge}
                title={translation.aiDraftSource?.model ?? undefined}
              >
                {formatModelLabel(translation.aiDraftSource)}
              </span>
            </>
          ) : null}
          {openProposalStatus ? (
            <span className={styles.proposalChip}>
              <Chip status={openProposalStatus}>{openProposalStatus}</Chip>
            </span>
          ) : null}
        </div>
        <div className={`${styles.text} ${styles.textTranslation}`}>{translation.text}</div>
      </div>
    </article>
  );
}
