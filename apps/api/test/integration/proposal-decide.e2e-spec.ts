/**
 * ADR-0006 C3 — decide(approve/reject) + withdraw e2e.
 *
 * TestModule은 C2 스펙과 동일 전략(AuthModule 우회, SessionGuard·PgSessionStore만
 * providers로 재선언). 각 케이스에서 필요한 proposal을 fresh seed하고 afterEach로
 * 정리한다 — 상태 전이가 돌이킬 수 없어 withRollback·공유 fixture가 부적합.
 */

import { randomUUID } from "node:crypto";

import { type INestApplication, Module, RequestMethod, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  and,
  contributions,
  createDb,
  type Db,
  eq,
  inArray,
  proposals,
  segments,
  sources,
  translationRevisions,
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
class TestProposalDecideModule {}

type Fixture = {
  leadId: string;
  proposerId: string;
  bystanderId: string;
  sourceId: string;
  translationId: string;
  slug: string;
  segmentId: string;
  initialVersion: number;
};

describe("Proposal decide + withdraw (e2e)", () => {
  let app: INestApplication;
  let db: Db;
  let store: PgSessionStore;
  let fx: Fixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestProposalDecideModule],
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
    // 각 테스트가 남긴 proposal·revision·contribution을 비움 (source/user는 유지).
    await db
      .delete(contributions)
      .where(inArray(contributions.userId, [fx.leadId, fx.proposerId, fx.bystanderId]));
    await db
      .delete(translationRevisions)
      .where(eq(translationRevisions.translationId, fx.translationId));
    await db.delete(proposals).where(eq(proposals.translationId, fx.translationId));
    // 세그먼트는 초기 version·text로 복원(다음 테스트가 base_segment_version 예상치를 유지하도록).
    await db
      .update(translationSegments)
      .set({ text: "원본 번역", version: fx.initialVersion, status: "unreviewed" })
      .where(
        and(
          eq(translationSegments.translationId, fx.translationId),
          eq(translationSegments.segmentId, fx.segmentId),
        ),
      );
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

  async function seedOpenProposal(opts?: { baseVersion?: number }): Promise<string> {
    const base = opts?.baseVersion ?? fx.initialVersion;
    const [row] = await db
      .insert(proposals)
      .values({
        translationId: fx.translationId,
        segmentId: fx.segmentId,
        baseSegmentVersion: base,
        proposedText: "새 제안 텍스트",
        reason: null,
        proposerId: fx.proposerId,
      })
      .returning({ proposalId: proposals.proposalId });
    if (!row) throw new Error("seed proposal failed");
    return row.proposalId;
  }

  // ---------- decide / approve ----------

  describe("POST /decide approve", () => {
    it("lead approves → merges segment, bumps version, inserts revision and contribution", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.leadId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "approve" })
        .expect(200);

      expect(res.body).toMatchObject({
        proposalId: pid,
        status: "merged",
      });
      expect(res.body.segment).toMatchObject({
        segmentId: fx.segmentId,
        version: fx.initialVersion + 1,
        text: "새 제안 텍스트",
      });
      expect(typeof res.body.revisionId).toBe("string");

      const segRows = await db
        .select()
        .from(translationSegments)
        .where(
          and(
            eq(translationSegments.translationId, fx.translationId),
            eq(translationSegments.segmentId, fx.segmentId),
          ),
        );
      expect(segRows[0]).toMatchObject({
        text: "새 제안 텍스트",
        version: fx.initialVersion + 1,
        status: "approved",
        lastEditorId: fx.proposerId,
      });

      const proposalRows = await db.select().from(proposals).where(eq(proposals.proposalId, pid));
      expect(proposalRows[0]).toMatchObject({
        status: "merged",
        resolvedBy: fx.leadId,
      });
      expect(proposalRows[0]?.resolvedAt).toBeInstanceOf(Date);

      const revisions = await db
        .select()
        .from(translationRevisions)
        .where(eq(translationRevisions.mergedProposalId, pid));
      expect(revisions).toHaveLength(1);
      expect(revisions[0]?.authorId).toBe(fx.proposerId);

      const events = await db
        .select()
        .from(contributions)
        .where(eq(contributions.userId, fx.proposerId));
      const merges = events.filter((e) => e.eventType === "proposal_merge");
      expect(merges.length).toBe(1);
      expect(merges[0]?.entityRef).toMatchObject({
        translationId: fx.translationId,
        segmentId: fx.segmentId,
        proposalId: pid,
      });
    });

    it("returns 409 rebase_required when the segment moved since the proposal was drafted", async () => {
      // proposal은 base_segment_version=0으로 두는데 실제 segment는 초기값(2)이 되어 불일치.
      const pid = await seedOpenProposal({ baseVersion: 0 });
      const sid = await sidFor(fx.leadId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "approve" })
        .expect(409);
      expect(res.body.code).toBe("rebase_required");
      expect(res.body.currentVersion).toBe(fx.initialVersion);
      expect(typeof res.body.currentText).toBe("string");

      // 상태는 여전히 open, segment도 그대로여야 한다.
      const proposalRows = await db.select().from(proposals).where(eq(proposals.proposalId, pid));
      expect(proposalRows[0]?.status).toBe("open");
      const segRows = await db
        .select()
        .from(translationSegments)
        .where(
          and(
            eq(translationSegments.translationId, fx.translationId),
            eq(translationSegments.segmentId, fx.segmentId),
          ),
        );
      expect(segRows[0]?.version).toBe(fx.initialVersion);
    });
  });

  // ---------- decide / reject ----------

  describe("POST /decide reject", () => {
    it("lead rejects → proposal status=rejected, no revision, no merge contribution", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.leadId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "reject" })
        .expect(200);

      expect(res.body).toMatchObject({ proposalId: pid, status: "rejected" });
      expect(typeof res.body.resolvedAt).toBe("string");

      const rows = await db.select().from(proposals).where(eq(proposals.proposalId, pid));
      expect(rows[0]).toMatchObject({ status: "rejected", resolvedBy: fx.leadId });

      const revisions = await db
        .select()
        .from(translationRevisions)
        .where(eq(translationRevisions.translationId, fx.translationId));
      expect(revisions).toHaveLength(0);
    });
  });

  // ---------- decide auth ----------

  describe("POST /decide auth and shape", () => {
    it("401 without session", async () => {
      const pid = await seedOpenProposal();
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .send({ action: "approve" })
        .expect(401);
    });

    it("403 forbidden when requester is not the translation lead", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.bystanderId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "approve" })
        .expect(403);
      expect(res.body.code).toBe("forbidden");
    });

    it("409 not_open when the proposal is already merged", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "approve" })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "reject" })
        .expect(409);
      expect(second.body.code).toBe("not_open");
      expect(second.body.status).toBe("merged");
    });

    it("400 validation_failed for invalid action value", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "nope" })
        .expect(400);
    });

    it("404 for proposal in a different translation", async () => {
      const sid = await sidFor(fx.leadId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${randomUUID()}/decide`)
        .set("Cookie", `sid=${sid}`)
        .send({ action: "approve" })
        .expect(404);
    });
  });

  // ---------- withdraw ----------

  describe("POST /withdraw", () => {
    it("proposer withdraws their own open proposal → status=withdrawn", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.proposerId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/withdraw`)
        .set("Cookie", `sid=${sid}`)
        .expect(200);
      expect(res.body).toMatchObject({ proposalId: pid, status: "withdrawn" });
      expect(typeof res.body.resolvedAt).toBe("string");

      const rows = await db.select().from(proposals).where(eq(proposals.proposalId, pid));
      expect(rows[0]).toMatchObject({ status: "withdrawn", resolvedBy: null });
    });

    it("403 when another user tries to withdraw the proposal", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.bystanderId);
      const res = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/withdraw`)
        .set("Cookie", `sid=${sid}`)
        .expect(403);
      expect(res.body.code).toBe("forbidden");
    });

    it("409 not_open when proposal is already withdrawn", async () => {
      const pid = await seedOpenProposal();
      const sid = await sidFor(fx.proposerId);
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/withdraw`)
        .set("Cookie", `sid=${sid}`)
        .expect(200);
      const second = await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/withdraw`)
        .set("Cookie", `sid=${sid}`)
        .expect(409);
      expect(second.body.code).toBe("not_open");
    });

    it("401 without session", async () => {
      const pid = await seedOpenProposal();
      await request(app.getHttpServer())
        .post(`/api/translations/${fx.slug}/proposals/${pid}/withdraw`)
        .expect(401);
    });
  });
});

async function seed(db: Db): Promise<Fixture> {
  const mk = randomUUID().slice(0, 8);
  const [lead] = await db
    .insert(users)
    .values({ email: `decide-lead-${mk}@example.invalid`, displayName: "Lead" })
    .returning();
  const [proposer] = await db
    .insert(users)
    .values({ email: `decide-prop-${mk}@example.invalid`, displayName: "Proposer" })
    .returning();
  const [bystander] = await db
    .insert(users)
    .values({ email: `decide-bys-${mk}@example.invalid`, displayName: "Bystander" })
    .returning();
  if (!lead || !proposer || !bystander) throw new Error("user seed failed");

  const [source] = await db
    .insert(sources)
    .values({
      title: `Decide Fixture ${mk}`,
      author: ["A"],
      originalLang: "en",
      license: "CC-BY",
      attributionSource: `https://arxiv.org/abs/9994.${mk}`,
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

  const slug = `decide-${mk}`;
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
    version: 2,
  });

  return {
    leadId: lead.id,
    proposerId: proposer.id,
    bystanderId: bystander.id,
    sourceId: source.sourceId,
    translationId: translation.translationId,
    slug,
    segmentId: seg.segmentId,
    initialVersion: 2,
  };
}

async function cleanup(db: Db, fx: Fixture): Promise<void> {
  await db
    .delete(contributions)
    .where(inArray(contributions.userId, [fx.leadId, fx.proposerId, fx.bystanderId]));
  await db.delete(sources).where(eq(sources.sourceId, fx.sourceId));
  await db.delete(users).where(inArray(users.id, [fx.leadId, fx.proposerId, fx.bystanderId]));
}
