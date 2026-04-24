import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { CascadeTranslationProvider } from "../translation/cascade-provider.js";
import { GeminiTranslationProvider } from "../translation/gemini-provider.js";
import { OpenRouterTranslationProvider } from "../translation/openrouter-provider.js";
import {
  TRANSLATION_PROVIDER,
  TranslationDraftService,
} from "../translation/translation-draft.service.js";
import type { TranslationProvider } from "../translation/translation-provider.js";
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
      // Gemini(primary) + OpenRouter(fallback) cascade. 두 쪽 키 모두 .env에
      // 있으면 자연스럽게 cascade, Gemini 키만 있으면 Gemini 단독, OpenRouter만
      // 있으면 OpenRouter 단독. 둘 다 없으면 cascade가 드러나지 않고 단순히
      // isConfigured()=false로 떨어져 draft 단계가 skipped 처리된다.
      provide: TRANSLATION_PROVIDER,
      useFactory: (): TranslationProvider => {
        const primary = new GeminiTranslationProvider();
        const fallback = new OpenRouterTranslationProvider();
        if (!primary.isConfigured() && fallback.isConfigured()) return fallback;
        if (primary.isConfigured() && !fallback.isConfigured()) return primary;
        // 둘 다 configured이거나 둘 다 안 됐을 때 모두 Cascade로 감싸 둔다 —
        // 둘 다 미설정이어도 isConfigured=false이라 상위 로직이 동일하게 처리.
        return new CascadeTranslationProvider(primary, fallback);
      },
    },
    {
      // TranslationDraftService의 생성자는 두 번째 파라미터로 options 객체를 받는다.
      // Nest가 이 Object를 provider로 해석하려 실패하므로 useFactory로 직접 생성한다.
      provide: TranslationDraftService,
      useFactory: (provider: TranslationProvider) => new TranslationDraftService(provider),
      inject: [TRANSLATION_PROVIDER],
    },
    LicenseLookupService,
    SourceService,
  ],
})
export class SourceModule {}
