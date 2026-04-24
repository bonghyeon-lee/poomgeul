/**
 * ADR-0006 C4 — POST /comments e2e.
 *
 * GET /comments는 C1 스펙에서 이미 커버. 여기서는 생성 경로의
 * 201 · 401 · 404 · 400 · terminal proposal 허용 · Contribution 기록만.
 * TestModule은 C2/C3과 동일 strategy-free 구성.
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
class TestProposalCommentModule {}

type Fixture = {
  leadId: string;
  proposerId: string;
  otherId: string;
  sourceId: string;
  translationId: string;
  slug: string;
  segmentId: string;
  openProposalId: string;
  mergedProposalId: string;
};

describe("POST /api/translations/:slug/proposals/:proposalId/comments (e2e)", () => {
  let app: INestApplication;
  let db: Db;
  let store: PgSessionStore;
  let fx: Fixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestProposalCommentModule],
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
    // 각 테스트가 남긴 댓글과 contribution 정리.
    await db
      .delete(proposalComments)
      .where(inArray(proposalComments.proposalId, [fx.openProposalId, fx.mergedProposalId]));
    await db
      .delete(contributions)
      .where(inArray(contributions.userId, [fx.leadId, fx.proposerId, fx.otherId]));
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

  it("authenticated user posts a comment → 201 with author + review_comment contribution", async () => {
    const sid = await sidFor(fx.otherId);
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals/${fx.openProposalId}/comments`)
      .set("Cookie", `sid=${sid}`)
      .send({ body: "  이 번역이 더 자연스럽습니다.  " })
      .expect(201);

    expect(typeof res.body.commentId).toBe("string");
    expect(res.body.body).toBe("이 번역이 더 자연스럽습니다."); // trim 후 저장
    expect(res.body.author).toMatchObject({ userId: fx.otherId });
    expect(typeof res.body.createdAt).toBe("string");

    const rows = await db
      .select()
      .from(proposalComments)
      .where(eq(proposalComments.commentId, res.body.commentId));
    expect(rows[0]).toMatchObject({
      proposalId: fx.openProposalId,
      authorId: fx.otherId,
      body: "이 번역이 더 자연스럽습니다.",
    });

    const events = await db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, fx.otherId));
    const reviewEvents = events.filter((e) => e.eventType === "review_comment");
    expect(reviewEvents).toHaveLength(1);
    expect(reviewEvents[0]?.entityRef).toMatchObject({
      translationId: fx.translationId,
      segmentId: fx.segmentId,
      proposalId: fx.openProposalId,
      commentId: res.body.commentId,
    });
  });

  it("allows comments on terminal (merged) proposals for post-resolution discussion", async () => {
    const sid = await sidFor(fx.leadId);
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals/${fx.mergedProposalId}/comments`)
      .set("Cookie", `sid=${sid}`)
      .send({ body: "머지 후 사후 메모" })
      .expect(201);
    expect(res.body.body).toBe("머지 후 사후 메모");
  });

  it("401 when no session cookie", async () => {
    await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals/${fx.openProposalId}/comments`)
      .send({ body: "no auth" })
      .expect(401);
  });

  it("400 validation_failed when body is whitespace only", async () => {
    const sid = await sidFor(fx.otherId);
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals/${fx.openProposalId}/comments`)
      .set("Cookie", `sid=${sid}`)
      .send({ body: "   \n  " })
      .expect(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("400 when body is missing (DTO validation)", async () => {
    const sid = await sidFor(fx.otherId);
    await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals/${fx.openProposalId}/comments`)
      .set("Cookie", `sid=${sid}`)
      .send({})
      .expect(400);
  });

  it("404 for unknown proposal id", async () => {
    const sid = await sidFor(fx.otherId);
    const res = await request(app.getHttpServer())
      .post(`/api/translations/${fx.slug}/proposals/${randomUUID()}/comments`)
      .set("Cookie", `sid=${sid}`)
      .send({ body: "doesn't matter" })
      .expect(404);
    expect(res.body.code).toBe("not_found");
  });

  it("404 for unknown slug", async () => {
    const sid = await sidFor(fx.otherId);
    await request(app.getHttpServer())
      .post(
        `/api/translations/does-not-exist-${randomUUID()}/proposals/${fx.openProposalId}/comments`,
      )
      .set("Cookie", `sid=${sid}`)
      .send({ body: "x" })
      .expect(404);
  });
});

async function seed(db: Db): Promise<Fixture> {
  const mk = randomUUID().slice(0, 8);
  const [lead] = await db
    .insert(users)
    .values({ email: `comm-lead-${mk}@example.invalid`, displayName: "Lead" })
    .returning();
  const [proposer] = await db
    .insert(users)
    .values({ email: `comm-prop-${mk}@example.invalid`, displayName: "Proposer" })
    .returning();
  const [other] = await db
    .insert(users)
    .values({ email: `comm-other-${mk}@example.invalid`, displayName: "Other" })
    .returning();
  if (!lead || !proposer || !other) throw new Error("user seed failed");

  const [source] = await db
    .insert(sources)
    .values({
      title: `Comment Fixture ${mk}`,
      author: ["A"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9993.${mk}`,
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

  const slug = `comments-${mk}`;
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
    text: "현재 번역",
    version: 1,
  });

  const [open] = await db
    .insert(proposals)
    .values({
      translationId: translation.translationId,
      segmentId: seg.segmentId,
      baseSegmentVersion: 1,
      proposedText: "열린 제안",
      proposerId: proposer.id,
    })
    .returning({ proposalId: proposals.proposalId });
  const [merged] = await db
    .insert(proposals)
    .values({
      translationId: translation.translationId,
      segmentId: seg.segmentId,
      baseSegmentVersion: 0,
      proposedText: "예전 제안",
      proposerId: proposer.id,
      status: "merged",
      resolvedBy: lead.id,
      resolvedAt: new Date(Date.now() - 60_000),
    })
    .returning({ proposalId: proposals.proposalId });
  if (!open || !merged) throw new Error("proposal seed failed");

  return {
    leadId: lead.id,
    proposerId: proposer.id,
    otherId: other.id,
    sourceId: source.sourceId,
    translationId: translation.translationId,
    slug,
    segmentId: seg.segmentId,
    openProposalId: open.proposalId,
    mergedProposalId: merged.proposalId,
  };
}

async function cleanup(db: Db, fx: Fixture): Promise<void> {
  await db
    .delete(contributions)
    .where(inArray(contributions.userId, [fx.leadId, fx.proposerId, fx.otherId]));
  await db.delete(sources).where(eq(sources.sourceId, fx.sourceId));
  await db.delete(users).where(inArray(users.id, [fx.leadId, fx.proposerId, fx.otherId]));
}
