import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from "@nestjs/common";

import type { EditSegmentBody } from "./dto.js";
import { type EditSegmentResult, SegmentEditRepository } from "./segment-edit.repository.js";

/**
 * §5 세그먼트 에디터 서비스. Proposal.decide(approve)와 구조적으로 대칭이지만
 * "리드 직접 편집" 경로를 담당(workflow-proposal.md §리드 메인테이너의 직접 편집).
 *
 * 에러 경로:
 *  - 400 validation_failed: trim 후 빈 문자열, 또는 If-Match 누락·형식 오류
 *  - 403 forbidden: 리드가 아님
 *  - 404 not_found: slug 또는 segment 미존재
 *  - 409 rebase_required: 버전이 그 사이 바뀜(ADR-0003, ADR-0006 에러 모델)
 *  - 412 precondition_failed: If-Match 값이 형식은 맞으나 서버 snapshot과 달랐을 때
 *    로 쓸 수도 있으나, ADR-0006 에러 모델이 이미 409/rebase_required로 통일돼 있어
 *    일관성을 위해 본 구현은 version mismatch를 전부 409로 집약한다. 412는 헤더 자체
 *    누락/파싱 실패에만 한정.
 */
@Injectable()
export class SegmentEditService {
  constructor(@Inject(SegmentEditRepository) private readonly repo: SegmentEditRepository) {}

  async edit(params: {
    slug: string;
    segmentId: string;
    ifMatch: string | undefined;
    leadId: string;
    body: EditSegmentBody;
  }): Promise<EditSegmentResult> {
    const { slug, segmentId, ifMatch, leadId, body } = params;

    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) {
      throw new PreconditionFailedException({
        code: "precondition_failed",
        message: 'If-Match 헤더가 필요합니다. 값은 정수 버전(예: If-Match: "3")이어야 합니다.',
      });
    }

    const translation = await this.repo.findTranslationBySlug(slug);
    if (!translation) {
      throw new NotFoundException({
        code: "not_found",
        message: `translation ${slug} not found`,
      });
    }
    if (translation.leadId !== leadId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "only the translation lead can directly edit segments",
      });
    }

    const trimmed = body.text.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: "validation_failed",
        message: "text는 공백만 포함할 수 없다",
      });
    }
    const trimmedMessage = body.commitMessage?.trim();
    const commitMessage = trimmedMessage && trimmedMessage.length > 0 ? trimmedMessage : null;

    const snapshot = await this.repo.findSegmentSnapshot(translation.translationId, segmentId);
    if (!snapshot) {
      throw new NotFoundException({
        code: "not_found",
        message: `segment ${segmentId} not found in translation ${slug}`,
      });
    }

    // no-op 가드: trimmed 텍스트가 현재와 동일 + version까지 맞으면 불필요한 revision
    // 기록을 만들지 않는다. 화면에서 사용자가 수정 없이 저장을 누르는 흔한 경우.
    if (snapshot.text === trimmed && snapshot.version === expectedVersion) {
      return {
        segmentId: snapshot.segmentId,
        version: snapshot.version,
        text: snapshot.text,
        revisionId: "",
        lastEditedAt: new Date().toISOString(),
      };
    }

    const outcome = await this.repo.applyEdit({
      translationId: translation.translationId,
      segmentId,
      expectedVersion,
      newText: trimmed,
      commitMessage,
      leadId,
    });

    if ("kind" in outcome && outcome.kind === "rebase_required") {
      throw new ConflictException({
        code: "rebase_required",
        currentVersion: outcome.currentVersion,
        currentText: outcome.currentText,
      });
    }
    return outcome as EditSegmentResult;
  }
}

/**
 * If-Match 값 파서. RFC 7232는 ETag를 quoted-string으로 요구하지만 내부 API라
 * strong match 시맨틱까지 구현하지는 않는다. 관용적 수용 범위:
 *   "3", 3, W/"3"
 * 모두 숫자 3으로 해석. 파싱 실패면 null.
 */
function parseIfMatch(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const stripped = raw.replace(/^W\//i, "").trim().replace(/^"|"$/g, "").trim();
  if (stripped.length === 0) return null;
  const n = Number(stripped);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}
