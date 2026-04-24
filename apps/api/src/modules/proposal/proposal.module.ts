import { Module } from "@nestjs/common";

import { ProposalController } from "./proposal.controller.js";
import { ProposalRepository } from "./proposal.repository.js";
import { ProposalService } from "./proposal.service.js";

/**
 * ADR-0006 Proposal CRUD. C1은 Read 경로만(C2: 생성, C3: decide/withdraw, C4: comments).
 *
 * DB_TOKEN은 @Global() DatabaseModule에서 해소되므로 imports에 명시 불필요.
 * 쓰기 엔드포인트가 추가되는 C2부터 AuthModule import(SessionGuard용)가 붙는다.
 */
@Module({
  controllers: [ProposalController],
  providers: [ProposalService, ProposalRepository],
})
export class ProposalModule {}
