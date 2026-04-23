import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";

import { SourceInputError, parseSourceInput } from "./input.js";
import { LicenseLookupService, type LicenseLookupResult } from "./license-lookup.js";

export type LicenseLookupApiResult =
  | LicenseLookupResult
  | {
      outcome: "invalid-input";
      code: "empty" | "unsupported";
      reason: string;
    };

@ApiTags("source")
@Controller("sources")
export class SourceController {
  constructor(private readonly lookupService: LicenseLookupService) {}

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
    return this.lookupService.lookup(parsed);
  }
}
