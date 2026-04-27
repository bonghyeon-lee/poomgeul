/**
 * §5 세그먼트 에디터 — PATCH /api/translations/:slug/segments/:segmentId e2e.
 *
 * 전략은 proposal-decide와 동일. Fresh 세그먼트 상태로 복원하기 위해 afterEach
 * 마다 version/text/status를 초기값으로 되돌리고, 생성된 revisions/contributions
 * 도 정리한다.
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
import { SegmentEditController } from "../../src/modules/segment-edit/segment-edit.controller.js";
import { SegmentEditRepository } from "../../src/modules/segment-edit/segment-edit.repository.js";
import { SegmentEditService } from "../../src/modules/segment-edit/segment-edit.service.js";
import { TEST_DATABASE_URL } from "../db/test-db.js";

@Module({
  controllers: [SegmentEditController],
  providers: [
    { provide: DB_TOKEN, useFactory: () => createDb(TEST_DATABASE_URL) },
    { provide: SESSION_STORE, useClass: PgSessionStore },
    SessionGuard,
    SegmentEditService,
    SegmentEditRepository,
  ],
})
class TestSegmentEditModule {}

type Fixture = {
  leadId: string;
  otherUserId: string;
  sourceId: string;
  translationId: string;
  slug: string;
  segmentId: string;
  initialVersion: number;
  initialText: string;
};

describe("§5 세그먼트 에디터 (e2e) — PATCH /translations/:slug/segments/:segmentId", () => {
  let app: INestApplication;
  let db: Db;
  let store: PgSessionStore;
  let fx: Fixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestSegmentEditModule],
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
    await db
      .delete(contributions)
      .where(inArray(contributions.userId, [fx.leadId, fx.otherUserId]));
    await db
      .delete(translationRevisions)
      .where(eq(translationRevisions.translationId, fx.translationId));
    await db
      .update(translationSegments)
      .set({ text: fx.initialText, version: fx.initialVersion, status: "unreviewed" })
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

  // ---------- happy path ----------

  it("200: 리드가 직접 편집 — text·version 갱신, revision·contribution 기록", async () => {
    const sid = await sidFor(fx.leadId);
    const res = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "  리드가 직접 수정  ", commitMessage: "오타 수정" })
      .expect(200);

    expect(res.body).toMatchObject({
      segmentId: fx.segmentId,
      version: fx.initialVersion + 1,
      text: "리드가 직접 수정",
    });
    expect(res.body.revisionId).toBeTruthy();

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
      text: "리드가 직접 수정",
      version: fx.initialVersion + 1,
      lastEditorId: fx.leadId,
      status: "approved",
    });

    const revRows = await db
      .select()
      .from(translationRevisions)
      .where(eq(translationRevisions.translationId, fx.translationId));
    expect(revRows).toHaveLength(1);
    expect(revRows[0]).toMatchObject({
      translationId: fx.translationId,
      authorId: fx.leadId,
      mergedProposalId: null,
      commitMessage: "오타 수정",
    });

    const contribRows = await db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, fx.leadId));
    expect(contribRows).toHaveLength(1);
    expect(contribRows[0]?.eventType).toBe("segment_edit");
  });

  it("200: commitMessage 생략 → revision.commitMessage는 null", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `${fx.initialVersion}`)
      .send({ text: "간단 수정" })
      .expect(200);

    const revRows = await db
      .select()
      .from(translationRevisions)
      .where(eq(translationRevisions.translationId, fx.translationId));
    expect(revRows[0]?.commitMessage).toBeNull();
  });

  it('200: W/"N" weak ETag 형태도 수용', async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `W/"${fx.initialVersion}"`)
      .send({ text: "weak ok" })
      .expect(200);
  });

  it("200: no-op(현재 version·text와 동일) → revision 쓰지 않음", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: fx.initialText })
      .expect(200);

    const revRows = await db
      .select()
      .from(translationRevisions)
      .where(eq(translationRevisions.translationId, fx.translationId));
    expect(revRows).toHaveLength(0);
    const contribRows = await db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, fx.leadId));
    expect(contribRows).toHaveLength(0);
  });

  // ---------- error paths ----------

  it("412 precondition_failed: If-Match 누락", async () => {
    const sid = await sidFor(fx.leadId);
    const res = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .send({ text: "무언가" })
      .expect(412);
    expect(res.body.code).toBe("precondition_failed");
  });

  it("412 precondition_failed: If-Match 값이 숫자가 아님", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"abc"`)
      .send({ text: "무언가" })
      .expect(412);
  });

  it("401 without session", async () => {
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "무언가" })
      .expect(401);
  });

  it("403 forbidden: 리드가 아닌 사용자", async () => {
    const sid = await sidFor(fx.otherUserId);
    const res = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "무언가" })
      .expect(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("404 not_found: 존재하지 않는 slug", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/no-such-slug/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"0"`)
      .send({ text: "무언가" })
      .expect(404);
  });

  it("404 not_found: 다른 translation의 segmentId", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${randomUUID()}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "무언가" })
      .expect(404);
  });

  it("400 validation_failed: 공백-only text", async () => {
    const sid = await sidFor(fx.leadId);
    const res = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "   \n  " })
      .expect(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("400 validation_failed: text 누락", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ commitMessage: "메모만 있음" })
      .expect(400);
  });

  it("400 validation_failed: forbidNonWhitelisted — 알 수 없는 필드", async () => {
    const sid = await sidFor(fx.leadId);
    await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "ok", hackField: true })
      .expect(400);
  });

  it("409 rebase_required: If-Match가 현재 version과 다름", async () => {
    const sid = await sidFor(fx.leadId);
    const stale = fx.initialVersion - 1;
    const res = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${stale}"`)
      .send({ text: "뒤늦은 수정" })
      .expect(409);
    expect(res.body).toMatchObject({
      code: "rebase_required",
      currentVersion: fx.initialVersion,
      currentText: fx.initialText,
    });
  });

  it("2연속 편집: version·text가 단조 증가", async () => {
    const sid = await sidFor(fx.leadId);
    const r1 = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion}"`)
      .send({ text: "1차" })
      .expect(200);
    expect(r1.body.version).toBe(fx.initialVersion + 1);

    const r2 = await request(app.getHttpServer())
      .patch(`/api/translations/${fx.slug}/segments/${fx.segmentId}`)
      .set("Cookie", `sid=${sid}`)
      .set("If-Match", `"${fx.initialVersion + 1}"`)
      .send({ text: "2차" })
      .expect(200);
    expect(r2.body.version).toBe(fx.initialVersion + 2);
    expect(r2.body.text).toBe("2차");

    const revRows = await db
      .select()
      .from(translationRevisions)
      .where(eq(translationRevisions.translationId, fx.translationId));
    expect(revRows).toHaveLength(2);
  });
});

async function seed(db: Db): Promise<Fixture> {
  const mk = randomUUID().slice(0, 8);
  const [lead] = await db
    .insert(users)
    .values({ email: `edit-lead-${mk}@example.invalid`, displayName: "Lead" })
    .returning();
  const [other] = await db
    .insert(users)
    .values({ email: `edit-other-${mk}@example.invalid`, displayName: "Other" })
    .returning();
  if (!lead || !other) throw new Error("user seed failed");

  const [source] = await db
    .insert(sources)
    .values({
      title: `Edit Fixture ${mk}`,
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

  const slug = `edit-${mk}`;
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

  const initialText = "원본 번역";
  const initialVersion = 3;
  await db.insert(translationSegments).values({
    translationId: translation.translationId,
    segmentId: seg.segmentId,
    text: initialText,
    version: initialVersion,
  });

  return {
    leadId: lead.id,
    otherUserId: other.id,
    sourceId: source.sourceId,
    translationId: translation.translationId,
    slug,
    segmentId: seg.segmentId,
    initialVersion,
    initialText,
  };
}

async function cleanup(db: Db, fx: Fixture): Promise<void> {
  await db.delete(contributions).where(inArray(contributions.userId, [fx.leadId, fx.otherUserId]));
  await db.delete(sources).where(eq(sources.sourceId, fx.sourceId));
  await db.delete(users).where(inArray(users.id, [fx.leadId, fx.otherUserId]));
}
