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
import {
  and,
  type Db,
  eq,
  segments,
  sources,
  translations,
  translationSegments,
  users,
} from "@poomgeul/db";

import { TranslationDraftService } from "../translation/translation-draft.service.js";
import { Ar5ivNotFoundError, Ar5ivUpstreamError, type Ar5ivFetcher } from "./ar5iv-fetcher.js";
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
      /** LLM 초벌 생성 결과. skipped=provider 미설정, ok=전부 성공, partial=일부 실패, failed=전부 실패. */
      draftStatus: "ok" | "skipped" | "partial" | "failed";
      draftSucceeded: number;
      draftFailed: number;
    }
  | {
      outcome: "already-registered";
      translationId: string;
      slug: string;
      sourceId: string;
    }
  | Exclude<LicenseLookupResult, { outcome: "allowed" }>;

export type ReprocessResult =
  | {
      outcome: "reprocessed";
      sourceId: string;
      translationId: string;
      slug: string;
      segmentCount: number;
      segmentationStatus: "ok" | "skipped" | "upstream-error";
      draftStatus: "ok" | "skipped" | "partial" | "failed";
      draftSucceeded: number;
      draftFailed: number;
    }
  | { outcome: "not-found"; reason: string }
  | { outcome: "unsupported-format"; reason: string };

export type RetryFailedResult =
  | {
      outcome: "retried";
      translationId: string;
      slug: string;
      /** retry 대상이었던(실패한 non-reference) 세그먼트 수. */
      attemptedCount: number;
      draftStatus: "ok" | "skipped" | "partial" | "failed";
      draftSucceeded: number;
      draftFailed: number;
    }
  | { outcome: "nothing-to-retry"; translationId: string; slug: string }
  | { outcome: "not-found"; reason: string };

const DEV_SEED_EMAIL = "dev-seed@poomgeul.invalid";

@Injectable()
export class SourceService {
  private readonly logger = new Logger(SourceService.name);

  /**
   * 동일 키에 대해 진행 중인 Promise를 공유한다. 사용자가 Import 버튼을 두 번 누르거나
   * 여러 탭에서 같은 재처리를 동시에 트리거해도 서버는 한 번만 일한다. 완료(성공/실패)
   * 후 엔트리는 제거되어 다음 호출은 새로 시작.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    // tsx 환경에서 emitDecoratorMetadata가 없어 Class 기반 DI의 파라미터가 undefined로
    // 들어오는 문제를 @Inject(Class)로 우회. node dist/main.js에는 영향 없다.
    @Inject(LicenseLookupService) private readonly lookup: LicenseLookupService,
    @Inject(AR5IV_FETCHER) private readonly ar5iv: Ar5ivFetcher,
    @Inject(TranslationDraftService) private readonly draft: TranslationDraftService,
  ) {}

  private async deduped<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      this.logger.log(`deduplicating in-flight request for ${key}`);
      return existing;
    }
    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  async createFromArxiv(parsed: ArxivId): Promise<CreateTranslationResult> {
    const key = parsed.version
      ? `create:arxiv:${parsed.bareId}v${parsed.version}`
      : `create:arxiv:${parsed.bareId}`;
    return this.deduped(key, () => this.createFromArxivInner(parsed));
  }

  private async createFromArxivInner(parsed: ArxivId): Promise<CreateTranslationResult> {
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
        this.logger.warn(`ar5iv returned HTML for ${parsed.bareId} but parser produced 0 segments`);
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

    // Stage 1: source + segments를 먼저 커밋해 segment id를 받아온다.
    // 이전 Import가 도중에 실패했을 경우를 대비해 멱등하게 동작한다 — 같은
    // (attribution_source, source_version)이 있으면 그 row를 재사용하고, segments는
    // 지우고 다시 넣는다(reprocess와 같은 복구 경로).
    const stage1 = await this.db.transaction(async (tx) => {
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
        .onConflictDoUpdate({
          target: [sources.attributionSource, sources.sourceVersion],
          set: {
            // 충돌 시 제목·저자·라이선스를 최신 arXiv 응답으로 갱신. importedAt은 건드리지 않는다.
            title: lookupResult.title,
            author: lookupResult.authors,
            license: lookupResult.license,
          },
        })
        .returning();
      const source = insertedSource[0];
      if (!source) throw new Error("insert into sources returned no row");

      // 기존 segments를 지우고 새로 넣는다 — translation_segments는 FK CASCADE로 함께 정리된다.
      await tx.delete(segments).where(eq(segments.sourceId, source.sourceId));

      let segmentRows: Array<{
        segmentId: string;
        order: number;
        kind: "body" | "caption" | "footnote" | "reference";
        originalText: string;
      }> = [];
      if (parsedSegments.length > 0) {
        const values = parsedSegments.map((s) => ({
          sourceId: source.sourceId,
          order: s.order,
          originalText: s.text,
          kind: s.kind,
        }));
        const inserted = await tx.insert(segments).values(values).returning({
          segmentId: segments.segmentId,
          order: segments.order,
          kind: segments.kind,
          originalText: segments.originalText,
        });
        segmentRows = inserted;
      }
      return { source, segmentRows };
    });

    // Stage 2 (out-of-transaction): LLM 초벌 생성. 네트워크 지연이 크므로 트랜잭션 바깥.
    // 전부 실패해도 Stage 3에서 원문을 text에 담아 translation_segments를 만든다.
    const draftResult = await this.draft.draftAll(
      stage1.segmentRows.map((r) => ({
        segmentId: r.segmentId,
        order: r.order,
        kind: r.kind,
        originalText: r.originalText,
      })),
    );

    // Stage 3: translation + translation_segments 커밋. 같은 (sourceId, targetLang) ko가
    // 이미 있으면 재사용(고아 translation 복구). 없으면 새로 생성. translation_segments는
    // FK CASCADE가 segments 삭제 때 이미 지워졌을 것이므로 새로 INSERT만 하면 된다.
    const stage3 = await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({
          translationId: translations.translationId,
          slug: translations.slug,
        })
        .from(translations)
        .where(
          and(eq(translations.sourceId, stage1.source.sourceId), eq(translations.targetLang, "ko")),
        )
        .limit(1);

      let translation: { translationId: string; slug: string };
      if (existing[0]) {
        translation = existing[0];
      } else {
        const inserted = await tx
          .insert(translations)
          .values({
            sourceId: stage1.source.sourceId,
            targetLang: "ko",
            leadId: importerId,
            status: "draft",
            license: lookupResult.license,
            slug: baseSlug,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("insert into translations returned no row");
        translation = { translationId: row.translationId, slug: row.slug };
      }

      // translation_segments는 FK CASCADE로 이미 비어 있을 것이지만 방어적으로 한 번 더 비운다.
      await tx
        .delete(translationSegments)
        .where(eq(translationSegments.translationId, translation.translationId));

      if (draftResult.drafts.length > 0) {
        await tx.insert(translationSegments).values(
          draftResult.drafts.map((d) => ({
            translationId: translation.translationId,
            segmentId: d.segmentId,
            text: d.text,
            aiDraftText: d.aiDraftText,
            aiDraftSource: d.aiDraftSource,
            lastEditorId: importerId,
            status: d.status,
          })),
        );
      }
      return translation;
    });

    return {
      outcome: "created",
      sourceId: stage1.source.sourceId,
      translationId: stage3.translationId,
      slug: stage3.slug,
      license: lookupResult.license,
      title: lookupResult.title,
      version: sourceVersion,
      segmentCount: parsedSegments.length,
      segmentationStatus,
      draftStatus: draftResult.status,
      draftSucceeded: draftResult.succeeded,
      draftFailed: draftResult.failed,
    };
  }

  /**
   * 이미 존재하는 번역본에 대해 세그먼트 분할과 LLM 초벌을 다시 돌린다.
   * 기존 segments / translationSegments를 비우고 채워 넣는다(멱등).
   *
   * 트리거 경로: Reader의 PendingSegmentsView "재처리" 버튼. 자동 재시도는 없다.
   * LLM 호출 비용과 arXiv/Gemini rate limit 때문에 사용자 명시적 트리거로만 돈다.
   */
  async reprocess(slug: string): Promise<ReprocessResult> {
    return this.deduped(`reprocess:slug:${slug}`, () => this.reprocessInner(slug));
  }

  private async reprocessInner(slug: string): Promise<ReprocessResult> {
    const trRow = await this.db
      .select({
        translationId: translations.translationId,
        sourceId: translations.sourceId,
        leadId: translations.leadId,
        slug: translations.slug,
        attributionSource: sources.attributionSource,
      })
      .from(translations)
      .innerJoin(sources, eq(sources.sourceId, translations.sourceId))
      .where(eq(translations.slug, slug))
      .limit(1);

    const tr = trRow[0];
    if (!tr) {
      return { outcome: "not-found", reason: `slug ${slug}에 해당하는 번역본이 없다.` };
    }

    const bareId = extractArxivBareId(tr.attributionSource);
    if (!bareId) {
      return {
        outcome: "unsupported-format",
        reason: `attributionSource ${tr.attributionSource}는 arXiv URL이 아니다. M0는 arXiv만 재처리 가능.`,
      };
    }

    // ar5iv fetch + parse (트랜잭션 바깥).
    let parsedSegments: ParsedSegment[] = [];
    let segmentationStatus: "ok" | "skipped" | "upstream-error" = "ok";
    try {
      const html = await this.ar5iv.fetchHtml(bareId);
      parsedSegments = parseAr5ivHtml(html);
      if (parsedSegments.length === 0) {
        segmentationStatus = "skipped";
        this.logger.warn(`ar5iv returned HTML for ${bareId} but parser produced 0 segments`);
      }
    } catch (err) {
      if (err instanceof Ar5ivNotFoundError) {
        segmentationStatus = "skipped";
        this.logger.warn(`ar5iv has no HTML for ${bareId}`);
      } else if (err instanceof Ar5ivUpstreamError) {
        segmentationStatus = "upstream-error";
        this.logger.warn(`ar5iv fetch failed for ${bareId}: ${err.message}`);
      } else {
        throw err;
      }
    }

    // Stage 1: 기존 segments / translationSegments 지우고 새 segments INSERT.
    const stage1 = await this.db.transaction(async (tx) => {
      // ON DELETE CASCADE 덕분에 segments 삭제가 translation_segments까지 정리하지만,
      // translationSegments 자체 FK가 segments.segment_id → 새 INSERT와 충돌하지 않게 명시 삭제.
      await tx
        .delete(translationSegments)
        .where(eq(translationSegments.translationId, tr.translationId));
      await tx.delete(segments).where(eq(segments.sourceId, tr.sourceId));

      let segmentRows: Array<{
        segmentId: string;
        order: number;
        kind: "body" | "caption" | "footnote" | "reference";
        originalText: string;
      }> = [];
      if (parsedSegments.length > 0) {
        const values = parsedSegments.map((s) => ({
          sourceId: tr.sourceId,
          order: s.order,
          originalText: s.text,
          kind: s.kind,
        }));
        const inserted = await tx.insert(segments).values(values).returning({
          segmentId: segments.segmentId,
          order: segments.order,
          kind: segments.kind,
          originalText: segments.originalText,
        });
        segmentRows = inserted;
      }
      return segmentRows;
    });

    // Stage 2: LLM 초벌.
    const draftResult = await this.draft.draftAll(
      stage1.map((r) => ({
        segmentId: r.segmentId,
        order: r.order,
        kind: r.kind,
        originalText: r.originalText,
      })),
    );

    // Stage 3: translation_segments INSERT.
    await this.db.transaction(async (tx) => {
      if (draftResult.drafts.length > 0) {
        await tx.insert(translationSegments).values(
          draftResult.drafts.map((d) => ({
            translationId: tr.translationId,
            segmentId: d.segmentId,
            text: d.text,
            aiDraftText: d.aiDraftText,
            aiDraftSource: d.aiDraftSource,
            lastEditorId: tr.leadId,
            status: d.status,
          })),
        );
      }
    });

    return {
      outcome: "reprocessed",
      sourceId: tr.sourceId,
      translationId: tr.translationId,
      slug: tr.slug,
      segmentCount: parsedSegments.length,
      segmentationStatus,
      draftStatus: draftResult.status,
      draftSucceeded: draftResult.succeeded,
      draftFailed: draftResult.failed,
    };
  }

  /**
   * 이미 등록된 번역본에서 aiDraftText=null이고 kind!='reference'인 세그먼트만 골라
   * Gemini에 다시 보낸다. 성공한 세그먼트의 translation_segments row를 UPDATE하여
   * ai_draft_text와 text, ai_draft_source를 채운다. 실패분은 그대로 남겨 다음 재시도에서
   * 다시 대상이 된다.
   *
   * ar5iv 재fetch나 segments 재분할은 하지 않는다 — 원문 구조는 건드리지 않고 번역만 보강.
   */
  async retryFailedDrafts(slug: string): Promise<RetryFailedResult> {
    return this.deduped(`retryFailed:slug:${slug}`, () => this.retryFailedDraftsInner(slug));
  }

  private async retryFailedDraftsInner(slug: string): Promise<RetryFailedResult> {
    const trRow = await this.db
      .select({
        translationId: translations.translationId,
        sourceId: translations.sourceId,
        leadId: translations.leadId,
        slug: translations.slug,
      })
      .from(translations)
      .where(eq(translations.slug, slug))
      .limit(1);
    const tr = trRow[0];
    if (!tr) {
      return { outcome: "not-found", reason: `slug ${slug}에 해당하는 번역본이 없다.` };
    }

    // aiDraftText=null인 translation_segments + 연결된 segment(kind!='reference')만 모은다.
    const candidates = await this.db
      .select({
        segmentId: segments.segmentId,
        order: segments.order,
        kind: segments.kind,
        originalText: segments.originalText,
        aiDraftText: translationSegments.aiDraftText,
      })
      .from(translationSegments)
      .innerJoin(segments, eq(segments.segmentId, translationSegments.segmentId))
      .where(eq(translationSegments.translationId, tr.translationId));

    const failed = candidates.filter((r) => r.aiDraftText === null && r.kind !== "reference");
    if (failed.length === 0) {
      return { outcome: "nothing-to-retry", translationId: tr.translationId, slug: tr.slug };
    }

    const draftResult = await this.draft.draftAll(
      failed.map((r) => ({
        segmentId: r.segmentId,
        order: r.order,
        kind: r.kind,
        originalText: r.originalText,
      })),
    );

    // 번역 성공(aiDraftText != null)인 것만 UPDATE. 실패는 기존 null 유지.
    const successes = draftResult.drafts.filter((d) => d.aiDraftText !== null);
    if (successes.length > 0) {
      await this.db.transaction(async (tx) => {
        for (const d of successes) {
          await tx
            .update(translationSegments)
            .set({
              text: d.text,
              aiDraftText: d.aiDraftText,
              aiDraftSource: d.aiDraftSource,
              lastEditorId: tr.leadId,
              lastEditedAt: new Date(),
            })
            .where(
              and(
                eq(translationSegments.translationId, tr.translationId),
                eq(translationSegments.segmentId, d.segmentId),
              ),
            );
        }
      });
    }

    this.logger.log(
      `retryFailedDrafts slug=${slug} · attempted=${failed.length} ok=${draftResult.succeeded} fail=${draftResult.failed}`,
    );

    return {
      outcome: "retried",
      translationId: tr.translationId,
      slug: tr.slug,
      attemptedCount: failed.length,
      draftStatus: draftResult.status,
      draftSucceeded: draftResult.succeeded,
      draftFailed: draftResult.failed,
    };
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
 * attributionSource에서 bareId를 뽑는다.
 *   https://arxiv.org/abs/2604.00295      → "2604.00295"
 *   https://arxiv.org/abs/2604.00295v2    → "2604.00295"
 * arXiv URL이 아니면 null.
 */
function extractArxivBareId(attributionSource: string): string | null {
  const m = attributionSource.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?/);
  return m ? m[1]! : null;
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
