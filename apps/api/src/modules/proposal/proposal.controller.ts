import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { User } from "@poomgeul/db";

import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import { CreateProposalBody } from "./dto.js";
import {
  type ProposalComment,
  type ProposalDetail,
  type ProposalListItem,
} from "./proposal.repository.js";
import { type CreateProposalResult, ProposalService } from "./proposal.service.js";

type StatusParam = "all" | "open" | "merged" | "rejected" | "withdrawn" | "stale";

const STATUS_VALUES: readonly StatusParam[] = [
  "all",
  "open",
  "merged",
  "rejected",
  "withdrawn",
  "stale",
] as const;

@ApiTags("proposal")
@Controller("translations/:slug/proposals")
export class ProposalController {
  // tsx dev runner의 emitDecoratorMetadata 누락 우회: @Inject(Class) 명시.
  constructor(@Inject(ProposalService) private readonly service: ProposalService) {}

  @Get()
  @ApiOperation({
    summary: "List proposals for a translation (newest first)",
    description:
      "Used by Reader to render the proposal feed. Default status filter is `all`; " +
      "pass ?status=open to get the open queue alone. Public read (ADR-0005 §1).",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiQuery({ name: "status", required: false, enum: STATUS_VALUES })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "1–200, default 50.",
  })
  @ApiOkResponse({ description: "Array of proposal list items." })
  @ApiNotFoundResponse({ description: "No translation with that slug." })
  async list(
    @Param("slug") slug: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ): Promise<ProposalListItem[]> {
    const statusFilter = sanitizeStatus(status);
    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    return this.service.listBySlug(slug, {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(Number.isFinite(parsedLimit) ? { limit: parsedLimit as number } : {}),
    });
  }

  @Get(":proposalId")
  @ApiOperation({
    summary: "Get a single proposal with current segment state for diff",
    description:
      "Returns the proposal plus the currently-merged translation text and version, " +
      "so the UI can render a 3-column diff (original · current · proposed).",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "proposalId", type: String, description: "UUID." })
  @ApiOkResponse({ description: "Proposal detail with diff context." })
  @ApiNotFoundResponse({ description: "No proposal with that id in this translation." })
  async detail(
    @Param("slug") slug: string,
    @Param("proposalId") proposalId: string,
  ): Promise<ProposalDetail> {
    return this.service.findDetail(slug, proposalId);
  }

  @Post()
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new proposal on a segment (M0 §6 / ADR-0006 C2)",
    description:
      "Requires an authenticated session. baseSegmentVersion is the version of " +
      "translation_segments the proposer saw when drafting — if the segment has " +
      "moved since, the server returns 409 rebase_required so the UI can surface " +
      "the current text for re-drafting (ADR-0003). Same proposer + segment + open " +
      "is limited to one (409 duplicate_open_proposal).",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiBody({ type: CreateProposalBody })
  @ApiCreatedResponse({
    description: "Proposal created. Body: { proposalId, status: 'open', createdAt }.",
  })
  @ApiBadRequestResponse({ description: "Validation failed (code: validation_failed)." })
  @ApiUnauthorizedResponse({ description: "No session cookie or session invalid (ADR-0005)." })
  @ApiNotFoundResponse({ description: "translation or segment not found." })
  @ApiConflictResponse({
    description:
      "Either duplicate_open_proposal (existingProposalId) or rebase_required " +
      "(currentVersion, currentText).",
  })
  async create(
    @Param("slug") slug: string,
    @Body() body: CreateProposalBody,
    @CurrentUser() user: User,
  ): Promise<CreateProposalResult> {
    return this.service.create(slug, user.id, body);
  }

  @Get(":proposalId/comments")
  @ApiOperation({
    summary: "List comments on a proposal (ascending by createdAt)",
    description:
      "Pair of endpoints with POST /comments (C4). Public read — comments are visible " +
      "to anonymous viewers just like the proposal itself.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "proposalId", type: String })
  @ApiOkResponse({ description: "Array of proposal comments." })
  @ApiNotFoundResponse({ description: "No proposal with that id in this translation." })
  async comments(
    @Param("slug") slug: string,
    @Param("proposalId") proposalId: string,
  ): Promise<ProposalComment[]> {
    return this.service.listComments(slug, proposalId);
  }
}

function sanitizeStatus(raw: string | undefined): StatusParam | undefined {
  if (raw === undefined) return undefined;
  return STATUS_VALUES.includes(raw as StatusParam) ? (raw as StatusParam) : undefined;
}
