import { Inject, Injectable } from "@nestjs/common";
import { type Db, and, eq, like, sources, translations } from "@poomgeul/db";

export const DB_TOKEN = Symbol("DB_TOKEN");

export type RegisteredTranslation = {
  sourceId: string;
  sourceVersion: string;
  translationId: string;
  slug: string;
  targetLang: string;
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
      .where(
        and(
          eq(translations.targetLang, "ko"),
          like(sources.attributionSource, `${exact}%`),
        ),
      )
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
}
