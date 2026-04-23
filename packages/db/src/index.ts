export * from "./schema.js";
export { createDb, type Db } from "./client.js";

// Re-export common query helpers so consumers (apps/api, tests) never need to
// depend on `drizzle-orm` directly. Having two drizzle-orm instances in the
// workspace graph causes "Two different types with this name" TypeScript errors.
export { and, eq, inArray, like, not, or, sql } from "drizzle-orm";
