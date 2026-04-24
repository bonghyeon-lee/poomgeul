/**
 * ADR-0007-1 e2e — blocklist CRUD 3엔드포인트 + ProposalService.create 게이트.
 *
 * TestModule은 strategy-free 구성(AuthModule 대신 SessionGuard·PgSessionStore만
 * 재선언 — PR#2~C4와 동일). 각 case는 독립 fixture 유지를 위해 afterEach에서
 * proposals/blocklist/contributions 전체 정리.
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
  isNull,
  proposalBlocklist,
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
import { BlocklistController } from "../../src/modules/proposal/blocklist.controller.js";
import { ProposalController } from "../../src/modules/proposal/proposal.controller.js";
import { ProposalRepository } from "../../src/modules/proposal/proposal.repository.js";
import { ProposalService } from "../../src/modules/proposal/proposal.service.js";
import { TEST_DATABASE_URL } from "../db/test-db.js";

@Module({
  controllers: [ProposalController, BlocklistController],
  providers: [
    { provide: DB_TOKEN, useFactory: () => createDb(TEST_DATABASE_URL) },
    { provide: SESSION_STORE, useClass: PgSessionStore },
    SessionGuard,
    ProposalService,
    ProposalRepository,
  ],
})
class TestBlocklistModule {}

type Fixture = {
  leadId: string;
  proposerId: string;
  otherId: string;
  sourceId: string;
  translationId: string;
  slug: string;
  segmentId: string;
  segmentVersion: number;
};

describe("ADR-0007 blocklist (e2e)", () => {
  let app: INestApplication;
  let db: Db;
  let store: PgSessionStore;
  let fx: Fixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestBlocklistModule],
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

  afterEach(async () => {
    await db.delete(proposalBlocklist).where(eq(proposalBlocklist.translationId, fx.translationId));
    await db
      .delete(contributions)
      .where(inArray(contributions.userId, [fx.leadId, fx.proposerId, fx.otherId]));
    await db.delete(proposals).where(eq(proposals.translationId, fx.translationId));
  });

  afterAll(async () => {
    await cleanup(db, fx);
    await app.close();
    await db.close();
  });

  async function sidFor(userId: string): Promise<string> {
    const s = await store.create({ userId });
    return s.sessionId;
  }

  // ---------- Block/Unblock CRUD ----------

  describe("POST /api/translations/:slug/blocklist", () => {
    it("201: lead blocks proposer, entry row visible via GET", async () => {
      const sid = await sidFor(fx.leadId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId, reason: "반복 저품질" })
        .expect(201);
      expect(res.body).toMatchObject({
        translationId: fx.translationId,
        userId: fx.proposerId,
        blockedBy: fx.leadId,
        reason: "반복 저품질",
        revokedAt: null,
      });

      const list = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].userId).toBe(fx.proposerId);
    });

    it("re-blocking after revoke reuses the same row and clears revoked_at", async () => {
      const sid = await sidFor(fx.leadId);
      // 1차 차단
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId })
        .expect(201);
      // 해제
      await request(app.getHttpServer())
        .delete(`/api/translations/${fx.slug}/blocklist/${fx.proposerId}`)
        .set("Cookie", `sid=${sid}`)
        .expect(204);
      // 재차단 (같은 PK 재사용 기대)
      const re = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId, reason: "재발" })
        .expect(201);
      expect(re.body).toMatchObject({
        revokedAt: null,
        revokedBy: null,
        reason: "재발",
      });

      // DB에 row 하나(PK)라는 것을 확인.
      const rows = await db
        .select()
        .from(proposalBlocklist)
        .where(eq(proposalBlocklist.translationId, fx.translationId));
      expect(rows).toHaveLength(1);
    });

    it("400 validation_failed when lead tries to block themselves", async () => {
      const sid = await sidFor(fx.leadId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.leadId })
        .expect(400);
      expect(res.body.code).toBe("validation_failed");
    });

    it("401 without session", async () => {
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .send({ userId: fx.proposerId })
        .expect(401);
    });

    it("403 when requester is not the lead", async () => {
      const sid = await sidFor(fx.otherId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId })
        .expect(403);
      expect(res.body.code).toBe("forbidden");
    });

    it("404 for unknown slug", async () => {
      const sid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/does-not-exist-${randomUUID()}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId })
        .expect(404);
    });
  });

  describe("DELETE /api/translations/:slug/blocklist/:userId", () => {
    it("204: active block becomes revoked (soft delete)", async () => {
      const sid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/translations/${fx.slug}/blocklist/${fx.proposerId}`)
        .set("Cookie", `sid=${sid}`)
        .expect(204);

      // row는 그대로, revoked_at이 set돼 있어야 한다(soft delete).
      const rows = await db
        .select()
        .from(proposalBlocklist)
        .where(eq(proposalBlocklist.translationId, fx.translationId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.revokedAt).not.toBeNull();
      expect(rows[0]?.revokedBy).toBe(fx.leadId);
    });

    it("204 idempotent: revoking a non-existent block is a no-op", async () => {
      const sid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .delete(`/api/translations/${fx.slug}/blocklist/${fx.proposerId}`)
        .set("Cookie", `sid=${sid}`)
        .expect(204);
    });

    it("403 when requester is not the lead", async () => {
      const sid = await sidFor(fx.otherId);
      await request(app.getHttpServer())
        .delete(`/api/translations/${fx.slug}/blocklist/${fx.proposerId}`)
        .set("Cookie", `sid=${sid}`)
        .expect(403);
    });
  });

  describe("GET /api/translations/:slug/blocklist", () => {
    it("403 for non-lead (list is lead-only)", async () => {
      const sid = await sidFor(fx.otherId);
      await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .expect(403);
    });

    it("lead sees both active and revoked rows", async () => {
      const sid = await sidFor(fx.leadId);
      // 두 명 차단 → 하나는 해제
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.proposerId, reason: "A" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .send({ userId: fx.otherId, reason: "B" })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/translations/${fx.slug}/blocklist/${fx.otherId}`)
        .set("Cookie", `sid=${sid}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${sid}`)
        .expect(200);
      expect(res.body).toHaveLength(2);
      const byUser = Object.fromEntries(
        (res.body as Array<{ userId: string; revokedAt: string | null }>).map((r) => [r.userId, r]),
      );
      expect(byUser[fx.proposerId]?.revokedAt).toBeNull();
      expect(byUser[fx.otherId]?.revokedAt).not.toBeNull();
    });
  });

  // ---------- Gate on ProposalService.create ----------

  describe("ProposalService.create blocklist gate", () => {
    it("blocked user receives 403 blocked_by_lead on new proposal attempts", async () => {
      const leadSid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${leadSid}`)
        .send({ userId: fx.proposerId })
        .expect(201);

      const proposerSid = await sidFor(fx.proposerId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals`)
        .set("Cookie", `sid=${proposerSid}`)
        .send({
          segmentId: fx.segmentId,
          baseSegmentVersion: fx.segmentVersion,
          proposedText: "새 제안",
        })
        .expect(403);
      expect(res.body.code).toBe("blocked_by_lead");
    });

    it("gate fires BEFORE segment/version checks (policy gate first — ADR-0007 §7)", async () => {
      const leadSid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${leadSid}`)
        .send({ userId: fx.proposerId })
        .expect(201);

      const proposerSid = await sidFor(fx.proposerId);
      // segmentId는 실제로 유효하지 않은 UUID, baseSegmentVersion도 엉망.
      // blocklist gate가 먼저라 403이 나야 한다(404/409 아님).
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals`)
        .set("Cookie", `sid=${proposerSid}`)
        .send({
          segmentId: randomUUID(),
          baseSegmentVersion: 9999,
          proposedText: "아무 텍스트",
        })
        .expect(403);
      expect(res.body.code).toBe("blocked_by_lead");
    });

    it("after revoke, the same user can create proposals again", async () => {
      const leadSid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/blocklist`)
        .set("Cookie", `sid=${leadSid}`)
        .send({ userId: fx.proposerId })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/translations/${fx.slug}/blocklist/${fx.proposerId}`)
        .set("Cookie", `sid=${leadSid}`)
        .expect(204);

      const proposerSid = await sidFor(fx.proposerId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals`)
        .set("Cookie", `sid=${proposerSid}`)
        .send({
          segmentId: fx.segmentId,
          baseSegmentVersion: fx.segmentVersion,
          proposedText: "재개된 제안",
        })
        .expect(201);
      expect(res.body.status).toBe("open");
    });

    it("lead themselves is exempt from the blocklist gate (self-block is refused upstream, but sanity)", async () => {
      // 리드 본인은 400으로 자기 차단이 막힌다. 만약 수동으로 DB에 row를 심어도
      // gate가 leadId를 exempt하므로 create 성공해야 한다(무력화 방지).
      await db.insert(proposalBlocklist).values({
        translationId: fx.translationId,
        userId: fx.leadId, // 리드가 DB-level로 차단된 상태
        blockedBy: fx.leadId,
      });

      const leadSid = await sidFor(fx.leadId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals`)
        .set("Cookie", `sid=${leadSid}`)
        .send({
          segmentId: fx.segmentId,
          baseSegmentVersion: fx.segmentVersion,
          proposedText: "리드 본인의 제안",
        })
        .expect(201);
      expect(res.body.status).toBe("open");
    });
  });

  // ---------- Safety: partial index sanity ----------

  it("partial index: revoked_at IS NULL 조회에서 해제된 row는 제외 (isBlocked=false)", async () => {
    // 직접 rows 두 개 심음: 하나는 active, 하나는 revoked (과거에 차단됐다가 해제됨).
    await db.insert(proposalBlocklist).values({
      translationId: fx.translationId,
      userId: fx.proposerId,
      blockedBy: fx.leadId,
    });
    await db.insert(proposalBlocklist).values({
      translationId: fx.translationId,
      userId: fx.otherId,
      blockedBy: fx.leadId,
      revokedAt: new Date(),
      revokedBy: fx.leadId,
    });

    // 활성 조회는 revoked row를 보이지 않아야.
    const activeRows = await db
      .select()
      .from(proposalBlocklist)
      .where(eq(proposalBlocklist.translationId, fx.translationId));
    expect(activeRows).toHaveLength(2);
    const activeOnly = await db
      .select()
      .from(proposalBlocklist)
      .where(
        and(
          eq(proposalBlocklist.translationId, fx.translationId),
          isNull(proposalBlocklist.revokedAt),
        ),
      );
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.userId).toBe(fx.proposerId);
  });
});

import { and } from "@poomgeul/db";

async function seed(db: Db): Promise<Fixture> {
  const mk = randomUUID().slice(0, 8);
  const [lead] = await db
    .insert(users)
    .values({ email: `blk-lead-${mk}@example.invalid`, displayName: "Lead" })
    .returning();
  const [proposer] = await db
    .insert(users)
    .values({ email: `blk-prop-${mk}@example.invalid`, displayName: "Proposer" })
    .returning();
  const [other] = await db
    .insert(users)
    .values({ email: `blk-other-${mk}@example.invalid`, displayName: "Other" })
    .returning();
  if (!lead || !proposer || !other) throw new Error("user seed failed");

  const [source] = await db
    .insert(sources)
    .values({
      title: `Blocklist Fixture ${mk}`,
      author: ["A"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9992.${mk}`,
      sourceVersion: "v1",
      importedBy: lead.id,
    })
    .returning();
  if (!source) throw new Error("source seed failed");
  const [seg] = await db
    .insert(segments)
    .values({ sourceId: source.sourceId, order: 0, originalText: "Origin.", kind: "body" })
    .returning();
  if (!seg) throw new Error("segment seed failed");

  const slug = `blocklist-${mk}`;
  const [translation] = await db
    .insert(translations)
    .values({
      sourceId: source.sourceId,
      targetLang: "ko",
      leadId: lead.id,
      status: "draft",
      license: "CC-BY",
      slug,
    })
    .returning();
  if (!translation) throw new Error("translation seed failed");

  await db.insert(translationSegments).values({
    translationId: translation.translationId,
    segmentId: seg.segmentId,
    text: "원본 번역",
    version: 3,
  });

  return {
    leadId: lead.id,
    proposerId: proposer.id,
    otherId: other.id,
    sourceId: source.sourceId,
    translationId: translation.translationId,
    slug,
    segmentId: seg.segmentId,
    segmentVersion: 3,
  };
}

async function cleanup(db: Db, fx: Fixture): Promise<void> {
  await db
    .delete(contributions)
    .where(inArray(contributions.userId, [fx.leadId, fx.proposerId, fx.otherId]));
  await db.delete(sources).where(eq(sources.sourceId, fx.sourceId));
  await db.delete(users).where(inArray(users.id, [fx.leadId, fx.proposerId, fx.otherId]));
}
