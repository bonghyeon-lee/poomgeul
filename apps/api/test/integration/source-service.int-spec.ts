/**
 * SourceService.createFromArxiv integration test.
 *
 * ArxivClient를 stub으로 끼우고 실제 DB에 Source + Translation을 한 트랜잭션으로
 * 삽입하는 경로를 확인한다. withRollback이 모든 변경을 되돌리므로 연속 실행 안전.
 */

import { eq, sources, translations, users } from "@poomgeul/db";

import type { ArxivClient, ArxivMetadata } from "../../src/modules/source/arxiv-client.js";
import { parseSourceInput, type ArxivId } from "../../src/modules/source/input.js";
import { LicenseLookupService } from "../../src/modules/source/license-lookup.js";
import { SourceRepository } from "../../src/modules/source/source.repository.js";
import { SourceService } from "../../src/modules/source/source.service.js";
import { withRollback } from "../db/test-db.js";

function arxivParsed(input = "2504.20451"): ArxivId {
  const parsed = parseSourceInput(input);
  if (parsed.kind !== "arxiv") throw new Error("expected arxiv");
  return parsed;
}

function stubArxivClient(meta: ArxivMetadata): ArxivClient {
  return { fetchMetadata: async () => meta } as unknown as ArxivClient;
}

describe("SourceService.createFromArxiv (integration)", () => {
  it("creates source + ko translation in one transaction for a CC BY paper", async () => {
    await withRollback(async (db) => {
      const client = stubArxivClient({
        bareId: "2504.20451",
        version: "v1",
        title: "Adaptive Calibration under Distribution Shift",
        authors: ["Mei Tanaka", "Emeka Okafor"],
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      });
      const repo = new SourceRepository(db);
      const lookup = new LicenseLookupService(client, repo);
      const service = new SourceService(db, lookup);

      const result = await service.createFromArxiv(arxivParsed("2504.20451"));
      expect(result.outcome).toBe("created");
      if (result.outcome !== "created") return;

      // source row inserted
      const srcRows = await db
        .select()
        .from(sources)
        .where(eq(sources.sourceId, result.sourceId));
      expect(srcRows).toHaveLength(1);
      expect(srcRows[0]).toMatchObject({
        title: "Adaptive Calibration under Distribution Shift",
        license: "CC-BY",
        attributionSource: "https://arxiv.org/abs/2504.20451",
        sourceVersion: "v1",
        originalLang: "en",
      });

      // translation row inserted, ko
      const trRows = await db
        .select()
        .from(translations)
        .where(eq(translations.translationId, result.translationId));
      expect(trRows).toHaveLength(1);
      expect(trRows[0]).toMatchObject({
        sourceId: result.sourceId,
        targetLang: "ko",
        license: "CC-BY",
        status: "draft",
        slug: result.slug,
      });

      // dev seed user was created once
      const seed = await db
        .select()
        .from(users)
        .where(eq(users.email, "dev-seed@poomgeul.invalid"));
      expect(seed).toHaveLength(1);
    });
  });

  it("returns already-registered with the existing slug when a ko translation exists", async () => {
    await withRollback(async (db) => {
      // pre-seed an existing translation
      const lead = await db
        .insert(users)
        .values({ email: "dev-seed@poomgeul.invalid", displayName: "dev seed" })
        .returning();
      const srcRow = await db
        .insert(sources)
        .values({
          title: "Existing CC BY",
          author: ["Author"],
          originalLang: "en",
          license: "CC-BY",
          attributionSource: "https://arxiv.org/abs/2504.20451",
          sourceVersion: "v1",
          importedBy: lead[0]!.id,
        })
        .returning();
      await db.insert(translations).values({
        sourceId: srcRow[0]!.sourceId,
        targetLang: "ko",
        leadId: lead[0]!.id,
        status: "reviewed",
        license: "CC-BY",
        slug: "existing-slug",
      });

      const client = stubArxivClient({
        bareId: "2504.20451",
        version: "v1",
        title: "Existing CC BY",
        authors: ["Author"],
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      });
      const repo = new SourceRepository(db);
      const lookup = new LicenseLookupService(client, repo);
      const service = new SourceService(db, lookup);

      const result = await service.createFromArxiv(arxivParsed("2504.20451"));
      expect(result).toMatchObject({
        outcome: "already-registered",
        slug: "existing-slug",
      });
    });
  });

  it("does not insert anything when the license is blocked", async () => {
    await withRollback(async (db) => {
      const client = stubArxivClient({
        bareId: "2401.11112",
        version: "v1",
        title: "No Derivatives",
        authors: ["N"],
        licenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/",
      });
      const repo = new SourceRepository(db);
      const lookup = new LicenseLookupService(client, repo);
      const service = new SourceService(db, lookup);

      const result = await service.createFromArxiv(arxivParsed("2401.11112"));
      expect(result).toMatchObject({ outcome: "blocked", license: "CC-BY-ND" });

      // 생성 경로가 열리지 않았으니 source는 비어 있다.
      const rows = await db.select().from(sources);
      expect(rows).toHaveLength(0);
    });
  });
});
