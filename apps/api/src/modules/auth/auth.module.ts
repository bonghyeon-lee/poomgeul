import { Module, type OnModuleDestroy } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { createDb, type Db } from "@poomgeul/db";

import { DB_TOKEN } from "../source/source.repository.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GitHubStrategy } from "./github.strategy.js";
import { PgSessionStore } from "./pg-session-store.js";
import { SessionGuard } from "./session.guard.js";
import { SESSION_STORE } from "./session-store.js";

/**
 * Owns the db handle for AuthModule. Mirrors SourceModule's pattern — the
 * "shared DatabaseModule" promotion noted in source.module.ts is deferred to
 * a separate refactor PR so ADR-0005 lands focused on auth behaviour.
 */
class AuthDbHolder implements OnModuleDestroy {
  readonly db: Db;
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is required to start AuthModule. See apps/api/src/app.module.ts for .env resolution order.",
      );
    }
    this.db = createDb(url);
  }
  async onModuleDestroy(): Promise<void> {
    await this.db.close();
  }
}

@Module({
  // `session: false` — passport-github2 runs once per callback; we mint our
  // own DB session (ADR-0005) and never touch express-session.
  imports: [PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [
    AuthDbHolder,
    {
      provide: DB_TOKEN,
      useFactory: (holder: AuthDbHolder) => holder.db,
      inject: [AuthDbHolder],
    },
    {
      provide: SESSION_STORE,
      useClass: PgSessionStore,
    },
    AuthService,
    GitHubStrategy,
    SessionGuard,
  ],
  exports: [SESSION_STORE, SessionGuard],
})
export class AuthModule {}
