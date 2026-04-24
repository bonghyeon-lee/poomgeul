import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { CreateProposalBody } from "./dto.js";
import {
  type ListProposalsOptions,
  type ProposalComment,
  type ProposalDetail,
  type ProposalListItem,
  ProposalRepository,
} from "./proposal.repository.js";

export interface CreateProposalResult {
  proposalId: string;
  status: "open";
  createdAt: string;
}

/**
 * ADR-0006 Proposal 서비스.
 * - C1: Read 경로(list/detail/comments)
 * - C2(이 PR): 생성
 * - C3/C4: decide/withdraw/comments 쓰기는 후속 PR에서 이 서비스에 덧붙임.
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

  async create(
    slug: string,
    proposerId: string,
    body: CreateProposalBody,
  ): Promise<CreateProposalResult> {
    const translation = await this.repo.findTranslationSnapshotBySlug(slug);
    if (!translation) {
      throw new NotFoundException({
        code: "not_found",
        message: `translation ${slug} not found`,
      });
    }

    const trimmedProposedText = body.proposedText.trim();
    if (trimmedProposedText.length === 0) {
      throw new BadRequestException({
        code: "validation_failed",
        message: "proposedText는 공백만 포함할 수 없다",
      });
    }
    const trimmedReason = body.reason?.trim();
    const reason = trimmedReason && trimmedReason.length > 0 ? trimmedReason : null;

    const segment = await this.repo.findSegmentSnapshot(translation.translationId, body.segmentId);
    if (!segment) {
      // 세그먼트가 translation_segments에 없음 — 이 translation 소유가 아니거나
      // 존재하지 않는 segmentId. ADR-0006 에러 모델의 not_found로 통일.
      throw new NotFoundException({
        code: "not_found",
        message: `segment ${body.segmentId} not found in translation ${slug}`,
      });
    }
    if (segment.sourceId !== translation.sourceId) {
      // 다른 source의 segment를 이 translation에 제안 — 스키마상 흔치 않지만 방어.
      throw new NotFoundException({
        code: "not_found",
        message: `segment ${body.segmentId} does not belong to translation ${slug}`,
      });
    }

    if (segment.version !== body.baseSegmentVersion) {
      // ADR-0003 optimistic locking: 제안 작성 시점 스냅샷과 현재가 어긋났다.
      // 생성 시점에도 lock을 체크하면, 사용자가 옛 버전 기준 제안을 보냈을 때
      // 바로 재작성 유도가 가능해 머지 단계의 409 반복을 줄인다.
      throw new ConflictException({
        code: "rebase_required",
        currentVersion: segment.version,
        currentText: segment.text,
      });
    }

    const existingOpenId = await this.repo.findOpenProposalId(
      translation.translationId,
      body.segmentId,
      proposerId,
    );
    if (existingOpenId) {
      throw new ConflictException({
        code: "duplicate_open_proposal",
        existingProposalId: existingOpenId,
      });
    }

    const created = await this.repo.createProposalWithContribution({
      translationId: translation.translationId,
      segmentId: body.segmentId,
      baseSegmentVersion: body.baseSegmentVersion,
      proposedText: trimmedProposedText,
      reason,
      proposerId,
    });

    return {
      proposalId: created.proposalId,
      status: "open",
      createdAt: created.createdAt,
    };
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
