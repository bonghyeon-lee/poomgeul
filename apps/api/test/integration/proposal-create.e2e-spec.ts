/**
 * ADR-0006 C2 — 제안 생성 e2e.
 *
 * 전략: strategy-free TestModule. AuthModule을 직접 import하면 GitHubStrategy
 * 생성자가 GITHUB_CLIENT_ID/SECRET을 요구해 테스트 부팅이 깨진다(PR#2 교훈).
 * 대신 SessionGuard와 그 의존(SESSION_STORE)만 providers로 재선언해 쓰기
 * 엔드포인트의 인증 분기를 그대로 검증한다. main.ts와 동일한 ValidationPipe·
 * globalPrefix를 수동으로 적용해 DTO 검증도 실제 환경과 일치시킨다.
 */

import { randomUUID } from "node:crypto";

import { type INestApplication, Module, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  contributions,
  createDb,
  type Db,
  eq,
  inArray,
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
class TestProposalCreateModule {}

type Fixture = {
  importerId: string;
  proposerId: string;
  sourceId: string;
  translationId: string;
  slug: string;
  segmentAId: string;
  segmentBId: string;
  segmentAVersion: number;
  segmentBVersion: number;
  otherSourceId: string;
  otherSegmentId: string;
};

describe("POST /api/translations/:slug/proposals (e2e)", () => {
  let app: INestApplication;
  let db: Db;
  let store: PgSessionStore;
  let fx: Fixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestProposalCreateModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", {
      exclude: [{ path: "healthz", method: RequestMethod.GET }],
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    db = moduleRef.get<Db>(DB_TOKEN);
    store = moduleRef.get(SESSION_STORE);
    fx = await seed(db);
  });

  afterAll(async () => {
    await cleanup(db, fx);
    await app.close();
    await db.close();
  });

  async function sidForProposer(): Promise<string> {
    const session = await store.create({ userId: fx.proposerId });
    return session.sessionId;
  }

  it("401 when no session cookie", async () => {
    await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion,
        proposedText: "새로운 번역 제안",
      })
      .expect(401);
  });

  it("201 on happy path, writes proposal row and a proposal_submit contribution", async () => {
    const sid = await sidForProposer();
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion,
        proposedText: "새로운 번역 제안",
        reason: "원문 어휘 대응 개선",
      })
      .expect(201);

    expect(res.body).toMatchObject({ status: "open" });
    expect(typeof res.body.proposalId).toBe("string");
    expect(typeof res.body.createdAt).toBe("string");

    // 실제 row 확인
    const rows = await db
      .select({
        proposerId: proposals.proposerId,
        segmentId: proposals.segmentId,
        status: proposals.status,
        baseSegmentVersion: proposals.baseSegmentVersion,
        reason: proposals.reason,
        proposedText: proposals.proposedText,
      })
      .from(proposals)
      .where(eq(proposals.proposalId, res.body.proposalId))
      .limit(1);
    expect(rows[0]).toMatchObject({
      proposerId: fx.proposerId,
      segmentId: fx.segmentAId,
      status: "open",
      baseSegmentVersion: fx.segmentAVersion,
      reason: "원문 어휘 대응 개선",
      proposedText: "새로운 번역 제안",
    });

    // Contribution 기록 확인
    const events = await db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, fx.proposerId));
    const submitEvents = events.filter((e) => e.eventType === "proposal_submit");
    expect(submitEvents.length).toBeGreaterThanOrEqual(1);
    const latest = submitEvents[submitEvents.length - 1];
    expect(latest).toBeDefined();
    expect(latest?.entityRef).toMatchObject({
      translationId: fx.translationId,
      segmentId: fx.segmentAId,
      proposalId: res.body.proposalId,
    });

    // 정리(다음 케이스에 영향 없도록 현재 proposal 삭제 — contribution은 cascade 없음이라 함께 지움)
    await db.delete(contributions).where(eq(contributions.userId, fx.proposerId));
    await db.delete(proposals).where(eq(proposals.proposalId, res.body.proposalId));
  });

  it("409 duplicate_open_proposal when proposer already has an open one on the same segment", async () => {
    const sid = await sidForProposer();
    const first = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion,
        proposedText: "첫 제안",
      })
      .expect(201);

    const dup = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion,
        proposedText: "두 번째 시도",
      })
      .expect(409);
    expect(dup.body.code).toBe("duplicate_open_proposal");
    expect(dup.body.existingProposalId).toBe(first.body.proposalId);

    await db.delete(contributions).where(eq(contributions.userId, fx.proposerId));
    await db.delete(proposals).where(eq(proposals.proposalId, first.body.proposalId));
  });

  it("409 rebase_required when baseSegmentVersion differs from current", async () => {
    const sid = await sidForProposer();
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion + 10, // 잘못된 스냅샷
        proposedText: "버전 어긋남",
      })
      .expect(409);
    expect(res.body.code).toBe("rebase_required");
    expect(res.body.currentVersion).toBe(fx.segmentAVersion);
    expect(typeof res.body.currentText).toBe("string");
  });

  it("404 when segment belongs to a different translation/source", async () => {
    const sid = await sidForProposer();
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.otherSegmentId, // 다른 source 소유
        baseSegmentVersion: 0,
        proposedText: "여기 소속이 아닌 segment",
      })
      .expect(404);
    expect(res.body.code).toBe("not_found");
  });

  it("404 for unknown slug", async () => {
    const sid = await sidForProposer();
    await request(app.getHttpServer())
      .post(`/api/translations/does-not-exist-${randomUUID()}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion,
        proposedText: "아무 텍스트",
      })
      .expect(404);
  });

  it("400 when proposedText is whitespace only", async () => {
    const sid = await sidForProposer();
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        baseSegmentVersion: fx.segmentAVersion,
        proposedText: "    \n   ",
      })
      .expect(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("400 when baseSegmentVersion missing (DTO validation)", async () => {
    const sid = await sidForProposer();
    await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals`)
      .set("Cookie", `sid=${sid}`)
      .send({
        segmentId: fx.segmentAId,
        proposedText: "version 빠짐",
      })
      .expect(400);
  });
});

async function seed(db: Db): Promise<Fixture> {
  const mk = randomUUID().slice(0, 8);

  const [importer] = await db
    .insert(users)
    .values({ email: `prop-create-imp-${mk}@example.invalid`, displayName: "Importer" })
    .returning();
  const [proposer] = await db
    .insert(users)
    .values({ email: `prop-create-prop-${mk}@example.invalid`, displayName: "Proposer" })
    .returning();
  if (!importer || !proposer) throw new Error("user seed failed");

  const [source] = await db
    .insert(sources)
    .values({
      title: `Create Fixture ${mk}`,
      author: ["A"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9996.${mk}`,
      sourceVersion: "v1",
      importedBy: importer.id,
    })
    .returning();
  if (!source) throw new Error("source seed failed");

  const segRows = await db
    .insert(segments)
    .values([
      { sourceId: source.sourceId, order: 0, originalText: "First.", kind: "body" },
      { sourceId: source.sourceId, order: 1, originalText: "Second.", kind: "body" },
    ])
    .returning();
  const [segA, segB] = segRows;
  if (!segA || !segB) throw new Error("segment seed failed");

  const slug = `proposal-create-${mk}`;
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
  if (!translation) throw new Error("translation seed failed");

  await db.insert(translationSegments).values([
    {
      translationId: translation.translationId,
      segmentId: segA.segmentId,
      text: "현재 A",
      version: 2,
    },
    {
      translationId: translation.translationId,
      segmentId: segB.segmentId,
      text: "현재 B",
      version: 0,
    },
  ]);

  // 다른 source + 다른 segment — "segment 소속 검증" 케이스용.
  const [otherSource] = await db
    .insert(sources)
    .values({
      title: `Other ${mk}`,
      author: ["B"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9995.${mk}`,
      sourceVersion: "v1",
      importedBy: importer.id,
    })
    .returning();
  if (!otherSource) throw new Error("other source seed failed");
  const [otherSeg] = await db
    .insert(segments)
    .values({ sourceId: otherSource.sourceId, order: 0, originalText: "Other.", kind: "body" })
    .returning();
  if (!otherSeg) throw new Error("other segment seed failed");

  return {
    importerId: importer.id,
    proposerId: proposer.id,
    sourceId: source.sourceId,
    translationId: translation.translationId,
    slug,
    segmentAId: segA.segmentId,
    segmentBId: segB.segmentId,
    segmentAVersion: 2,
    segmentBVersion: 0,
    otherSourceId: otherSource.sourceId,
    otherSegmentId: otherSeg.segmentId,
  };
}

async function cleanup(db: Db, fx: Fixture): Promise<void> {
  // contributions 테이블은 cascade 없음 — 남은 row 명시 정리.
  await db
    .delete(contributions)
    .where(inArray(contributions.userId, [fx.importerId, fx.proposerId]));
  await db.delete(sources).where(inArray(sources.sourceId, [fx.sourceId, fx.otherSourceId]));
  await db.delete(users).where(inArray(users.id, [fx.importerId, fx.proposerId]));
}
