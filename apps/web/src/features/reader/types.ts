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
  aiDraftSource: { model: string; promptHash: string; version: string } | null;
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

export type ReaderBundle = {
  source: Source;
  segments: Segment[];
  translation: Translation;
  translationSegments: TranslationSegment[];
  contributors: Contributor[];
  proposals: ProposalSummary[];
};
