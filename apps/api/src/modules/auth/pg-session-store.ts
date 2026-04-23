import { Inject, Injectable } from "@nestjs/common";
import { type Db, and, eq, gt, isNull, type Session, sessions, sql, users } from "@poomgeul/db";

import { DB_TOKEN } from "../source/source.repository.js";
import {
  type ActiveSession,
  type CreateSessionInput,
  DEFAULT_SESSION_TTL_MS,
  type SessionStore,
} from "./session-store.js";

@Injectable()
export class PgSessionStore implements SessionStore {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const ttlMs = input.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: input.userId,
        expiresAt: new Date(Date.now() + ttlMs),
      })
      .returning();
    if (!row) throw new Error("session insert returned no row");
    return row;
  }

  async findActive(sessionId: string): Promise<ActiveSession | null> {
    // Reject malformed ids before hitting the DB — Postgres would raise
    // `invalid input syntax for uuid` and surface as a 500 otherwise.
    if (!UUID_RE.test(sessionId)) return null;
    const rows = await this.db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.sessionId, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async revoke(sessionId: string): Promise<void> {
    if (!UUID_RE.test(sessionId)) return;
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.sessionId, sessionId), isNull(sessions.revokedAt)));
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
