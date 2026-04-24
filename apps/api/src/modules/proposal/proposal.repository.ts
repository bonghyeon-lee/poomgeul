import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  contributions,
  type Db,
  desc,
  eq,
  type Proposal,
  proposalComments,
  proposals,
  segments,
  translationRevisions,
  translations,
  translationSegments,
  users,
} from "@poomgeul/db";

import { DB_TOKEN } from "../../db/database.module.js";

type ProposalStatus = Proposal["status"];

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

export interface CreateProposalInput {
  translationId: string;
  segmentId: string;
  baseSegmentVersion: number;
  proposedText: string;
  reason: string | null;
  proposerId: string;
}

export interface TranslationSegmentSnapshot {
  translationId: string;
  segmentId: string;
  sourceId: string;
  version: number;
  text: string;
}

export interface TranslationSnapshot {
  translationId: string;
  sourceId: string;
  slug: string;
  leadId: string;
}

export interface ProposalForDecision {
  proposalId: string;
  translationId: string;
  segmentId: string;
  proposerId: string;
  status: ProposalStatus;
  baseSegmentVersion: number;
  proposedText: string;
}

export interface ApproveProposalResult {
  proposalId: string;
  status: "merged";
  segment: {
    segmentId: string;
    version: number;
    text: string;
  };
  revisionId: string;
}

export interface RejectProposalResult {
  proposalId: string;
  status: "rejected";
  resolvedAt: string;
}

export interface WithdrawProposalResult {
  proposalId: string;
  status: "withdrawn";
  resolvedAt: string;
}

export type RebaseConflict = {
  kind: "rebase_required";
  currentVersion: number;
  currentText: string;
};

export interface CreateCommentInput {
  proposalId: string;
  authorId: string;
  body: string;
  translationId: string;
  segmentId: string;
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

  async findTranslationSnapshotBySlug(slug: string): Promise<TranslationSnapshot | null> {
    const rows = await this.db
      .select({
        translationId: translations.translationId,
        sourceId: translations.sourceId,
        slug: translations.slug,
        leadId: translations.leadId,
      })
      .from(translations)
      .where(eq(translations.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  async findProposalForDecision(
    translationId: string,
    proposalId: string,
  ): Promise<ProposalForDecision | null> {
    const rows = await this.db
      .select({
        proposalId: proposals.proposalId,
        translationId: proposals.translationId,
        segmentId: proposals.segmentId,
        proposerId: proposals.proposerId,
        status: proposals.status,
        baseSegmentVersion: proposals.baseSegmentVersion,
        proposedText: proposals.proposedText,
      })
      .from(proposals)
      .where(and(eq(proposals.proposalId, proposalId), eq(proposals.translationId, translationId)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * ADR-0003 머지 트랜잭션. 반환 유니온:
   * - success: translation_segments 업데이트 + translation_revisions 삽입 +
   *   proposals.status='merged' + contribution(proposal_merge).
   * - rebase_required: proposal.baseSegmentVersion과 현재 ts.version이
   *   불일치. 아무 것도 쓰지 않고 충돌 정보 반환.
   *
   * workflow-proposal.md의 "머지 절차" 그대로. last_editor_id는 proposer
   * 저장(author). committer(lead)는 Proposal.resolvedBy·Revision에서 추적.
   */
  async approveProposal(params: {
    proposal: ProposalForDecision;
    leadId: string;
  }): Promise<ApproveProposalResult | RebaseConflict> {
    const { proposal, leadId } = params;
    return this.db.transaction(async (tx) => {
      const currentRows = await tx
        .select({ text: translationSegments.text, version: translationSegments.version })
        .from(translationSegments)
        .where(
          and(
            eq(translationSegments.translationId, proposal.translationId),
            eq(translationSegments.segmentId, proposal.segmentId),
          ),
        )
        .limit(1);
      const current = currentRows[0];
      if (!current) {
        // 스키마 cascade 상 거의 불가능 — 방어적으로 rebase로 취급.
        return {
          kind: "rebase_required",
          currentVersion: -1,
          currentText: "",
        };
      }
      if (current.version !== proposal.baseSegmentVersion) {
        return {
          kind: "rebase_required",
          currentVersion: current.version,
          currentText: current.text,
        };
      }

      const now = new Date();
      const newVersion = current.version + 1;

      const updated = await tx
        .update(translationSegments)
        .set({
          text: proposal.proposedText,
          version: newVersion,
          lastEditorId: proposal.proposerId,
          lastEditedAt: now,
          status: "approved",
        })
        .where(
          and(
            eq(translationSegments.translationId, proposal.translationId),
            eq(translationSegments.segmentId, proposal.segmentId),
            eq(translationSegments.version, current.version),
          ),
        )
        .returning({
          segmentId: translationSegments.segmentId,
          version: translationSegments.version,
          text: translationSegments.text,
        });
      if (updated.length !== 1 || !updated[0]) {
        // 2중 방어의 2단계: 1단계로 이미 위에서 version 비교를 했고, 2단계는 UPDATE ...
        // WHERE version=current.version이다. 사이에 다른 트랜잭션이 version을 올리면
        // 이 UPDATE가 0행을 돌려준다(postgres 기본 read committed + unique 제약 없음 조합
        // 에서 추가 방어). 이 분기에서 현재 상태를 재조회해 ADR-0003의 rebase_required로
        // 응답 — 상위 서비스가 ConflictException으로 올려 ADR-0006 에러 모델에 합류.
        const raceRows = await tx
          .select({ text: translationSegments.text, version: translationSegments.version })
          .from(translationSegments)
          .where(
            and(
              eq(translationSegments.translationId, proposal.translationId),
              eq(translationSegments.segmentId, proposal.segmentId),
            ),
          )
          .limit(1);
        const race = raceRows[0];
        return {
          kind: "rebase_required",
          currentVersion: race?.version ?? -1,
          currentText: race?.text ?? "",
        };
      }

      const [revision] = await tx
        .insert(translationRevisions)
        .values({
          translationId: proposal.translationId,
          authorId: proposal.proposerId,
          mergedProposalId: proposal.proposalId,
          commitMessage: null,
          // M0 스냅샷: 세그먼트 전후. 전체 번역본 blame은 M2에서 schemaVersion으로 확장.
          snapshot: {
            schemaVersion: 1,
            kind: "segment-merge",
            segmentId: proposal.segmentId,
            before: { text: current.text, version: current.version },
            after: { text: proposal.proposedText, version: newVersion },
          },
        })
        .returning({ revisionId: translationRevisions.revisionId });
      if (!revision) throw new Error("revision insert returned no row");

      await tx
        .update(proposals)
        .set({ status: "merged", resolvedBy: leadId, resolvedAt: now })
        .where(eq(proposals.proposalId, proposal.proposalId));

      await tx.insert(contributions).values({
        userId: proposal.proposerId,
        eventType: "proposal_merge",
        entityRef: {
          translationId: proposal.translationId,
          segmentId: proposal.segmentId,
          proposalId: proposal.proposalId,
          revisionId: revision.revisionId,
        },
      });

      return {
        proposalId: proposal.proposalId,
        status: "merged" as const,
        segment: {
          segmentId: updated[0].segmentId,
          version: updated[0].version,
          text: updated[0].text,
        },
        revisionId: revision.revisionId,
      };
    });
  }

  async rejectProposal(params: {
    proposalId: string;
    leadId: string;
  }): Promise<RejectProposalResult> {
    const now = new Date();
    const [updated] = await this.db
      .update(proposals)
      .set({ status: "rejected", resolvedBy: params.leadId, resolvedAt: now })
      .where(eq(proposals.proposalId, params.proposalId))
      .returning({ proposalId: proposals.proposalId, resolvedAt: proposals.resolvedAt });
    if (!updated || !updated.resolvedAt) {
      throw new Error("reject update returned no row");
    }
    return {
      proposalId: updated.proposalId,
      status: "rejected",
      resolvedAt: updated.resolvedAt.toISOString(),
    };
  }

  async withdrawProposal(proposalId: string): Promise<WithdrawProposalResult> {
    const now = new Date();
    const [updated] = await this.db
      .update(proposals)
      // proposer 본인 철회이므로 resolvedBy는 비워 둔다(committer=제안자 본인의 의미는 아니다).
      .set({ status: "withdrawn", resolvedBy: null, resolvedAt: now })
      .where(eq(proposals.proposalId, proposalId))
      .returning({ proposalId: proposals.proposalId, resolvedAt: proposals.resolvedAt });
    if (!updated || !updated.resolvedAt) {
      throw new Error("withdraw update returned no row");
    }
    return {
      proposalId: updated.proposalId,
      status: "withdrawn",
      resolvedAt: updated.resolvedAt.toISOString(),
    };
  }

  /**
   * 댓글 insert + review_comment Contribution을 한 트랜잭션으로.
   * workflow-proposal.md의 이벤트 매핑 그대로. 작성자 displayName/githubHandle은
   * 응답에 포함할 수 있도록 users에서 함께 반환.
   */
  async createCommentWithContribution(input: CreateCommentInput): Promise<ProposalComment> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(proposalComments)
        .values({
          proposalId: input.proposalId,
          authorId: input.authorId,
          body: input.body,
        })
        .returning({
          commentId: proposalComments.commentId,
          createdAt: proposalComments.createdAt,
        });
      if (!inserted) throw new Error("comment insert returned no row");

      await tx.insert(contributions).values({
        userId: input.authorId,
        eventType: "review_comment",
        entityRef: {
          translationId: input.translationId,
          segmentId: input.segmentId,
          proposalId: input.proposalId,
          commentId: inserted.commentId,
        },
      });

      const authorRows = await tx
        .select({
          displayName: users.displayName,
          githubHandle: users.githubHandle,
        })
        .from(users)
        .where(eq(users.id, input.authorId))
        .limit(1);
      const author = authorRows[0];

      return {
        commentId: inserted.commentId,
        body: input.body,
        createdAt: inserted.createdAt.toISOString(),
        author: {
          userId: input.authorId,
          displayName: author?.displayName ?? null,
          githubHandle: author?.githubHandle ?? null,
        },
      };
    });
  }

  /**
   * 해당 segment가 이 translation의 source에 속하고 translation_segments 행이
   * 존재하는지 확인. 존재하지 않으면 null — 잘못된 segmentId에 대한 404 또는
   * 400 분기의 단서로 쓰인다.
   */
  async findSegmentSnapshot(
    translationId: string,
    segmentId: string,
  ): Promise<TranslationSegmentSnapshot | null> {
    const rows = await this.db
      .select({
        translationId: translationSegments.translationId,
        segmentId: translationSegments.segmentId,
        sourceId: segments.sourceId,
        version: translationSegments.version,
        text: translationSegments.text,
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

  /**
   * 같은 proposer · segment · status=open 조합이 이미 있는지. M0 §6 AC 2번:
   * "같은 사용자·같은 세그먼트에 동시 open 제안 1개 제한".
   */
  async findOpenProposalId(
    translationId: string,
    segmentId: string,
    proposerId: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ proposalId: proposals.proposalId })
      .from(proposals)
      .where(
        and(
          eq(proposals.translationId, translationId),
          eq(proposals.segmentId, segmentId),
          eq(proposals.proposerId, proposerId),
          eq(proposals.status, "open"),
        ),
      )
      .limit(1);
    return rows[0]?.proposalId ?? null;
  }

  /**
   * proposal insert + contribution(proposal_submit)을 한 트랜잭션으로.
   * workflow-proposal.md "이벤트 발행" 섹션의 매핑을 그대로 따른다.
   */
  async createProposalWithContribution(input: CreateProposalInput): Promise<{
    proposalId: string;
    createdAt: string;
  }> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(proposals)
        .values({
          translationId: input.translationId,
          segmentId: input.segmentId,
          baseSegmentVersion: input.baseSegmentVersion,
          proposedText: input.proposedText,
          reason: input.reason,
          proposerId: input.proposerId,
          // status 기본값은 "open" — 스키마에서 이미 default.
        })
        .returning({ proposalId: proposals.proposalId, createdAt: proposals.createdAt });
      if (!inserted) throw new Error("proposal insert returned no row");

      await tx.insert(contributions).values({
        userId: input.proposerId,
        eventType: "proposal_submit",
        entityRef: {
          translationId: input.translationId,
          segmentId: input.segmentId,
          proposalId: inserted.proposalId,
        },
      });

      return {
        proposalId: inserted.proposalId,
        createdAt: inserted.createdAt.toISOString(),
      };
    });
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
