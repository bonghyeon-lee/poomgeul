import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  type Db,
  desc,
  eq,
  type Proposal,
  proposalComments,
  proposals,
  segments,
  translations,
  translationSegments,
  users,
} from "@poomgeul/db";

type ProposalStatus = Proposal["status"];

import { DB_TOKEN } from "../../db/database.module.js";

export type ProposalListItem = {
  proposalId: string;
  segmentId: string;
  proposerId: string;
  proposerDisplayName: string | null;
  proposerGithubHandle: string | null;
  status: ProposalStatus;
  baseSegmentVersion: number;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type ProposalDetail = ProposalListItem & {
  translationId: string;
  proposedText: string;
  resolverDisplayName: string | null;
  currentSegment: {
    segmentId: string;
    originalText: string;
    currentText: string;
    currentVersion: number;
  };
};

export type ProposalComment = {
  commentId: string;
  body: string;
  createdAt: string;
  author: {
    userId: string;
    displayName: string | null;
    githubHandle: string | null;
  };
};

type ProposalStatusFilter = ProposalStatus | "all";

export interface ListProposalsOptions {
  status?: ProposalStatusFilter;
  limit?: number;
}

@Injectable()
export class ProposalRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Slug → translationId 매핑. proposal 엔드포인트는 전부 slug 기반이므로
   * 핸들러 진입 직후 이 값을 확인하고 404를 던진다. SourceRepository의
   * bundle 쿼리는 너무 무거워 재사용하지 않고 직접 가벼운 select만 수행.
   */
  async findTranslationIdBySlug(slug: string): Promise<string | null> {
    const rows = await this.db
      .select({ translationId: translations.translationId })
      .from(translations)
      .where(eq(translations.slug, slug))
      .limit(1);
    return rows[0]?.translationId ?? null;
  }

  async listByTranslation(
    translationId: string,
    opts: ListProposalsOptions = {},
  ): Promise<ProposalListItem[]> {
    const limit = clampLimit(opts.limit);
    const statusFilter = opts.status ?? "all";

    const whereClause =
      statusFilter === "all"
        ? eq(proposals.translationId, translationId)
        : and(eq(proposals.translationId, translationId), eq(proposals.status, statusFilter));

    const rows = await this.db
      .select({
        proposalId: proposals.proposalId,
        segmentId: proposals.segmentId,
        proposerId: proposals.proposerId,
        proposerDisplayName: users.displayName,
        proposerGithubHandle: users.githubHandle,
        status: proposals.status,
        baseSegmentVersion: proposals.baseSegmentVersion,
        reason: proposals.reason,
        createdAt: proposals.createdAt,
        resolvedAt: proposals.resolvedAt,
        resolvedBy: proposals.resolvedBy,
      })
      .from(proposals)
      .innerJoin(users, eq(users.id, proposals.proposerId))
      .where(whereClause)
      .orderBy(desc(proposals.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));
  }

  async findDetail(translationId: string, proposalId: string): Promise<ProposalDetail | null> {
    // proposer + resolver 표시용 display name을 한 번에 긁기 위해 users를 두 번 join
    // 하기보다, proposer 조인만 하고 resolver는 필요 시 두 번째 쿼리로. resolved된 건은
    // 전체의 일부이고 이 경로는 상세 1건만 본다 — 둘 다 1회 쿼리 비용이라 단순화 쪽으로.
    const rows = await this.db
      .select({
        proposalId: proposals.proposalId,
        translationId: proposals.translationId,
        segmentId: proposals.segmentId,
        proposerId: proposals.proposerId,
        proposerDisplayName: users.displayName,
        proposerGithubHandle: users.githubHandle,
        status: proposals.status,
        baseSegmentVersion: proposals.baseSegmentVersion,
        reason: proposals.reason,
        proposedText: proposals.proposedText,
        createdAt: proposals.createdAt,
        resolvedAt: proposals.resolvedAt,
        resolvedBy: proposals.resolvedBy,
      })
      .from(proposals)
      .innerJoin(users, eq(users.id, proposals.proposerId))
      .where(and(eq(proposals.proposalId, proposalId), eq(proposals.translationId, translationId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const resolverName = await this.findResolverDisplayName(row.resolvedBy);
    const current = await this.findCurrentSegment(translationId, row.segmentId);
    if (!current) return null; // 스키마상 cascade라 거의 발생 안 하지만 방어.

    return {
      proposalId: row.proposalId,
      translationId: row.translationId,
      segmentId: row.segmentId,
      proposerId: row.proposerId,
      proposerDisplayName: row.proposerDisplayName,
      proposerGithubHandle: row.proposerGithubHandle,
      status: row.status,
      baseSegmentVersion: row.baseSegmentVersion,
      reason: row.reason,
      proposedText: row.proposedText,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolvedBy: row.resolvedBy,
      resolverDisplayName: resolverName,
      currentSegment: current,
    };
  }

  async listComments(translationId: string, proposalId: string): Promise<ProposalComment[] | null> {
    // 해당 proposal이 이 translation에 속하는지 먼저 확인 — 안 속하면 404(null).
    const exists = await this.db
      .select({ id: proposals.proposalId })
      .from(proposals)
      .where(and(eq(proposals.proposalId, proposalId), eq(proposals.translationId, translationId)))
      .limit(1);
    if (!exists[0]) return null;

    const rows = await this.db
      .select({
        commentId: proposalComments.commentId,
        body: proposalComments.body,
        createdAt: proposalComments.createdAt,
        authorId: proposalComments.authorId,
        authorDisplayName: users.displayName,
        authorGithubHandle: users.githubHandle,
      })
      .from(proposalComments)
      .innerJoin(users, eq(users.id, proposalComments.authorId))
      .where(eq(proposalComments.proposalId, proposalId))
      .orderBy(proposalComments.createdAt);

    return rows.map((r) => ({
      commentId: r.commentId,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: {
        userId: r.authorId,
        displayName: r.authorDisplayName,
        githubHandle: r.authorGithubHandle,
      },
    }));
  }

  private async findResolverDisplayName(resolvedBy: string | null): Promise<string | null> {
    if (!resolvedBy) return null;
    const rows = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, resolvedBy))
      .limit(1);
    return rows[0]?.displayName ?? null;
  }

  private async findCurrentSegment(
    translationId: string,
    segmentId: string,
  ): Promise<ProposalDetail["currentSegment"] | null> {
    const rows = await this.db
      .select({
        segmentId: segments.segmentId,
        originalText: segments.originalText,
        currentText: translationSegments.text,
        currentVersion: translationSegments.version,
      })
      .from(translationSegments)
      .innerJoin(segments, eq(segments.segmentId, translationSegments.segmentId))
      .where(
        and(
          eq(translationSegments.translationId, translationId),
          eq(translationSegments.segmentId, segmentId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}

function clampLimit(raw?: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 50;
  return Math.max(1, Math.min(200, n));
}
