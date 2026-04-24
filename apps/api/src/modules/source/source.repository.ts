import { Inject, Injectable } from "@nestjs/common";
import {
  type Db,
  and,
  desc,
  eq,
  inArray,
  like,
  segments,
  sources,
  translations,
  translationSegments,
  users,
} from "@poomgeul/db";

import { DB_TOKEN } from "../../db/database.module.js";

export type RegisteredTranslation = {
  sourceId: string;
  sourceVersion: string;
  translationId: string;
  slug: string;
  targetLang: string;
};

export type ReaderBundleRow = {
  source: {
    sourceId: string;
    title: string;
    author: string[];
    originalLang: string;
    license: "CC-BY" | "CC-BY-SA" | "PD" | "CC-BY-NC";
    attributionSource: string;
    sourceVersion: string;
    importedAt: Date;
    importer: { userId: string; displayName: string | null; githubHandle: string | null };
  };
  translation: {
    translationId: string;
    sourceId: string;
    targetLang: string;
    leadId: string;
    leadDisplayName: string | null;
    status: "draft" | "reviewed" | "featured";
    license: "CC-BY" | "CC-BY-SA" | "PD" | "CC-BY-NC";
    slug: string;
    currentRevisionId: string | null;
  };
  segments: Array<{
    segmentId: string;
    order: number;
    originalText: string;
    kind: "body" | "caption" | "footnote" | "reference";
  }>;
  translationSegments: Array<{
    segmentId: string;
    text: string;
    aiDraftText: string | null;
    version: number;
    status: "unreviewed" | "approved";
  }>;
};

export type TranslationListItem = {
  translationId: string;
  slug: string;
  targetLang: string;
  status: "draft" | "reviewed" | "featured";
  license: "CC-BY" | "CC-BY-SA" | "PD" | "CC-BY-NC";
  sourceId: string;
  title: string;
  authors: string[];
  sourceLicense: "CC-BY" | "CC-BY-SA" | "PD" | "CC-BY-NC";
  sourceVersion: string;
  importedAt: Date;
  leadDisplayName: string | null;
  segmentCount: number;
  /** aiDraftText가 null이 아닌 translationSegment 수 — 실제 AI 번역이 붙은 개수. */
  translatedCount: number;
  /**
   * ar5iv가 렌더하지 못해 세그먼트가 생기지 않은 번역본은 Reader가 의미 있는 렌더를
   * 할 수 없다. segmentCount === 0을 그 시그널로 삼아 web 목록에서 별도 섹션에 배치한다.
   * ar5iv 전용 판정이 아니라 "렌더 가능한 컨텐츠가 있는가"의 범용 플래그로 쓴다.
   */
  renderable: boolean;
};

/**
 * Source/Translation 조회용 리포지토리.
 *
 * M0에서 alreadyRegistered 판정은 "같은 arXiv bareId로 등록된 ko 번역본이
 * 있는가"로 단순화한다. 정확히는 (attributionSource, sourceVersion) 쌍이
 * 스펙이지만, Import 화면이 늘 version을 고정해서 들어오지는 않으므로
 * bareId 기준이 실용적이다. 필요해지면 version 인자를 받아 좁힌다.
 */
@Injectable()
export class SourceRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * attributionSource가 `https://arxiv.org/abs/<bareId>` 또는
   * `https://arxiv.org/abs/<bareId>v<N>`인 source와 여기 연결된 ko 번역본을
   * 찾아 slug·metadata를 돌려준다. 여러 version이 있으면 첫 매치.
   */
  async findRegisteredByArxivBareId(bareId: string): Promise<RegisteredTranslation | null> {
    const exact = `https://arxiv.org/abs/${bareId}`;

    const rows = await this.db
      .select({
        sourceId: sources.sourceId,
        sourceVersion: sources.sourceVersion,
        attributionSource: sources.attributionSource,
        translationId: translations.translationId,
        slug: translations.slug,
        targetLang: translations.targetLang,
      })
      .from(sources)
      .innerJoin(translations, eq(translations.sourceId, sources.sourceId))
      .where(and(eq(translations.targetLang, "ko"), like(sources.attributionSource, `${exact}%`)))
      .limit(20);

    // LIKE는 `<exact>something` 같은 다른 bareId의 prefix 매칭도 걸 수 있다
    // (예: "2310.123" LIKE "2310.12%"). 클라이언트 측에서 엄밀히 재검증한다.
    for (const row of rows) {
      if (row.attributionSource === exact || row.attributionSource.startsWith(`${exact}v`)) {
        return {
          sourceId: row.sourceId,
          sourceVersion: row.sourceVersion,
          translationId: row.translationId,
          slug: row.slug,
          targetLang: row.targetLang,
        };
      }
    }
    return null;
  }

  /**
   * slug로 Reader 번들을 조회한다. 없으면 null. TranslationSegment가 아직 안 채워졌다면
   * translationSegments는 빈 배열로 돌려주고 상위가 원문만 렌더할 수 있게 한다.
   */
  async findReaderBundleBySlug(slug: string): Promise<ReaderBundleRow | null> {
    const trRow = await this.db
      .select({
        translationId: translations.translationId,
        sourceId: translations.sourceId,
        targetLang: translations.targetLang,
        leadId: translations.leadId,
        status: translations.status,
        license: translations.license,
        slug: translations.slug,
        currentRevisionId: translations.currentRevisionId,
        leadDisplayName: users.displayName,
      })
      .from(translations)
      .innerJoin(users, eq(users.id, translations.leadId))
      .where(eq(translations.slug, slug))
      .limit(1);

    const tr = trRow[0];
    if (!tr) return null;

    const srcRow = await this.db
      .select({
        sourceId: sources.sourceId,
        title: sources.title,
        author: sources.author,
        originalLang: sources.originalLang,
        license: sources.license,
        attributionSource: sources.attributionSource,
        sourceVersion: sources.sourceVersion,
        importedAt: sources.importedAt,
        importerId: users.id,
        importerName: users.displayName,
        importerHandle: users.githubHandle,
      })
      .from(sources)
      .innerJoin(users, eq(users.id, sources.importedBy))
      .where(eq(sources.sourceId, tr.sourceId))
      .limit(1);

    const src = srcRow[0];
    if (!src) return null;

    const segRows = await this.db
      .select({
        segmentId: segments.segmentId,
        order: segments.order,
        originalText: segments.originalText,
        kind: segments.kind,
      })
      .from(segments)
      .where(eq(segments.sourceId, src.sourceId))
      .orderBy(segments.order);

    const tsRows = await this.db
      .select({
        segmentId: translationSegments.segmentId,
        text: translationSegments.text,
        aiDraftText: translationSegments.aiDraftText,
        version: translationSegments.version,
        status: translationSegments.status,
      })
      .from(translationSegments)
      .where(eq(translationSegments.translationId, tr.translationId));

    return {
      source: {
        sourceId: src.sourceId,
        title: src.title,
        author: src.author,
        originalLang: src.originalLang,
        license: src.license,
        attributionSource: src.attributionSource,
        sourceVersion: src.sourceVersion,
        importedAt: src.importedAt,
        importer: {
          userId: src.importerId,
          displayName: src.importerName,
          githubHandle: src.importerHandle,
        },
      },
      translation: {
        translationId: tr.translationId,
        sourceId: tr.sourceId,
        targetLang: tr.targetLang,
        leadId: tr.leadId,
        leadDisplayName: tr.leadDisplayName,
        status: tr.status,
        license: tr.license,
        slug: tr.slug,
        currentRevisionId: tr.currentRevisionId,
      },
      segments: segRows,
      translationSegments: tsRows,
    };
  }

  /**
   * 최근 등록된 ko 번역본 목록. imported_at DESC 정렬. 각 row에 세그먼트 수와
   * 실제 번역된(=aiDraftText is not null) 세그먼트 수를 집계해 붙인다.
   */
  async listTranslations(options?: { limit?: number }): Promise<TranslationListItem[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

    const rows = await this.db
      .select({
        translationId: translations.translationId,
        slug: translations.slug,
        targetLang: translations.targetLang,
        status: translations.status,
        translationLicense: translations.license,
        sourceId: sources.sourceId,
        title: sources.title,
        authors: sources.author,
        sourceLicense: sources.license,
        sourceVersion: sources.sourceVersion,
        importedAt: sources.importedAt,
        leadDisplayName: users.displayName,
      })
      .from(translations)
      .innerJoin(sources, eq(sources.sourceId, translations.sourceId))
      .leftJoin(users, eq(users.id, translations.leadId))
      .where(eq(translations.targetLang, "ko"))
      .orderBy(desc(sources.importedAt))
      .limit(limit);

    if (rows.length === 0) return [];

    const translationIds = rows.map((r) => r.translationId);
    const sourceIds = rows.map((r) => r.sourceId);

    // 집계 2개: segments per source / translationSegments per translation (aiDraftText 기준).
    const segRows = await this.db
      .select({ sourceId: segments.sourceId, segmentId: segments.segmentId })
      .from(segments)
      .where(inArray(segments.sourceId, sourceIds));
    const segCountBySource = new Map<string, number>();
    for (const r of segRows) {
      segCountBySource.set(r.sourceId, (segCountBySource.get(r.sourceId) ?? 0) + 1);
    }

    const tsRows = await this.db
      .select({
        translationId: translationSegments.translationId,
        aiDraftText: translationSegments.aiDraftText,
      })
      .from(translationSegments)
      .where(inArray(translationSegments.translationId, translationIds));
    const translatedCountByTr = new Map<string, number>();
    for (const r of tsRows) {
      if (r.aiDraftText === null) continue;
      translatedCountByTr.set(r.translationId, (translatedCountByTr.get(r.translationId) ?? 0) + 1);
    }

    return rows.map((r) => {
      const segmentCount = segCountBySource.get(r.sourceId) ?? 0;
      const translatedCount = translatedCountByTr.get(r.translationId) ?? 0;
      return {
        translationId: r.translationId,
        slug: r.slug,
        targetLang: r.targetLang,
        status: r.status,
        license: r.translationLicense,
        sourceId: r.sourceId,
        title: r.title,
        authors: r.authors,
        sourceLicense: r.sourceLicense,
        sourceVersion: r.sourceVersion,
        importedAt: r.importedAt,
        leadDisplayName: r.leadDisplayName,
        segmentCount,
        translatedCount,
        renderable: segmentCount > 0,
      };
    });
  }
}
