import { Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { SourceRepository, type ReaderBundleRow } from "./source.repository.js";
import { SourceService, type ReprocessResult } from "./source.service.js";

@ApiTags("translation")
@Controller("translations")
export class TranslationsController {
  // tsx 환경의 emitDecoratorMetadata 누락 우회: @Inject(Class) 명시.
  constructor(
    @Inject(SourceRepository) private readonly repo: SourceRepository,
    @Inject(SourceService) private readonly sourceService: SourceService,
  ) {}

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
}
