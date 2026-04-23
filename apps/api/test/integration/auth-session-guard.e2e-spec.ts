/**
 * End-to-end test for /auth/me and /auth/logout via a minimal Nest app that
 * wires AuthController against a real DB (TEST_DATABASE_URL) but skips the
 * GitHub strategy — the OAuth callback flow is exercised separately.
 *
 * This lives under test/integration so it rides on the same Postgres setup
 * (TEST_LAYER=integration) as the other int-specs.
 */

import { randomUUID } from "node:crypto";

import { type INestApplication, Module, RequestMethod } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createDb, type Db, eq, users } from "@poomgeul/db";
import request from "supertest";

import { AuthController } from "../../src/modules/auth/auth.controller.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { PgSessionStore } from "../../src/modules/auth/pg-session-store.js";
import { SessionGuard } from "../../src/modules/auth/session.guard.js";
import { SESSION_STORE } from "../../src/modules/auth/session-store.js";
import { DB_TOKEN } from "../../src/modules/source/source.repository.js";
import { TEST_DATABASE_URL } from "../db/test-db.js";

@Module({
  controllers: [AuthController],
  providers: [
    { provide: DB_TOKEN, useFactory: () => createDb(TEST_DATABASE_URL) },
    { provide: SESSION_STORE, useClass: PgSessionStore },
    AuthService,
    SessionGuard,
  ],
})
class TestAuthModule {}

describe("AuthController (e2e, strategy-free)", () => {
  let app: INestApplication;
  let db: Db;
  let store: PgSessionStore;

  const cleanupEmails: string[] = [];

  beforeAll(async () => {
    // The controller requires SESSION_SECRET at handler time for /github*.
    // /me and /logout don't hit it, but keep a harmless default so any future
    // handler reference doesn't surprise us.
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-16-chars-min";

    const moduleRef = await Test.createTestingModule({
      imports: [TestAuthModule],
    }).compile();

    // Match production prefix behaviour (`setGlobalPrefix("api")`) so supertest
    // paths line up with what the web client will hit.
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", {
      exclude: [{ path: "healthz", method: RequestMethod.GET }],
    });
    await app.init();

    db = moduleRef.get<Db>(DB_TOKEN);
    store = moduleRef.get(SESSION_STORE);
  });

  afterAll(async () => {
    await app.close();
    for (const email of cleanupEmails) {
      await db.delete(users).where(eq(users.email, email));
    }
    await db.close();
  });

  async function seedUser(): Promise<{ id: string; email: string }> {
    const email = `guard-e2e-${randomUUID()}@example.invalid`;
    cleanupEmails.push(email);
    const [row] = await db.insert(users).values({ email }).returning();
    if (!row) throw new Error("seed user insert returned no row");
    return { id: row.id, email: row.email };
  }

  it("GET /api/auth/me without cookie → 401", async () => {
    await request(app.getHttpServer()).get("/api/auth/me").expect(401);
  });

  it("GET /api/auth/me with invalid sid cookie → 401", async () => {
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", "sid=not-a-uuid")
      .expect(401);
  });

  it("GET /api/auth/me with valid session → public user JSON", async () => {
    const user = await seedUser();
    const session = await store.create({ userId: user.id });

    const res = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", `sid=${session.sessionId}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: user.id,
      email: user.email,
      tier: "new",
    });
  });

  it("POST /api/auth/logout revokes the session and clears the cookie", async () => {
    const user = await seedUser();
    const session = await store.create({ userId: user.id });

    const res = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Cookie", `sid=${session.sessionId}`)
      .expect(204);

    const setCookie = firstSetCookie(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/^sid=;/);
    expect(setCookie).toMatch(/HttpOnly/i);

    // Subsequent /me with the same cookie must be rejected.
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", `sid=${session.sessionId}`)
      .expect(401);
  });

  it("GET /api/auth/me with a revoked session → 401", async () => {
    const user = await seedUser();
    const session = await store.create({ userId: user.id });
    await store.revoke(session.sessionId);

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", `sid=${session.sessionId}`)
      .expect(401);
  });
});

function firstSetCookie(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}
