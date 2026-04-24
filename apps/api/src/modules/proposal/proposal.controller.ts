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
  ApiForbiddenResponse,
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
import { CreateCommentBody, CreateProposalBody, DecideProposalBody } from "./dto.js";
import {
  type ProposalComment,
  type ProposalDetail,
  type ProposalListItem,
  type WithdrawProposalResult,
} from "./proposal.repository.js";
import {
  type CreateProposalResult,
  type DecideResult,
  ProposalService,
} from "./proposal.service.js";

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

  @Post(":proposalId/decide")
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Lead-only approve or reject a proposal (M0 §6 / ADR-0006 C3)",
    description:
      "Unified endpoint for the two terminal lead actions, body.action decides. " +
      "approve: runs the ADR-0003 merge transaction — translation_segments.text " +
      "updated, version incremented, translation_revisions inserted with a " +
      "before/after snapshot, proposals.status='merged', contribution " +
      "(proposal_merge) recorded. reject: just flips status='rejected'. " +
      "Only the translation lead may decide.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "proposalId", type: String })
  @ApiBody({ type: DecideProposalBody })
  @ApiOkResponse({ description: "Decision result (merged with segment snapshot, or rejected)." })
  @ApiBadRequestResponse({
    description: "validation_failed — body.action not in [approve,reject].",
  })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiForbiddenResponse({ description: "Requester is not the translation lead." })
  @ApiNotFoundResponse({ description: "translation or proposal not found." })
  @ApiConflictResponse({
    description:
      "not_open (already merged/rejected/withdrawn/stale) or rebase_required " +
      "(segment moved since the proposal was drafted).",
  })
  async decide(
    @Param("slug") slug: string,
    @Param("proposalId") proposalId: string,
    @Body() body: DecideProposalBody,
    @CurrentUser() user: User,
  ): Promise<DecideResult> {
    return this.service.decide(slug, proposalId, user.id, body.action);
  }

  @Post(":proposalId/withdraw")
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Proposer withdraws their own open proposal (M0 §6 / ADR-0006 C3)",
    description:
      "Only the proposer can withdraw, and only while the proposal is open. " +
      "Sets status='withdrawn', resolvedAt=now, resolvedBy=null (the Git author/ " +
      "committer split doesn't apply to self-withdraw). No Contribution event.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "proposalId", type: String })
  @ApiOkResponse({ description: "Withdrawal result." })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiForbiddenResponse({ description: "Requester is not the proposer." })
  @ApiNotFoundResponse({ description: "translation or proposal not found." })
  @ApiConflictResponse({ description: "not_open — proposal already terminal." })
  async withdraw(
    @Param("slug") slug: string,
    @Param("proposalId") proposalId: string,
    @CurrentUser() user: User,
  ): Promise<WithdrawProposalResult> {
    return this.service.withdraw(slug, proposalId, user.id);
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

  @Post(":proposalId/comments")
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Post a comment on a proposal (ADR-0006 C4)",
    description:
      "Any authenticated user can comment. Comments remain open on terminal " +
      "proposals (merged/rejected/withdrawn/stale) so the post-resolution " +
      "discussion can continue in place. Contribution (review_comment) is " +
      "recorded per workflow-proposal.md §이벤트 발행.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiParam({ name: "proposalId", type: String })
  @ApiBody({ type: CreateCommentBody })
  @ApiCreatedResponse({
    description: "Comment created. Body: { commentId, body, createdAt, author: {...} }.",
  })
  @ApiBadRequestResponse({ description: "validation_failed — empty or oversized body." })
  @ApiUnauthorizedResponse({ description: "No session cookie." })
  @ApiNotFoundResponse({ description: "translation or proposal not found." })
  async postComment(
    @Param("slug") slug: string,
    @Param("proposalId") proposalId: string,
    @Body() body: CreateCommentBody,
    @CurrentUser() user: User,
  ): Promise<ProposalComment> {
    return this.service.createComment(slug, proposalId, user.id, body);
  }
}

function sanitizeStatus(raw: string | undefined): StatusParam | undefined {
  if (raw === undefined) return undefined;
  return STATUS_VALUES.includes(raw as StatusParam) ? (raw as StatusParam) : undefined;
}
