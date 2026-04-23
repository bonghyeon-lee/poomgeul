/**
 * SourceService unit test — LicenseLookupService를 stub으로 두고 outcome 전파만 검증.
 * 실제 INSERT 경로(transaction, 시드 유저)는 integration 테스트에서 다룬다.
 */

import type { Db } from "@poomgeul/db";

import type { LicenseLookupResult } from "./license-lookup.js";
import { LicenseLookupService } from "./license-lookup.js";
import { parseSourceInput, type ArxivId } from "./input.js";
import { SourceService } from "./source.service.js";

function stubLookup(result: LicenseLookupResult): LicenseLookupService {
  return { lookup: async () => result } as unknown as LicenseLookupService;
}

function stubDb(): Db {
  // unit test는 DB를 실제로 건드리지 않는 경로만 본다.
  const panic = () => {
    throw new Error("stubDb should not be called in these paths");
  };
  return {
    select: panic,
    insert: panic,
    transaction: panic,
  } as unknown as Db;
}

function arxivParsed(bareId = "2504.20451"): ArxivId {
  const parsed = parseSourceInput(bareId);
  if (parsed.kind !== "arxiv") throw new Error("test precondition: expected arxiv");
  return parsed;
}

describe("SourceService.createFromArxiv", () => {
  it("forwards blocked outcome without touching the database", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "blocked",
        license: "arxiv-default",
        title: "Non-CC paper",
        reason: "arxiv-default",
      }),
    );
    const result = await svc.createFromArxiv(arxivParsed());
    expect(result).toMatchObject({ outcome: "blocked", license: "arxiv-default" });
  });

  it("forwards not-found outcome", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "not-found",
        reason: "missing",
      }),
    );
    const result = await svc.createFromArxiv(arxivParsed("9999.99999"));
    expect(result).toMatchObject({ outcome: "not-found" });
  });

  it("forwards upstream-error outcome", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "upstream-error",
        reason: "timeout",
      }),
    );
    const result = await svc.createFromArxiv(arxivParsed());
    expect(result).toMatchObject({ outcome: "upstream-error" });
  });

  it("forwards unsupported-format outcome", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "unsupported-format",
        reason: "doi",
      }),
    );
    const result = await svc.createFromArxiv(arxivParsed());
    expect(result).toMatchObject({ outcome: "unsupported-format" });
  });
});
