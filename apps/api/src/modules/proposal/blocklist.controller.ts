import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { User } from "@poomgeul/db";

import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import { CreateBlocklistBody } from "./dto.js";
import type { BlocklistEntry } from "./proposal.repository.js";
import { ProposalService } from "./proposal.service.js";

@ApiTags("proposal")
@Controller("translations/:slug/blocklist")
export class BlocklistController {
  constructor(@Inject(ProposalService) private readonly service: ProposalService) {}

  @Post()
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Lead blocks a user from posting new proposals in this translation (ADR-0007)",
    description:
      "Only the translation lead may call. Soft upsert — re-blocking revives an existing " +
      "soft-deleted row. Blocked user still sees existing open proposals; only new creations " +
      "are rejected with 403 blocked_by_lead. reason is lead-only.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiBody({ type: CreateBlocklistBody })
  @ApiCreatedResponse({ description: "Blocklist entry." })
  @ApiBadRequestResponse({ description: "validation_failed — lead cannot block themselves." })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiForbiddenResponse({ description: "Requester is not the translation lead." })
  @ApiNotFoundResponse({ description: "translation not found." })
  async block(
    @Param("slug") slug: string,
    @Body() body: CreateBlocklistBody,
    @CurrentUser() user: User,
  ): Promise<BlocklistEntry> {
    return this.service.blockUser(slug, user.id, body);
  }

  @Delete(":userId")
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Lead revokes an active block (ADR-0007)",
    description:
      "Idempotent — revoking a missing or already-revoked row returns 204 without error. " +
      "The row is kept with revoked_at set, preserving audit history for re-blocks.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "userId", type: String })
  @ApiNoContentResponse({ description: "Revoked (or no-op if none was active)." })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiForbiddenResponse({ description: "Requester is not the translation lead." })
  @ApiNotFoundResponse({ description: "translation not found." })
  async unblock(
    @Param("slug") slug: string,
    @Param("userId") userId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.service.unblockUser(slug, user.id, userId);
  }

  @Get()
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Lead reads the blocklist (ADR-0007)",
    description:
      "Lead-only. Returns all entries (active and revoked) newest first, each with reason " +
      "visible since reason is designed as a lead-private memo.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ description: "Array of blocklist entries." })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiForbiddenResponse({ description: "Requester is not the translation lead." })
  @ApiNotFoundResponse({ description: "translation not found." })
  async list(@Param("slug") slug: string, @CurrentUser() user: User): Promise<BlocklistEntry[]> {
    return this.service.listBlocklist(slug, user.id);
  }
}
