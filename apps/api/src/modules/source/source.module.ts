import { Module, type OnModuleDestroy } from "@nestjs/common";
import { createDb, type Db } from "@poomgeul/db";

import { GeminiTranslationProvider } from "../translation/gemini-provider.js";
import {
  TRANSLATION_PROVIDER,
  TranslationDraftService,
} from "../translation/translation-draft.service.js";
import { Ar5ivFetcher } from "./ar5iv-fetcher.js";
import { ArxivClient } from "./arxiv-client.js";
import { ARXIV_CLIENT, LicenseLookupService } from "./license-lookup.js";
import { SourceController } from "./source.controller.js";
import { DB_TOKEN, SourceRepository } from "./source.repository.js";
import { AR5IV_FETCHER, SourceService } from "./source.service.js";
import { TranslationsController } from "./translations.controller.js";

/**
 * Db 핸들을 소유하는 작은 holder. 모듈이 파괴될 때 postgres 풀을 닫는다.
 * 향후 translation/proposal 모듈이 생기면 공유 DatabaseModule로 승격한다.
 */
class DbHolder implements OnModuleDestroy {
  readonly db: Db;
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        [
          "DATABASE_URL is required to start SourceModule.",
          "Set it in the root .env (postgres://poomgeul:poomgeul@localhost:5432/poomgeul)",
          "or export it in the shell. AppModule reads both apps/api/.env and the monorepo root .env.",
        ].join(" "),
      );
    }
    this.db = createDb(url);
  }
  async onModuleDestroy(): Promise<void> {
    await this.db.close();
  }
}

@Module({
  controllers: [SourceController, TranslationsController],
  providers: [
    DbHolder,
    {
      provide: DB_TOKEN,
      useFactory: (holder: DbHolder) => holder.db,
      inject: [DbHolder],
    },
    SourceRepository,
    {
      provide: ARXIV_CLIENT,
      useFactory: () => new ArxivClient(),
    },
    {
      provide: AR5IV_FETCHER,
      useFactory: () => new Ar5ivFetcher(),
    },
    {
      provide: TRANSLATION_PROVIDER,
      useFactory: () => new GeminiTranslationProvider(),
    },
    {
      // TranslationDraftService의 생성자는 두 번째 파라미터로 options 객체를 받는다.
      // Nest가 이 Object를 provider로 해석하려 실패하므로 useFactory로 직접 생성한다.
      provide: TranslationDraftService,
      useFactory: (provider: GeminiTranslationProvider) =>
        new TranslationDraftService(provider),
      inject: [TRANSLATION_PROVIDER],
    },
    LicenseLookupService,
    SourceService,
  ],
})
export class SourceModule {}
