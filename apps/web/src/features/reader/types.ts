/**
 * Reader 도메인 타입 — M0 data-model의 Reader 소비 부분만 발췌한다.
 * 정본은 docs/architecture/data-model.md. API가 OpenAPI를 공급하면 @poomgeul/types로 교체한다.
 */

export type SourceLicense = "CC-BY" | "CC-BY-SA" | "PD" | "CC-BY-ND" | "CC-BY-NC-ND";

export type SegmentKind = "body" | "caption" | "footnote" | "reference";

export type TranslationSegmentStatus = "unreviewed" | "approved";

export type TranslationStatus = "draft" | "reviewed" | "featured";

export type ProposalStatus = "open" | "merged" | "rejected" | "withdrawn" | "stale";

export type Source = {
  sourceId: string;
  title: string;
  author: string[];
  originalLang: string;
  license: SourceLicense;
  attributionSource: string;
  sourceVersion: string;
  importedAt: string;
  importedBy: { userId: string; displayName: string; githubHandle?: string };
};

export type Segment = {
  segmentId: string;
  sourceId: string;
  order: number;
  originalText: string;
  kind: SegmentKind;
};

export type TranslationSegment = {
  translationId: string;
  segmentId: string;
  text: string;
  aiDraftText: string | null;
  /**
   * 초벌 번역을 실제로 수행한 provider·모델·프롬프트 버전. Reader가 "이 번역은
   * X 모델이 만들었다"는 모델 배지를 그릴 때 쓴다. null이면 아직 AI 번역이
   * 없거나 원문 보존 상태.
   */
  aiDraftSource: {
    model: string;
    promptHash: string;
    /** 서버의 JSONB에는 promptVersion 키로 저장돼 있고, 이전 M0 구현은 `version` 키로
     *  내렸다. 어느 쪽이든 UI는 model만 쓰는 게 핵심이라 두 키 모두 optional로 둔다. */
    promptVersion?: string;
    version?: string;
  } | null;
  version: number;
  lastEditorId: string;
  lastEditedAt: string;
  status: TranslationSegmentStatus;
};

export type Translation = {
  translationId: string;
  sourceId: string;
  targetLang: string;
  leadId: string;
  leadDisplayName: string;
  status: TranslationStatus;
  license: SourceLicense;
  slug: string;
  currentRevisionId: string | null;
};

export type Contributor = {
  userId: string;
  displayName: string;
  githubHandle?: string;
  mergedProposalCount: number;
};

export type ProposalSummary = {
  proposalId: string;
  segmentId: string;
  proposerDisplayName: string;
  status: ProposalStatus;
  createdAt: string;
};

export type ProposalCommentItem = {
  commentId: string;
  body: string;
  createdAt: string;
  author: {
    userId: string;
    displayName: string | null;
    githubHandle: string | null;
  };
};

export type ReaderBundle = {
  source: Source;
  segments: Segment[];
  translation: Translation;
  translationSegments: TranslationSegment[];
  contributors: Contributor[];
  proposals: ProposalSummary[];
};
