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
