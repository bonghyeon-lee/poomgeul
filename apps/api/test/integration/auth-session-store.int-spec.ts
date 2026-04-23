/**
 * Integration tests for PgSessionStore.
 *
 * Exercises the real Postgres + drizzle-orm path against TEST_DATABASE_URL,
 * one transaction per case via withRollback so fixtures never leak.
 */

import { randomUUID } from "node:crypto";

import { eq, sessions, users } from "@poomgeul/db";

import { PgSessionStore } from "../../src/modules/auth/pg-session-store.js";
import { DEFAULT_SESSION_TTL_MS } from "../../src/modules/auth/session-store.js";
import { withRollback } from "../db/test-db.js";

describe("PgSessionStore", () => {
  it("creates a session, returns it as active, then stops returning it after revoke", async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ email: `auth-it-${randomUUID()}@example.invalid` })
        .returning();
      if (!user) throw new Error("user insert returned no row");

      const store = new PgSessionStore(db);

      const created = await store.create({ userId: user.id });
      expect(created.userId).toBe(user.id);
      expect(created.revokedAt).toBeNull();
      expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const active = await store.findActive(created.sessionId);
      expect(active).not.toBeNull();
      expect(active?.user.id).toBe(user.id);
      expect(active?.session.sessionId).toBe(created.sessionId);

      await store.revoke(created.sessionId);

      const afterRevoke = await store.findActive(created.sessionId);
      expect(afterRevoke).toBeNull();
    });
  });

  it("does not return expired sessions as active", async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ email: `auth-it-exp-${randomUUID()}@example.invalid` })
        .returning();
      if (!user) throw new Error("user insert returned no row");

      const store = new PgSessionStore(db);
      const session = await store.create({ userId: user.id });

      // Force the row's expires_at into the past.
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(sessions.sessionId, session.sessionId));

      expect(await store.findActive(session.sessionId)).toBeNull();
    });
  });

  it("defaults to the documented TTL", async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ email: `auth-it-ttl-${randomUUID()}@example.invalid` })
        .returning();
      if (!user) throw new Error("user insert returned no row");

      const store = new PgSessionStore(db);
      const before = Date.now();
      const session = await store.create({ userId: user.id });
      const after = Date.now();

      const ttl = session.expiresAt.getTime() - before;
      const ttlUpper = session.expiresAt.getTime() - after;
      // Allow a small tolerance for DB clock skew vs. process.now.
      expect(ttl).toBeGreaterThanOrEqual(DEFAULT_SESSION_TTL_MS - 5_000);
      expect(ttlUpper).toBeLessThanOrEqual(DEFAULT_SESSION_TTL_MS + 5_000);
    });
  });

  it("ignores malformed session ids without throwing", async () => {
    await withRollback(async (db) => {
      const store = new PgSessionStore(db);
      expect(await store.findActive("not-a-uuid")).toBeNull();
      await expect(store.revoke("not-a-uuid")).resolves.toBeUndefined();
    });
  });
});
