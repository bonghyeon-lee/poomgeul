import { Body, Controller, Headers, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPreconditionFailedResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { User } from "@poomgeul/db";

import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import { EditSegmentBody } from "./dto.js";
import type { EditSegmentResult } from "./segment-edit.repository.js";
import { SegmentEditService } from "./segment-edit.service.js";

@ApiTags("translation")
@Controller("translations/:slug/segments")
export class SegmentEditController {
  constructor(@Inject(SegmentEditService) private readonly service: SegmentEditService) {}

  @Patch(":segmentId")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Lead directly edits a translation segment (§5)",
    description:
      "Workflow-proposal.md의 '리드 메인테이너의 직접 편집' 경로. If-Match 헤더로 현재 " +
      "버전을 전달해 optimistic locking을 수행한다. 성공 시 translation_segments가 업데이트" +
      "되고 translation_revisions에 새 row가 생기며(mergedProposalId=NULL, authorId=lead) " +
      "segment_edit Contribution이 남는다.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "segmentId", type: String })
  @ApiHeader({
    name: "If-Match",
    description: '현재 translation_segments.version. 따옴표·W/ prefix 모두 수용. 예: "3"',
    required: true,
  })
  @ApiBody({ type: EditSegmentBody })
  @ApiOkResponse({ description: "Updated segment snapshot with new version/revisionId." })
  @ApiBadRequestResponse({ description: "validation_failed — 빈 본문 등." })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiForbiddenResponse({ description: "Requester is not the translation lead." })
  @ApiNotFoundResponse({ description: "translation 또는 segment 미존재." })
  @ApiConflictResponse({
    description:
      "rebase_required — If-Match가 현재 버전과 다르다. body에 currentVersion/currentText 포함.",
  })
  @ApiPreconditionFailedResponse({
    description: "If-Match 헤더가 없거나 파싱할 수 없다.",
  })
  async edit(
    @Param("slug") slug: string,
    @Param("segmentId") segmentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: EditSegmentBody,
    @CurrentUser() user: User,
  ): Promise<EditSegmentResult> {
    return this.service.edit({
      slug,
      segmentId,
      ifMatch,
      leadId: user.id,
      body,
    });
  }
}
