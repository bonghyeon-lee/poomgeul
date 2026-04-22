import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthController } from "./modules/health/health.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    // Domain modules (auth, source, translation, proposal) are added as M0
    // implementation lands — see docs/specs/m0-mvp.md.
  ],
  controllers: [HealthController],
})
export class AppModule {}
