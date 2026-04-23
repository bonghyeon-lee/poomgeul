import { Module } from "@nestjs/common";

import { ArxivClient } from "./arxiv-client.js";
import { ARXIV_CLIENT, LicenseLookupService } from "./license-lookup.js";
import { SourceController } from "./source.controller.js";

@Module({
  controllers: [SourceController],
  providers: [
    {
      provide: ARXIV_CLIENT,
      useFactory: () => new ArxivClient(),
    },
    LicenseLookupService,
  ],
})
export class SourceModule {}
