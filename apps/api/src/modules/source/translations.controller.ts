import { Controller, Get, Inject, NotFoundException, Param, Post, Query } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import {
  SourceRepository,
  type ReaderBundleRow,
  type TranslationListItem,
} from "./source.repository.js";
import { SourceService, type ReprocessResult, type RetryFailedResult } from "./source.service.js";

@ApiTags("translation")
@Controller("translations")
export class TranslationsController {
  // tsx 환경의 emitDecoratorMetadata 누락 우회: @Inject(Class) 명시.
  constructor(
    @Inject(SourceRepository) private readonly repo: SourceRepository,
    @Inject(SourceService) private readonly sourceService: SourceService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List recent ko translations (newest first)",
    description:
      "Used by the /translations page to show registered translations. Includes " +
      "per-row segmentCount and translatedCount so the UI can render progress hints.",
  })
  @ApiQuery({
    name: "limit",
    type: Number,
    required: false,
    description: "Max rows to return (1–200, default 50).",
  })
  @ApiOkResponse({ description: "Array of TranslationListItem." })
  async list(@Query("limit") limit?: string): Promise<TranslationListItem[]> {
    const parsed = limit !== undefined ? Number(limit) : undefined;
    const sanitized = Number.isFinite(parsed) ? (parsed as number) : undefined;
    return this.repo.listTranslations(sanitized !== undefined ? { limit: sanitized } : {});
  }

  @Get(":slug")
  @ApiOperation({
    summary: "Fetch a Reader bundle (source + segments + translation) by slug",
    description:
      "Returns everything the Reader needs for a ko translation in a single payload. " +
      "translationSegments may be empty if AI draft (M0 #4) has not populated them yet — " +
      "in that case the UI renders original text only.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ description: "Reader bundle." })
  @ApiNotFoundResponse({ description: "No translation with that slug." })
  async findBySlug(@Param("slug") slug: string): Promise<ReaderBundleRow> {
    const bundle = await this.repo.findReaderBundleBySlug(slug);
    if (!bundle) throw new NotFoundException(`translation not found: ${slug}`);
    return bundle;
  }

  @Post(":slug/reprocess")
  @ApiOperation({
    summary: "Re-run ar5iv segmentation + LLM draft for an existing translation",
    description:
      "Deletes current segments/translation_segments for the translation and rebuilds them " +
      "from scratch. Intended as a manual retry path for pending translations whose " +
      "original import ran before M0 #3/#4 were live, or whose draft partially failed. " +
      "User-triggered only — no automatic retry.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ description: "Reprocess outcome union." })
  async reprocess(@Param("slug") slug: string): Promise<ReprocessResult> {
    return this.sourceService.reprocess(slug);
  }

  @Post(":slug/retry-failed")
  @ApiOperation({
    summary: "Retry only the failed (aiDraftText=null) translation segments",
    description:
      "Picks translation_segments where ai_draft_text IS NULL and the underlying segment.kind " +
      "is not 'reference', sends them through the LLM batch pipeline, and UPDATEs the rows that " +
      "succeeded. ar5iv re-fetch and segment re-splitting are NOT performed — only the draft " +
      "layer is patched. Idempotent; safe to call repeatedly as quota becomes available.",
  })
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ description: "Retry outcome union." })
  async retryFailed(@Param("slug") slug: string): Promise<RetryFailedResult> {
    return this.sourceService.retryFailedDrafts(slug);
  }
}
