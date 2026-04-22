/**
 * Drizzle client factory.
 *
 * Import this in the NestJS app (or any consumer) to obtain a typed db handle.
 * The connection URL is read from env; callers own lifecycle and should call
 * `close()` when shutting down (tests in particular, to let Jest exit cleanly).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "./schema.js";

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;
export type Db = DrizzleClient & {
  /** Ends the underlying postgres-js pool. Safe to call more than once. */
  close: () => Promise<void>;
};

export function createDb(databaseUrl: string): Db {
  const client = postgres(databaseUrl, {
    // Prefer per-call control over transactions; we do not want an implicit pool
    // greater than what the api process actually needs.
    max: 10,
    idle_timeout: 30,
  });
  const db = drizzle(client, { schema }) as Db;
  db.close = () => client.end({ timeout: 5 });
  return db;
}
