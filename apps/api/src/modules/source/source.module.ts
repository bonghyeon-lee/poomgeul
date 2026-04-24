import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { GeminiTranslationProvider } from "../translation/gemini-provider.js";
import {
  TRANSLATION_PROVIDER,
  TranslationDraftService,
} from "../translation/translation-draft.service.js";
import { Ar5ivFetcher } from "./ar5iv-fetcher.js";
import { ArxivClient } from "./arxiv-client.js";
import { ARXIV_CLIENT, LicenseLookupService } from "./license-lookup.js";
import { SourceController } from "./source.controller.js";
import { SourceRepository } from "./source.repository.js";
import { AR5IV_FETCHER, SourceService } from "./source.service.js";
import { TranslationsController } from "./translations.controller.js";

@Module({
  // AuthModule에서 SessionGuard가 export되며, 여기 쓰기 엔드포인트에서 @UseGuards로 쓴다.
  // DB_TOKEN은 @Global() DatabaseModule이 AppModule에서 한 번 등록하므로 여기 재등록 불필요.
  imports: [AuthModule],
  controllers: [SourceController, TranslationsController],
  providers: [
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
      useFactory: (provider: GeminiTranslationProvider) => new TranslationDraftService(provider),
      inject: [TRANSLATION_PROVIDER],
    },
    LicenseLookupService,
    SourceService,
  ],
})
export class SourceModule {}
