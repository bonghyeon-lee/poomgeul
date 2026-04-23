import { Inject, Injectable } from "@nestjs/common";
import { type Db, eq, type User, users } from "@poomgeul/db";

import { DB_TOKEN } from "../source/source.repository.js";

export interface GitHubProfileInput {
  githubId: string;
  githubHandle: string;
  email: string;
  displayName: string | null;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Resolves the User row for a GitHub identity, creating one on first login.
   *
   * Primary match: `users.github_id` (ADR-0005 — resilient to handle/email
   * changes). Fallback match by email keeps pre-existing rows (the dev-seed
   * user, or users that signed up through a legacy path) linked on next login.
   */
  async upsertGitHubUser(profile: GitHubProfileInput): Promise<User> {
    const byGithubId = await this.db
      .select()
      .from(users)
      .where(eq(users.githubId, profile.githubId))
      .limit(1);
    const existingByGithubId = byGithubId[0];
    if (existingByGithubId) {
      // Sync latest GitHub-owned fields so display stays current.
      const [updated] = await this.db
        .update(users)
        .set({
          githubHandle: profile.githubHandle,
          displayName: profile.displayName ?? existingByGithubId.displayName,
          email: profile.email,
        })
        .where(eq(users.id, existingByGithubId.id))
        .returning();
      if (!updated) throw new Error("github user update returned no row");
      return updated;
    }

    const byEmail = await this.db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);
    const existingByEmail = byEmail[0];
    if (existingByEmail) {
      const [adopted] = await this.db
        .update(users)
        .set({
          githubId: profile.githubId,
          githubHandle: profile.githubHandle,
          displayName: profile.displayName ?? existingByEmail.displayName,
        })
        .where(eq(users.id, existingByEmail.id))
        .returning();
      if (!adopted) throw new Error("github user adopt-by-email returned no row");
      return adopted;
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email: profile.email,
        displayName: profile.displayName,
        githubHandle: profile.githubHandle,
        githubId: profile.githubId,
      })
      .returning();
    if (!created) throw new Error("github user insert returned no row");
    return created;
  }
}
