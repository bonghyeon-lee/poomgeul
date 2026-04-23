/**
 * Integration tests for AuthService.upsertGitHubUser.
 *
 * Exercises the three resolution paths (github_id hit, email adopt, fresh
 * insert) against the real TEST_DATABASE_URL schema via withRollback.
 */

import { randomUUID } from "node:crypto";

import { eq, users } from "@poomgeul/db";

import { AuthService, type GitHubProfileInput } from "../../src/modules/auth/auth.service.js";
import { withRollback } from "../db/test-db.js";

function profile(overrides: Partial<GitHubProfileInput> = {}): GitHubProfileInput {
  return {
    githubId: `gh-${randomUUID()}`,
    githubHandle: `user-${randomUUID().slice(0, 8)}`,
    email: `auth-it-${randomUUID()}@example.invalid`,
    displayName: "Integration Test",
    ...overrides,
  };
}

describe("AuthService.upsertGitHubUser", () => {
  it("inserts a fresh User on first login", async () => {
    await withRollback(async (db) => {
      const auth = new AuthService(db);
      const input = profile();

      const user = await auth.upsertGitHubUser(input);

      expect(user.githubId).toBe(input.githubId);
      expect(user.githubHandle).toBe(input.githubHandle);
      expect(user.email).toBe(input.email);
      expect(user.displayName).toBe(input.displayName);
      expect(user.tier).toBe("new");
    });
  });

  it("updates handle/email/displayName on subsequent logins with same github_id", async () => {
    await withRollback(async (db) => {
      const auth = new AuthService(db);
      const first = profile({ githubHandle: "old-handle", email: "old@example.invalid" });
      const user1 = await auth.upsertGitHubUser(first);

      const second = profile({
        githubId: first.githubId,
        githubHandle: "new-handle",
        email: "new@example.invalid",
        displayName: "Renamed",
      });
      const user2 = await auth.upsertGitHubUser(second);

      expect(user2.id).toBe(user1.id);
      expect(user2.githubHandle).toBe("new-handle");
      expect(user2.email).toBe("new@example.invalid");
      expect(user2.displayName).toBe("Renamed");
    });
  });

  it("adopts an existing email-only User by setting github_id", async () => {
    await withRollback(async (db) => {
      const email = `adopt-${randomUUID()}@example.invalid`;
      const [pre] = await db.insert(users).values({ email, displayName: "legacy" }).returning();
      if (!pre) throw new Error("pre-seed user insert returned no row");
      expect(pre.githubId).toBeNull();

      const auth = new AuthService(db);
      const user = await auth.upsertGitHubUser(profile({ email, githubHandle: "imported" }));

      expect(user.id).toBe(pre.id);
      expect(user.githubId).toBeTruthy();
      expect(user.githubHandle).toBe("imported");

      const rows = await db.select().from(users).where(eq(users.email, email));
      expect(rows).toHaveLength(1);
    });
  });
});
