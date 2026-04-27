import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  contributions,
  type Db,
  eq,
  translationRevisions,
  translations,
  translationSegments,
} from "@poomgeul/db";

import { DB_TOKEN } from "../../db/database.module.js";

export interface TranslationSummary {
  translationId: string;
  slug: string;
  leadId: string;
}

export interface SegmentSnapshot {
  translationId: string;
  segmentId: string;
  text: string;
  version: number;
}

export interface EditSegmentResult {
  segmentId: string;
  version: number;
  text: string;
  revisionId: string;
  lastEditedAt: string;
}

export type EditSegmentOutcome =
  | EditSegmentResult
  | { kind: "rebase_required"; currentVersion: number; currentText: string };

/**
 * §5 세그먼트 에디터 — 리드 직접 편집 전용 repo. Proposal.approve와 구조가
 * 대칭(version 재확인 + UPDATE WHERE version=expected + revision insert +
 * contribution insert)이지만 서로 다른 경로를 돌리는 것이 의도:
 *  - approve: mergedProposalId=제안, author=proposer, event=proposal_merge
 *  - direct edit (여기): mergedProposalId=NULL, author=lead, event=segment_edit
 * Git의 "merge commit vs. direct commit" 구분과 대응.
 */
@Injectable()
export class SegmentEditRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findTranslationBySlug(slug: string): Promise<TranslationSummary | null> {
    const rows = await this.db
      .select({
        translationId: translations.translationId,
        slug: translations.slug,
        leadId: translations.leadId,
      })
      .from(translations)
      .where(eq(translations.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  async findSegmentSnapshot(
    translationId: string,
    segmentId: string,
  ): Promise<SegmentSnapshot | null> {
    const rows = await this.db
      .select({
        translationId: translationSegments.translationId,
        segmentId: translationSegments.segmentId,
        text: translationSegments.text,
        version: translationSegments.version,
      })
      .from(translationSegments)
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
   * 리드 직접 편집 트랜잭션.
   * 1) 현재 version 재조회 → expected와 비교(1차 방어)
   * 2) UPDATE WHERE version=expected → returning 0행이면 race → rebase_required(2차 방어)
   * 3) translation_revisions insert(mergedProposalId=null, author=lead)
   * 4) contributions(segment_edit) insert
   */
  async applyEdit(params: {
    translationId: string;
    segmentId: string;
    expectedVersion: number;
    newText: string;
    commitMessage: string | null;
    leadId: string;
  }): Promise<EditSegmentOutcome> {
    const { translationId, segmentId, expectedVersion, newText, commitMessage, leadId } = params;
    return this.db.transaction(async (tx) => {
      const currentRows = await tx
        .select({ text: translationSegments.text, version: translationSegments.version })
        .from(translationSegments)
        .where(
          and(
            eq(translationSegments.translationId, translationId),
            eq(translationSegments.segmentId, segmentId),
          ),
        )
        .limit(1);
      const current = currentRows[0];
      if (!current) {
        return { kind: "rebase_required" as const, currentVersion: -1, currentText: "" };
      }
      if (current.version !== expectedVersion) {
        return {
          kind: "rebase_required" as const,
          currentVersion: current.version,
          currentText: current.text,
        };
      }

      const now = new Date();
      const newVersion = current.version + 1;

      const updated = await tx
        .update(translationSegments)
        .set({
          text: newText,
          version: newVersion,
          lastEditorId: leadId,
          lastEditedAt: now,
          status: "approved",
        })
        .where(
          and(
            eq(translationSegments.translationId, translationId),
            eq(translationSegments.segmentId, segmentId),
            eq(translationSegments.version, current.version),
          ),
        )
        .returning({
          segmentId: translationSegments.segmentId,
          version: translationSegments.version,
          text: translationSegments.text,
          lastEditedAt: translationSegments.lastEditedAt,
        });
      if (updated.length !== 1 || !updated[0]) {
        // 2차 방어: UPDATE 0행 — 그 사이 다른 트랜잭션이 version을 올렸다.
        const raceRows = await tx
          .select({ text: translationSegments.text, version: translationSegments.version })
          .from(translationSegments)
          .where(
            and(
              eq(translationSegments.translationId, translationId),
              eq(translationSegments.segmentId, segmentId),
            ),
          )
          .limit(1);
        const race = raceRows[0];
        return {
          kind: "rebase_required" as const,
          currentVersion: race?.version ?? -1,
          currentText: race?.text ?? "",
        };
      }

      const [revision] = await tx
        .insert(translationRevisions)
        .values({
          translationId,
          authorId: leadId,
          mergedProposalId: null,
          commitMessage,
          snapshot: {
            schemaVersion: 1,
            kind: "segment-direct-edit",
            segmentId,
            before: { text: current.text, version: current.version },
            after: { text: newText, version: newVersion },
          },
        })
        .returning({ revisionId: translationRevisions.revisionId });
      if (!revision) throw new Error("revision insert returned no row");

      await tx.insert(contributions).values({
        userId: leadId,
        eventType: "segment_edit",
        entityRef: {
          translationId,
          segmentId,
          revisionId: revision.revisionId,
        },
      });

      return {
        segmentId: updated[0].segmentId,
        version: updated[0].version,
        text: updated[0].text,
        revisionId: revision.revisionId,
        lastEditedAt: updated[0].lastEditedAt.toISOString(),
      };
    });
  }
}
