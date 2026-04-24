import { Global, Module, type OnModuleDestroy } from "@nestjs/common";
import { createDb, type Db } from "@poomgeul/db";

/**
 * Workspace-wide Drizzle handle.
 *
 * Earlier modules (SourceModule, AuthModule) each owned a DbHolder and
 * provided DB_TOKEN themselves — which was fine while there were two, but
 * every new domain module (proposals, segment-edit, …) would have repeated
 * the same 20 lines. This module centralizes that wiring.
 *
 * @Global so consumers don't need to import DatabaseModule in every feature
 * module; they just @Inject(DB_TOKEN) and AppModule registers the provider
 * once. Tests that want to swap the handle build their own TestingModule
 * that overrides DB_TOKEN directly (see auth-session-guard.e2e-spec.ts).
 */

export const DB_TOKEN = Symbol("DB_TOKEN");

class DbHolder implements OnModuleDestroy {
  readonly db: Db;
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is required. See apps/api/src/app.module.ts for the .env resolution order (root .env then apps/api/.env).",
      );
    }
    this.db = createDb(url);
  }
  async onModuleDestroy(): Promise<void> {
    await this.db.close();
  }
}

@Global()
@Module({
  providers: [
    DbHolder,
    {
      provide: DB_TOKEN,
      useFactory: (holder: DbHolder) => holder.db,
      inject: [DbHolder],
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
