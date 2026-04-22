/**
 * Drizzle client factory.
 *
 * Import this in the NestJS app (or any consumer) to obtain a typed db handle.
 * The connection URL is read from env; callers own lifecycle.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "./schema.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    // Prefer per-call control over transactions; we do not want an implicit pool
    // greater than what the api process actually needs.
    max: 10,
    idle_timeout: 30,
  });
  return drizzle(client, { schema });
}
