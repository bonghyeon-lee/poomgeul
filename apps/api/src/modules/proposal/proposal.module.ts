import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { BlocklistController } from "./blocklist.controller.js";
import { ProposalController } from "./proposal.controller.js";
import { ProposalRepository } from "./proposal.repository.js";
import { ProposalService } from "./proposal.service.js";

/**
 * ADR-0006 Proposal CRUD. C1은 Read, C2는 생성(이 PR). C3/C4에서 decide/
 * withdraw/comments가 같은 서비스·레포에 메서드로 덧붙는다.
 *
 * DB_TOKEN은 @Global() DatabaseModule에서 해소되므로 imports에 명시 불필요.
 * AuthModule은 SessionGuard·@CurrentUser 주입 경로(쓰기 엔드포인트).
 */
@Module({
  imports: [AuthModule],
  controllers: [ProposalController, BlocklistController],
  providers: [ProposalService, ProposalRepository],
})
export class ProposalModule {}
