/**
 * SourceService unit test — LicenseLookupService를 stub으로 두고 outcome 전파만 검증.
 * 실제 INSERT 경로(transaction, 시드 유저)는 integration 테스트에서 다룬다.
 */

import type { Db } from "@poomgeul/db";

import type { Ar5ivFetcher } from "./ar5iv-fetcher.js";
import type { LicenseLookupResult } from "./license-lookup.js";
import { LicenseLookupService } from "./license-lookup.js";
import { parseSourceInput, type ArxivId } from "./input.js";
import { SourceService } from "./source.service.js";
import type { TranslationDraftService } from "../translation/translation-draft.service.js";

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

function stubFetcher(): Ar5ivFetcher {
  return {
    fetchHtml: async () => {
      throw new Error("stubFetcher should not be called in these paths");
    },
  } as unknown as Ar5ivFetcher;
}

function stubDraft(): TranslationDraftService {
  return {
    draftAll: async () => {
      throw new Error("stubDraft should not be called in these paths");
    },
  } as unknown as TranslationDraftService;
}

function arxivParsed(bareId = "2504.20451"): ArxivId {
  const parsed = parseSourceInput(bareId);
  if (parsed.kind !== "arxiv") throw new Error("test precondition: expected arxiv");
  return parsed;
}

// These unit tests early-return before touching the DB, so importerId is never
// read. Fixed UUID keeps signatures honest without requiring a real user row.
const STUB_IMPORTER_ID = "00000000-0000-0000-0000-000000000000";

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
      stubFetcher(),
      stubDraft(),
    );
    const result = await svc.createFromArxiv(arxivParsed(), STUB_IMPORTER_ID);
    expect(result).toMatchObject({ outcome: "blocked", license: "arxiv-default" });
  });

  it("forwards not-found outcome", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "not-found",
        reason: "missing",
      }),
      stubFetcher(),
      stubDraft(),
    );
    const result = await svc.createFromArxiv(arxivParsed("9999.99999"), STUB_IMPORTER_ID);
    expect(result).toMatchObject({ outcome: "not-found" });
  });

  it("forwards upstream-error outcome", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "upstream-error",
        reason: "timeout",
      }),
      stubFetcher(),
      stubDraft(),
    );
    const result = await svc.createFromArxiv(arxivParsed(), STUB_IMPORTER_ID);
    expect(result).toMatchObject({ outcome: "upstream-error" });
  });

  it("forwards unsupported-format outcome", async () => {
    const svc = new SourceService(
      stubDb(),
      stubLookup({
        outcome: "unsupported-format",
        reason: "doi",
      }),
      stubFetcher(),
      stubDraft(),
    );
    const result = await svc.createFromArxiv(arxivParsed(), STUB_IMPORTER_ID);
    expect(result).toMatchObject({ outcome: "unsupported-format" });
  });

  it("deduplicates concurrent createFromArxiv calls for the same id (in-flight share)", async () => {
    let lookupCalls = 0;
    const slowLookup = {
      lookup: async () => {
        lookupCalls += 1;
        // LicenseLookupService가 네트워크에 의존하는 것을 흉내. blocked outcome을 돌려
        // DB 경로에 들어가지 않고 빠르게 끝나게 한다.
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          outcome: "blocked",
          license: "arxiv-default",
          title: "Dup",
          reason: "x",
        } as const;
      },
    } as unknown as LicenseLookupService;

    const svc = new SourceService(stubDb(), slowLookup, stubFetcher(), stubDraft());
    const parsed = arxivParsed();
    const [a, b, c] = await Promise.all([
      svc.createFromArxiv(parsed, STUB_IMPORTER_ID),
      svc.createFromArxiv(parsed, STUB_IMPORTER_ID),
      svc.createFromArxiv(parsed, STUB_IMPORTER_ID),
    ]);
    // 같은 Promise가 세 번 반환되었을 것 — lookup은 1회만.
    expect(lookupCalls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("releases the in-flight slot after completion so subsequent calls proceed normally", async () => {
    let lookupCalls = 0;
    const lookup = {
      lookup: async () => {
        lookupCalls += 1;
        return {
          outcome: "blocked",
          license: "arxiv-default",
          title: "x",
          reason: "x",
        } as const;
      },
    } as unknown as LicenseLookupService;

    const svc = new SourceService(stubDb(), lookup, stubFetcher(), stubDraft());
    const parsed = arxivParsed();
    await svc.createFromArxiv(parsed, STUB_IMPORTER_ID);
    await svc.createFromArxiv(parsed, STUB_IMPORTER_ID);
    expect(lookupCalls).toBe(2);
  });
});
