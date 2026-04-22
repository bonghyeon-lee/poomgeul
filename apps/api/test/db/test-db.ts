/**
 * DB test helpers.
 *
 * Two strategies, picked per suite:
 *   (1) withRollback  — uses the already-running Postgres referenced by
 *       TEST_DATABASE_URL (default: ...5432/poomgeul_test). Each test runs
 *       inside a Drizzle transaction that is forced to roll back on exit.
 *       Fast; good for repository / service tests that do NOT open their own
 *       transactions internally.
 *   (2) startIsolatedContainer — spins up a fresh pgvector container for the
 *       suite via Testcontainers, applies the Drizzle migration once, returns
 *       a Db bound to that container. Slower but guaranteed isolation.
 *
 * Both paths expose Drizzle `Db` handles typed from @poomgeul/db.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { createDb, type Db } from "@poomgeul/db";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";

// Tests run from `apps/api` (Jest rootDir). Resolve the migrations folder
// relative to that cwd. If this ever runs from a different working directory,
// override with MIGRATIONS_DIR env.
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), "../../packages/db/migrations");

/**
 * Replays drizzle-kit-generated .sql files in order. Keeps the test path off
 * the drizzle-kit binary so suites don't need to coordinate cwd.
 */
export async function applyMigrations(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const raw = readFileSync(`${MIGRATIONS_DIR}/${f}`, "utf8");
      const statements = raw
        .split(/-->\s*statement-breakpoint/g)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---------- Strategy 1: rollback wrapper over a shared DB ----------

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://poomgeul:poomgeul@localhost:5432/poomgeul_test";

/**
 * Runs `fn` inside a Drizzle transaction and forces a rollback when it exits.
 *
 * Limitation: does NOT compose with code that itself calls `db.transaction(...)`.
 * Use `startIsolatedContainer` for those suites.
 */
export async function withRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = createDb(TEST_DATABASE_URL);
  let captured: T;
  try {
    await db.transaction(async (tx) => {
      captured = await fn(tx as unknown as Db);
      throw new RollbackSentinel();
    });
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) throw err;
  } finally {
    await db.close();
  }
  // @ts-expect-error — assigned inside the transaction callback before the throw.
  return captured;
}

class RollbackSentinel extends Error {
  constructor() {
    super("rollback-sentinel");
    this.name = "RollbackSentinel";
  }
}

// ---------- Strategy 2: fresh testcontainer per suite ----------

export type ContainerHarness = {
  db: Db;
  container: StartedPostgreSqlContainer;
  /** Tear down the container. Safe to call in afterAll. */
  stop: () => Promise<void>;
};

/**
 * Boots a fresh pgvector container, applies migrations, returns a Db handle.
 * Intended usage: call in beforeAll, stop in afterAll.
 */
export async function startIsolatedContainer(): Promise<ContainerHarness> {
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
    .withDatabase("poomgeul_test")
    .withUsername("poomgeul")
    .withPassword("poomgeul")
    .start();

  const url = container.getConnectionUri();
  await applyMigrations(url);
  const db = createDb(url);

  return {
    db,
    container,
    stop: async () => {
      await container.stop();
    },
  };
}
