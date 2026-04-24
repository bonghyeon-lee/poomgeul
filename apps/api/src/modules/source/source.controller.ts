import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { User } from "@poomgeul/db";
import { IsString, MaxLength } from "class-validator";

import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import { SourceInputError, parseSourceInput } from "./input.js";
import { LicenseLookupService, type LicenseLookupResult } from "./license-lookup.js";
import { SourceService, type CreateTranslationResult } from "./source.service.js";

export type LicenseLookupApiResult =
  | LicenseLookupResult
  | {
      outcome: "invalid-input";
      code: "empty" | "unsupported";
      reason: string;
    };

export type CreateApiResult =
  | CreateTranslationResult
  | {
      outcome: "invalid-input";
      code: "empty" | "unsupported";
      reason: string;
    };

export class CreateSourceBody {
  @ApiProperty({
    description: "Raw user input — arXiv ID, arXiv URL, or DOI.",
    example: "2310.12345",
  })
  @IsString()
  @MaxLength(512)
  input!: string;
}

@ApiTags("source")
@Controller("sources")
export class SourceController {
  // tsx dev 러너는 emitDecoratorMetadata를 생성하지 않아 Nest가 타입-기반 DI의
  // 파라미터 토큰을 읽지 못한다. @Inject(Class)로 명시하면 메타데이터 없이도 주입된다.
  // 빌드(node dist/main.js) 경로는 ts가 메타를 생성하므로 영향 없다.
  constructor(
    @Inject(LicenseLookupService) private readonly lookupService: LicenseLookupService,
    @Inject(SourceService) private readonly sourceService: SourceService,
  ) {}

  @Get("license")
  @ApiOperation({
    summary: "Look up the license of an arXiv source by ID / URL / DOI",
    description:
      "Resolves the license of a source for the Import flow via the real arXiv " +
      "Query API. Returns a discriminated union keyed by `outcome`: `allowed` / " +
      "`blocked` / `not-found` / `unsupported-format` / `upstream-error` / " +
      "`invalid-input`. See docs/specs/m0-mvp.md §2 and docs/policy/licensing.md.",
  })
  @ApiQuery({
    name: "input",
    type: String,
    required: true,
    description: "Raw user input — arXiv ID, arXiv URL, or DOI.",
    example: "2310.12345",
  })
  @ApiOkResponse({
    description:
      "Lookup result. Exactly one of the union members is returned; discriminate on the `outcome` field.",
  })
  async lookupLicense(@Query("input") input: string): Promise<LicenseLookupApiResult> {
    const raw = typeof input === "string" ? input : "";
    let parsed;
    try {
      parsed = parseSourceInput(raw);
    } catch (err) {
      return toInvalidInputResult(err);
    }
    return this.lookupService.lookup(parsed);
  }

  @Post()
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Register a new Source + Translation (M0 import flow)",
    description:
      "Re-runs the license lookup, then creates Source and Translation rows " +
      "in one transaction if the license is allowed. arXiv only in M0 — DOI " +
      "returns `unsupported-format`. The segmentation pass (M0 #3) runs " +
      "separately; Segment rows are empty on creation. Requires an authenticated " +
      "session; the caller becomes the Source importer and Translation lead.",
  })
  @ApiBody({ type: CreateSourceBody })
  @ApiOkResponse({
    description:
      "Creation result. `created` on success, `already-registered` if the source exists with a ko translation, or any of the lookup failure outcomes passthrough.",
  })
  @ApiUnauthorizedResponse({ description: "No session cookie or session is invalid/expired." })
  async createSource(
    @Body() body: CreateSourceBody,
    @CurrentUser() user: User,
  ): Promise<CreateApiResult> {
    const raw = typeof body?.input === "string" ? body.input : "";
    let parsed;
    try {
      parsed = parseSourceInput(raw);
    } catch (err) {
      return toInvalidInputResult(err);
    }
    if (parsed.kind !== "arxiv") {
      return {
        outcome: "unsupported-format",
        reason:
          "M0는 arXiv 원문만 import한다. DOI 경로는 M1에서 Crossref·DOAJ 연동과 함께 추가된다.",
      };
    }
    return this.sourceService.createFromArxiv(parsed, user.id);
  }
}

function toInvalidInputResult(err: unknown): {
  outcome: "invalid-input";
  code: "empty" | "unsupported";
  reason: string;
} {
  if (err instanceof SourceInputError) {
    return {
      outcome: "invalid-input",
      code: err.code,
      reason:
        err.code === "empty"
          ? "arXiv ID나 URL을 입력한다."
          : "인식할 수 없는 입력이다. 2310.12345 또는 https://arxiv.org/abs/... 형태로 넣는다.",
    };
  }
  throw err;
}
