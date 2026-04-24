import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import {
  type ProposalComment,
  type ProposalDetail,
  type ProposalListItem,
} from "./proposal.repository.js";
import { ProposalService } from "./proposal.service.js";

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
