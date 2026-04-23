import { Module, type OnModuleDestroy } from "@nestjs/common";
import { createDb, type Db } from "@poomgeul/db";

import { DB_TOKEN } from "../source/source.repository.js";
import { PgSessionStore } from "./pg-session-store.js";
import { SESSION_STORE } from "./session-store.js";

/**
 * Owns the db handle for AuthModule. Mirrors SourceModule's pattern — the
 * "shared DatabaseModule" promotion noted in source.module.ts is deferred to
 * a separate PR so ADR-0005 PR #1 stays focused on schema + session store.
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
  ],
  exports: [SESSION_STORE],
})
export class AuthModule {}
