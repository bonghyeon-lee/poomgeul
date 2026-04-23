import type { Session, User } from "@poomgeul/db";

export interface CreateSessionInput {
  userId: string;
  ttlMs?: number;
}

export interface ActiveSession {
  session: Session;
  user: User;
}

/**
 * Storage-agnostic contract for DB-backed sessions (ADR-0005).
 *
 * PR #1 lands only the Postgres impl; the interface exists so an eventual
 * Redis/Memcached move (or a stateless JWT override) is contained to this
 * module.
 */
export interface SessionStore {
  create(input: CreateSessionInput): Promise<Session>;

  /**
   * Returns `null` when the session is missing, revoked, or expired — callers
   * treat all three as "not authenticated" so they don't need to distinguish.
   */
  findActive(sessionId: string): Promise<ActiveSession | null>;

  revoke(sessionId: string): Promise<void>;
}

export const SESSION_STORE = Symbol("SESSION_STORE");

// Default session lifetime. ADR-0005 leaves this to the impl; 30 days balances
// "don't force weekly re-login" against server-side revoke recency.
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
