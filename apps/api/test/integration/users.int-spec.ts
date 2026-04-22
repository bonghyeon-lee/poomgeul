/**
 * Integration test demonstrating the rollback helper against the shared
 * TEST_DATABASE_URL. Uses the `users` table as a cheap target — it belongs to
 * the M0 core schema and no module owns it yet.
 *
 * This test lives here only while the project is pre-M0; it will move next to
 * the real auth / user module once implementation lands.
 */

import { randomUUID } from "node:crypto";

import { eq, users } from "@poomgeul/db";

import { withRollback } from "../db/test-db.js";

describe("test-db withRollback", () => {
  it("persists inserts inside the transaction and undoes them on exit", async () => {
    const email = `rollback-${randomUUID()}@example.invalid`;

    await withRollback(async (db) => {
      await db.insert(users).values({ email });
      const rows = await db.select().from(users).where(eq(users.email, email));
      expect(rows).toHaveLength(1);
    });

    // Verify the row is gone in a fresh connection outside the rollback scope.
    const { createDb } = await import("@poomgeul/db");
    const outside = createDb(
      process.env.TEST_DATABASE_URL ?? "postgres://poomgeul:poomgeul@localhost:5432/poomgeul_test",
    );
    try {
      const after = await outside.select().from(users).where(eq(users.email, email));
      expect(after).toHaveLength(0);
    } finally {
      await outside.close();
    }
  });
});
