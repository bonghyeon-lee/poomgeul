import { resolve } from "node:path";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { DatabaseModule } from "./db/database.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthController } from "./modules/health/health.controller.js";
import { ProposalModule } from "./modules/proposal/proposal.module.js";
import { SegmentEditModule } from "./modules/segment-edit/segment-edit.module.js";
import { SourceModule } from "./modules/source/source.module.js";

// apps/api에서 `pnpm dev`로 실행할 때 cwd가 apps/api이므로 기본 탐색 경로가
// apps/api/.env가 된다. monorepo 규약상 .env는 루트에 하나만 두기 때문에
// 루트와 cwd 양쪽을 모두 훑어 먼저 발견된 쪽을 사용한다. process.env에
// 이미 값이 있으면 ConfigModule은 덮어쓰지 않는다(CI·배포 경로 안전).
const ROOT_ENV = resolve(process.cwd(), "../../.env");
const LOCAL_ENV = resolve(process.cwd(), ".env");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [LOCAL_ENV, ROOT_ENV],
    }),
    DatabaseModule,
    AuthModule,
    SourceModule,
    ProposalModule,
    SegmentEditModule,
    // Remaining domain modules land as M0 implementation progresses —
    // see docs/specs/m0-mvp.md.
  ],
  controllers: [HealthController],
})
export class AppModule {}
