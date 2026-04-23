/**
 * Source + Translation 생성 서비스.
 *
 * Import 흐름에서 "번역본 만들기" 버튼이 눌릴 때 호출된다.
 *   1) parseSourceInput → ParsedSource
 *   2) LicenseLookupService.lookup → allowed여야만 진행
 *   3) alreadyRegistered면 기존 slug로 돌려주고 생성은 건너뜀
 *   4) sources + translations INSERT (한 트랜잭션)
 *
 * Segment 분할(M0 #3)은 이 서비스 밖. 생성 직후 segments 테이블은 비어 있고,
 * Reader는 "세그먼트 분할 대기" 상태로 렌더하도록 프론트가 처리한다.
 *
 * 인증(M0 #1)이 붙기 전이라 importedBy/leadId는 dev seed user를 ensure해서 쓴다.
 * 인증 붙은 뒤에는 req.user로 교체해야 한다 — ensureSeedUser 호출 지점이 교체 포인트.
 */

import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Db, eq, segments, sources, translations, users } from "@poomgeul/db";

import {
  Ar5ivNotFoundError,
  Ar5ivUpstreamError,
  type Ar5ivFetcher,
} from "./ar5iv-fetcher.js";
import type { ArxivId } from "./input.js";
import type { AllowedLicense, LicenseLookupResult } from "./license-lookup.js";
import { LicenseLookupService } from "./license-lookup.js";
import { parseAr5ivHtml, type ParsedSegment } from "./segment-parser.js";
import { DB_TOKEN } from "./source.repository.js";

export const AR5IV_FETCHER = Symbol("AR5IV_FETCHER");

export type CreateTranslationResult =
  | {
      outcome: "created";
      sourceId: string;
      translationId: string;
      slug: string;
      license: AllowedLicense;
      title: string;
      version: string;
      segmentCount: number;
      segmentationStatus: "ok" | "skipped" | "upstream-error";
    }
  | {
      outcome: "already-registered";
      translationId: string;
      slug: string;
      sourceId: string;
    }
  | Exclude<LicenseLookupResult, { outcome: "allowed" }>;

const DEV_SEED_EMAIL = "dev-seed@poomgeul.invalid";

@Injectable()
export class SourceService {
  private readonly logger = new Logger(SourceService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    // tsx 환경에서 emitDecoratorMetadata가 없어 Class 기반 DI의 파라미터가 undefined로
    // 들어오는 문제를 @Inject(Class)로 우회. node dist/main.js에는 영향 없다.
    @Inject(LicenseLookupService) private readonly lookup: LicenseLookupService,
    @Inject(AR5IV_FETCHER) private readonly ar5iv: Ar5ivFetcher,
  ) {}

  async createFromArxiv(parsed: ArxivId): Promise<CreateTranslationResult> {
    const lookupResult = await this.lookup.lookup(parsed);

    if (lookupResult.outcome !== "allowed") {
      // blocked / not-found / upstream-error / unsupported-format을 그대로 전파.
      return lookupResult;
    }

    if (lookupResult.alreadyRegistered && lookupResult.registeredSlug) {
      // 중복 — 기존 번역본으로 유도하고 생성은 건너뜀. 서비스는 translationId·sourceId를
      // 다시 뽑기 위해 DB를 한 번 더 조회한다(간단 경로).
      const row = await this.db
        .select({
          translationId: translations.translationId,
          sourceId: translations.sourceId,
          slug: translations.slug,
        })
        .from(translations)
        .where(eq(translations.slug, lookupResult.registeredSlug))
        .limit(1);
      if (row[0]) {
        return {
          outcome: "already-registered",
          translationId: row[0].translationId,
          sourceId: row[0].sourceId,
          slug: row[0].slug,
        };
      }
      // DB 일관성이 잠깐 깨진 경우(조회는 성공했는데 재조회가 실패): 그냥 생성 경로로 간다.
      this.logger.warn(
        `alreadyRegistered slug=${lookupResult.registeredSlug} disappeared on re-read; falling through to create`,
      );
    }

    const importerId = await this.ensureSeedUser();

    const attributionSource = canonicalArxivUrl(parsed);
    const sourceVersion = parsed.version ? `v${parsed.version}` : lookupResult.version;
    const baseSlug = slugify(lookupResult.title);

    // ar5iv fetch + parse는 트랜잭션 바깥에서. 실패해도 Source/Translation은 만들고
    // segmentationStatus로 알려, 이후 재시도 잡이 segment만 채울 수 있게 한다.
    let parsedSegments: ParsedSegment[] = [];
    let segmentationStatus: "ok" | "skipped" | "upstream-error" = "ok";
    try {
      const html = await this.ar5iv.fetchHtml(parsed.bareId);
      parsedSegments = parseAr5ivHtml(html);
      if (parsedSegments.length === 0) {
        segmentationStatus = "skipped";
        this.logger.warn(
          `ar5iv returned HTML for ${parsed.bareId} but parser produced 0 segments`,
        );
      }
    } catch (err) {
      if (err instanceof Ar5ivNotFoundError) {
        segmentationStatus = "skipped";
        this.logger.warn(`ar5iv has no HTML for ${parsed.bareId}; source saved without segments`);
      } else if (err instanceof Ar5ivUpstreamError) {
        segmentationStatus = "upstream-error";
        this.logger.warn(`ar5iv fetch failed for ${parsed.bareId}: ${err.message}`);
      } else {
        throw err;
      }
    }

    return this.db.transaction(async (tx) => {
      const insertedSource = await tx
        .insert(sources)
        .values({
          title: lookupResult.title,
          author: lookupResult.authors,
          originalLang: "en",
          license: lookupResult.license,
          attributionSource,
          sourceVersion,
          importedBy: importerId,
        })
        .returning();
      const source = insertedSource[0];
      if (!source) throw new Error("insert into sources returned no row");

      if (parsedSegments.length > 0) {
        const values = parsedSegments.map((s) => ({
          sourceId: source.sourceId,
          order: s.order,
          originalText: s.text,
          kind: s.kind,
        }));
        await tx.insert(segments).values(values);
      }

      const insertedTranslation = await tx
        .insert(translations)
        .values({
          sourceId: source.sourceId,
          targetLang: "ko",
          leadId: importerId,
          status: "draft",
          license: lookupResult.license,
          slug: baseSlug,
        })
        .returning();
      const translation = insertedTranslation[0];
      if (!translation) throw new Error("insert into translations returned no row");

      return {
        outcome: "created",
        sourceId: source.sourceId,
        translationId: translation.translationId,
        slug: translation.slug,
        license: lookupResult.license,
        title: lookupResult.title,
        version: sourceVersion,
        segmentCount: parsedSegments.length,
        segmentationStatus,
      };
    });
  }

  private async ensureSeedUser(): Promise<string> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEV_SEED_EMAIL))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const inserted = await this.db
      .insert(users)
      .values({ email: DEV_SEED_EMAIL, displayName: "dev seed" })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("failed to create dev seed user");
    return row.id;
  }
}

function canonicalArxivUrl(parsed: ArxivId): string {
  return parsed.version
    ? `https://arxiv.org/abs/${parsed.bareId}v${parsed.version}`
    : `https://arxiv.org/abs/${parsed.bareId}`;
}

/**
 * 제목을 URL-safe slug로. 한글은 음절 그대로 남기지 않고 transliteration 없이
 * 제거하는 방식: 알파벳·숫자·하이픈만 유지. 한글로만 된 제목은 slug가 비어지므로
 * arXiv bareId로 폴백한다(이 함수는 bareId를 모르므로 호출부에서 검증).
 */
function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "untitled";
}
