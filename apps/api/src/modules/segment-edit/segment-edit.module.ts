import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { SegmentEditController } from "./segment-edit.controller.js";
import { SegmentEditRepository } from "./segment-edit.repository.js";
import { SegmentEditService } from "./segment-edit.service.js";

/**
 * §5 세그먼트 에디터 — 리드 직접 편집 경로 (workflow-proposal.md §리드 메인테이너의
 * 직접 편집). Proposal 경로와 서비스 레이어를 분리해 책임이 겹치지 않도록 한다.
 * DB_TOKEN은 @Global() DatabaseModule로 해소. AuthModule은 SessionGuard·@CurrentUser
 * 주입.
 */
@Module({
  imports: [AuthModule],
  controllers: [SegmentEditController],
  providers: [SegmentEditService, SegmentEditRepository],
})
export class SegmentEditModule {}
