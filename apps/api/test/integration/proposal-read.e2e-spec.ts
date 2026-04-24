/**
 * ADR-0006 C1 — Proposal Read 경로 e2e.
 *
 * AppModule 전체를 띄우지 않고 ProposalController만 마운트하는 TestModule을 쓴다
 * (auth-session-guard.e2e-spec.ts와 동일 전략). 공개 엔드포인트라 SessionGuard가
 * 필요 없고, GitHub OAuth env 의존도 피한다. 각 case는 트랜잭션 안이 아니라
 * 명시 cleanup(afterAll)로 정리한다 — supertest 호출은 컨트롤러가 자기 서비스의
 * DB 핸들을 쓰므로 withRollback 트랜잭션 안에 들어가지 않기 때문.
 */

import { randomUUID } from "node:crypto";

import { type INestApplication, Module, RequestMethod } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  createDb,
  type Db,
  eq,
  inArray,
  proposalComments,
  proposals,
  segments,
  sources,
  translations,
  translationSegments,
  users,
} from "@poomgeul/db";
import request from "supertest";

import { DB_TOKEN } from "../../src/db/database.module.js";
import { PgSessionStore } from "../../src/modules/auth/pg-session-store.js";
import { SessionGuard } from "../../src/modules/auth/session.guard.js";
import { SESSION_STORE } from "../../src/modules/auth/session-store.js";
import { ProposalController } from "../../src/modules/proposal/proposal.controller.js";
import { ProposalRepository } from "../../src/modules/proposal/proposal.repository.js";
import { ProposalService } from "../../src/modules/proposal/proposal.service.js";
import { TEST_DATABASE_URL } from "../db/test-db.js";

/**
 * C2에서 ProposalController에 POST + SessionGuard가 추가되며, Nest는 컨트롤러
 * 로딩 시점에 모든 핸들러의 가드 의존을 resolve한다. 따라서 Read-only 테스트도
 * SessionGuard와 SESSION_STORE를 provider에 포함해야 한다.
 */
@Module({
  controllers: [ProposalController],
  providers: [
    { provide: DB_TOKEN, useFactory: () => createDb(TEST_DATABASE_URL) },
    { provide: SESSION_STORE, useClass: PgSessionStore },
    SessionGuard,
    ProposalService,
    ProposalRepository,
  ],
})
class TestProposalModule {}

type Fixture = {
  importerId: string;
  secondUserId: string;
  sourceId: string;
  translationId: string;
  slug: string;
  segmentIds: string[];
  proposalOpenId: string;
  proposalMergedId: string;
  commentIds: string[];
};

describe("Proposal Read (e2e, strategy-free)", () => {
  let app: INestApplication;
  let db: Db;
  let fx: Fixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestProposalModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", {
      exclude: [{ path: "healthz", method: RequestMethod.GET }],
    });
    await app.init();

    db = moduleRef.get<Db>(DB_TOKEN);
    fx = await seed(db);
  });

  afterAll(async () => {
    await cleanup(db, fx);
    await app.close();
    await db.close();
  });

  describe("GET /api/translations/:slug/proposals", () => {
    it("returns all proposals for the translation, newest first", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      // 시드 순서상 open이 나중에 생성 → 목록 맨 앞.
      expect(res.body[0].proposalId).toBe(fx.proposalOpenId);
      expect(res.body[1].proposalId).toBe(fx.proposalMergedId);

      // Join된 proposer display name이 붙는다.
      const open = res.body[0];
      expect(open).toMatchObject({
        status: "open",
        segmentId: fx.segmentIds[0],
      });
      expect(typeof open.proposerDisplayName).toBe("string");
      expect(typeof open.createdAt).toBe("string");
    });

    it("filters by status=open", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals?status=open`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].proposalId).toBe(fx.proposalOpenId);
    });

    it("clamps limit to 1 at minimum", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals?limit=0`)
        .expect(200);
      expect(res.body).toHaveLength(1);
    });

    it("ignores unknown status values (treats as default 'all')", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals?status=not-a-real-status`)
        .expect(200);
      expect(res.body).toHaveLength(2);
    });

    it("returns 404 for an unknown slug", async () => {
      await request(app.getHttpServer())
        .get(`/api/translations/does-not-exist-${randomUUID()}/proposals`)
        .expect(404);
    });
  });

  describe("GET /api/translations/:slug/proposals/:proposalId", () => {
    it("returns detail with currentSegment diff context", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals/${fx.proposalOpenId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        proposalId: fx.proposalOpenId,
        status: "open",
        translationId: fx.translationId,
        segmentId: fx.segmentIds[0],
      });
      expect(typeof res.body.proposedText).toBe("string");
      expect(res.body.currentSegment).toMatchObject({
        segmentId: fx.segmentIds[0],
        currentVersion: expect.any(Number),
      });
      expect(typeof res.body.currentSegment.originalText).toBe("string");
      expect(typeof res.body.currentSegment.currentText).toBe("string");
    });

    it("returns 404 when proposal belongs to a different translation", async () => {
      // 두 번째 translation을 만들고 그쪽 id로 접근 시도.
      const { otherSlug } = await seedSecondTranslation(db, fx.importerId);
      try {
        await request(app.getHttpServer())
          .get(`/api/translations/${otherSlug}/proposals/${fx.proposalOpenId}`)
          .expect(404);
      } finally {
        await cleanupSecondTranslation(db, otherSlug);
      }
    });

    it("returns 404 for a random uuid", async () => {
      await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals/${randomUUID()}`)
        .expect(404);
    });
  });

  describe("GET /api/translations/:slug/proposals/:proposalId/comments", () => {
    it("returns comments ascending by createdAt with author display name", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals/${fx.proposalOpenId}/comments`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].commentId).toBe(fx.commentIds[0]);
      expect(res.body[1].commentId).toBe(fx.commentIds[1]);
      expect(res.body[0]).toMatchObject({
        author: expect.objectContaining({ userId: expect.any(String) }),
      });
    });

    it("returns 404 when the proposal does not exist", async () => {
      await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/proposals/${randomUUID()}/comments`)
        .expect(404);
    });
  });
});

async function seed(db: Db): Promise<Fixture> {
  const uniqueMarker = randomUUID().slice(0, 8);

  const [importer] = await db
    .insert(users)
    .values({
      email: `proposal-read-imp-${uniqueMarker}@example.invalid`,
      displayName: "Importer",
    })
    .returning();
  if (!importer) throw new Error("importer insert failed");
  const [other] = await db
    .insert(users)
    .values({
      email: `proposal-read-other-${uniqueMarker}@example.invalid`,
      displayName: "Other Proposer",
    })
    .returning();
  if (!other) throw new Error("other insert failed");

  const [source] = await db
    .insert(sources)
    .values({
      title: `Proposal Read Fixture ${uniqueMarker}`,
      author: ["Author A"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9998.${uniqueMarker}`,
      sourceVersion: "v1",
      importedBy: importer.id,
    })
    .returning();
  if (!source) throw new Error("source insert failed");

  const segRows = await db
    .insert(segments)
    .values([
      { sourceId: source.sourceId, order: 0, originalText: "Original one.", kind: "body" },
      { sourceId: source.sourceId, order: 1, originalText: "Original two.", kind: "body" },
    ])
    .returning();
  const [seg0, seg1] = segRows;
  if (!seg0 || !seg1) throw new Error("segment insert failed");

  const slug = `proposal-read-${uniqueMarker}`;
  const [translation] = await db
    .insert(translations)
    .values({
      sourceId: source.sourceId,
      targetLang: "ko",
      leadId: importer.id,
      status: "draft",
      license: "CC-BY",
      slug,
    })
    .returning();
  if (!translation) throw new Error("translation insert failed");

  await db.insert(translationSegments).values([
    {
      translationId: translation.translationId,
      segmentId: seg0.segmentId,
      text: "현재 번역 1.",
      version: 3,
    },
    {
      translationId: translation.translationId,
      segmentId: seg1.segmentId,
      text: "현재 번역 2.",
      version: 1,
    },
  ]);

  // 오래된 merged proposal 하나 먼저.
  const [merged] = await db
    .insert(proposals)
    .values({
      translationId: translation.translationId,
      segmentId: seg1.segmentId,
      baseSegmentVersion: 0,
      proposedText: "예전 제안 텍스트.",
      reason: "기록 보존용",
      proposerId: other.id,
      status: "merged",
      resolvedBy: importer.id,
      resolvedAt: new Date(Date.now() - 60_000),
    })
    .returning();
  if (!merged) throw new Error("merged proposal insert failed");

  // 열린 proposal.
  const [open] = await db
    .insert(proposals)
    .values({
      translationId: translation.translationId,
      segmentId: seg0.segmentId,
      baseSegmentVersion: 3,
      proposedText: "새로운 제안 텍스트 — 문맥에 더 맞는 어휘.",
      reason: "어휘가 일반적인 표현으로 더 자연스럽다",
      proposerId: other.id,
      status: "open",
    })
    .returning();
  if (!open) throw new Error("open proposal insert failed");

  // 댓글은 createdAt 순서를 강제로 벌려 두 개 삽입. defaultNow로 거의 동시에 들어가면
  // 정렬 검증이 부정확해질 수 있어 명시적으로 시간을 지정.
  const now = Date.now();
  const [c0] = await db
    .insert(proposalComments)
    .values({
      proposalId: open.proposalId,
      authorId: importer.id,
      body: "리드의 피드백 (먼저 작성됨).",
      createdAt: new Date(now - 10_000),
    })
    .returning();
  const [c1] = await db
    .insert(proposalComments)
    .values({
      proposalId: open.proposalId,
      authorId: other.id,
      body: "proposer의 응답 (나중에 작성됨).",
      createdAt: new Date(now - 1_000),
    })
    .returning();
  if (!c0 || !c1) throw new Error("comment insert failed");

  return {
    importerId: importer.id,
    secondUserId: other.id,
    sourceId: source.sourceId,
    translationId: translation.translationId,
    slug,
    segmentIds: [seg0.segmentId, seg1.segmentId],
    proposalOpenId: open.proposalId,
    proposalMergedId: merged.proposalId,
    commentIds: [c0.commentId, c1.commentId],
  };
}

async function cleanup(db: Db, fx: Fixture): Promise<void> {
  // FK cascade(sources → translations → segments/ts/proposals/comments → ...)로 대부분 따라온다.
  await db.delete(sources).where(eq(sources.sourceId, fx.sourceId));
  await db.delete(users).where(inArray(users.id, [fx.importerId, fx.secondUserId]));
}

async function seedSecondTranslation(
  db: Db,
  importerId: string,
): Promise<{ otherSlug: string; sourceId: string }> {
  const mk = randomUUID().slice(0, 8);
  const [source] = await db
    .insert(sources)
    .values({
      title: `Other Fixture ${mk}`,
      author: ["B"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9997.${mk}`,
      sourceVersion: "v1",
      importedBy: importerId,
    })
    .returning();
  if (!source) throw new Error("second source insert failed");
  const otherSlug = `proposal-read-other-${mk}`;
  await db.insert(translations).values({
    sourceId: source.sourceId,
    targetLang: "ko",
    leadId: importerId,
    status: "draft",
    license: "CC-BY",
    slug: otherSlug,
  });
  return { otherSlug, sourceId: source.sourceId };
}

async function cleanupSecondTranslation(db: Db, otherSlug: string): Promise<void> {
  const rows = await db
    .select({ sourceId: translations.sourceId })
    .from(translations)
    .where(eq(translations.slug, otherSlug))
    .limit(1);
  const sourceId = rows[0]?.sourceId;
  if (sourceId) await db.delete(sources).where(eq(sources.sourceId, sourceId));
}
