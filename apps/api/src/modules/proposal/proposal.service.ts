import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  type ListProposalsOptions,
  type ProposalComment,
  type ProposalDetail,
  type ProposalListItem,
  ProposalRepository,
} from "./proposal.repository.js";

/**
 * ADR-0006 C1 — Read 경로. slug→translationId 매핑과 not-found 래핑만 담당.
 * 쓰기 로직(생성/decide/withdraw/comments)은 C2~C4에서 이 서비스에 메서드를
 * 덧붙인다.
 */
@Injectable()
export class ProposalService {
  constructor(@Inject(ProposalRepository) private readonly repo: ProposalRepository) {}

  async listBySlug(slug: string, opts: ListProposalsOptions): Promise<ProposalListItem[]> {
    const translationId = await this.resolveTranslationId(slug);
    return this.repo.listByTranslation(translationId, opts);
  }

  async findDetail(slug: string, proposalId: string): Promise<ProposalDetail> {
    const translationId = await this.resolveTranslationId(slug);
    const detail = await this.repo.findDetail(translationId, proposalId);
    if (!detail) {
      throw new NotFoundException({
        code: "not_found",
        message: `proposal ${proposalId} not found in translation ${slug}`,
      });
    }
    return detail;
  }

  async listComments(slug: string, proposalId: string): Promise<ProposalComment[]> {
    const translationId = await this.resolveTranslationId(slug);
    const comments = await this.repo.listComments(translationId, proposalId);
    if (!comments) {
      throw new NotFoundException({
        code: "not_found",
        message: `proposal ${proposalId} not found in translation ${slug}`,
      });
    }
    return comments;
  }

  private async resolveTranslationId(slug: string): Promise<string> {
    const id = await this.repo.findTranslationIdBySlug(slug);
    if (!id) {
      throw new NotFoundException({
        code: "not_found",
        message: `translation ${slug} not found`,
      });
    }
    return id;
  }
}
