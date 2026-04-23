/**
 * SourceRepository integration test.
 *
 * withRollback으로 user + source + translation을 삽입한 뒤
 * findRegisteredByArxivBareId가 기대한 슬러그를 돌려주는지 확인한다.
 * 트랜잭션 바깥에서는 모든 row가 사라진다(rollback sentinel).
 */

import { randomUUID } from "node:crypto";

import { sources, translations, users } from "@poomgeul/db";

import { SourceRepository, DB_TOKEN } from "../../src/modules/source/source.repository.js";
import { withRollback } from "../db/test-db.js";

describe("SourceRepository.findRegisteredByArxivBareId", () => {
  it("returns the slug for a ko translation whose source has the exact arXiv URL", async () => {
    await withRollback(async (db) => {
      const lead = await db
        .insert(users)
        .values({ email: `lead-${randomUUID()}@example.invalid`, displayName: "Lead" })
        .returning();
      const leadId = lead[0]!.id;

      const inserted = await db
        .insert(sources)
        .values({
          title: "Example CC BY paper",
          author: ["A Author"],
          originalLang: "en",
          license: "CC-BY",
          attributionSource: "https://arxiv.org/abs/2504.20451",
          sourceVersion: "v1",
          importedBy: leadId,
        })
        .returning();
      const sourceId = inserted[0]!.sourceId;

      await db.insert(translations).values({
        sourceId,
        targetLang: "ko",
        leadId,
        license: "CC-BY",
        slug: "example-cc-by-paper",
        status: "reviewed",
      });

      const repo = new SourceRepository(db);
      // 스텁 DB_TOKEN 주입 경로: SourceRepository는 생성자 인자로 Db를 받으므로
      // DI 컨테이너를 구성하지 않고 직접 new로 호출한다.
      void DB_TOKEN;

      const found = await repo.findRegisteredByArxivBareId("2504.20451");
      expect(found).toMatchObject({
        slug: "example-cc-by-paper",
        targetLang: "ko",
        sourceVersion: "v1",
      });
    });
  });

  it("accepts versioned URL form (arXiv.org/abs/<bareId>v<N>)", async () => {
    await withRollback(async (db) => {
      const lead = await db
        .insert(users)
        .values({ email: `lead-${randomUUID()}@example.invalid` })
        .returning();
      const leadId = lead[0]!.id;

      const inserted = await db
        .insert(sources)
        .values({
          title: "Versioned",
          author: ["Someone"],
          originalLang: "en",
          license: "CC-BY-SA",
          attributionSource: "https://arxiv.org/abs/2406.01234v3",
          sourceVersion: "v3",
          importedBy: leadId,
        })
        .returning();

      await db.insert(translations).values({
        sourceId: inserted[0]!.sourceId,
        targetLang: "ko",
        leadId,
        license: "CC-BY-SA",
        slug: "versioned",
      });

      const repo = new SourceRepository(db);
      const found = await repo.findRegisteredByArxivBareId("2406.01234");
      expect(found?.slug).toBe("versioned");
    });
  });

  it("returns null when there is no translation (source alone does not count)", async () => {
    await withRollback(async (db) => {
      const lead = await db
        .insert(users)
        .values({ email: `lead-${randomUUID()}@example.invalid` })
        .returning();
      await db.insert(sources).values({
        title: "Source without translation",
        author: ["X"],
        originalLang: "en",
        license: "CC-BY",
        attributionSource: "https://arxiv.org/abs/2310.12345",
        sourceVersion: "v1",
        importedBy: lead[0]!.id,
      });

      const repo = new SourceRepository(db);
      const found = await repo.findRegisteredByArxivBareId("2310.12345");
      expect(found).toBeNull();
    });
  });

  it("returns null when only non-ko translations exist", async () => {
    await withRollback(async (db) => {
      const lead = await db
        .insert(users)
        .values({ email: `lead-${randomUUID()}@example.invalid` })
        .returning();
      const inserted = await db
        .insert(sources)
        .values({
          title: "English-only translation",
          author: ["Z"],
          originalLang: "en",
          license: "CC-BY",
          attributionSource: "https://arxiv.org/abs/2207.00777",
          sourceVersion: "v1",
          importedBy: lead[0]!.id,
        })
        .returning();
      await db.insert(translations).values({
        sourceId: inserted[0]!.sourceId,
        targetLang: "fr",
        leadId: lead[0]!.id,
        license: "CC-BY",
        slug: "fr-only",
      });

      const repo = new SourceRepository(db);
      const found = await repo.findRegisteredByArxivBareId("2207.00777");
      expect(found).toBeNull();
    });
  });

  it("rejects prefix collisions (e.g. 2310.123 does not match 2310.1234)", async () => {
    await withRollback(async (db) => {
      const lead = await db
        .insert(users)
        .values({ email: `lead-${randomUUID()}@example.invalid` })
        .returning();
      const inserted = await db
        .insert(sources)
        .values({
          title: "Longer bareId",
          author: ["Q"],
          originalLang: "en",
          license: "CC-BY",
          attributionSource: "https://arxiv.org/abs/2310.12345",
          sourceVersion: "v1",
          importedBy: lead[0]!.id,
        })
        .returning();
      await db.insert(translations).values({
        sourceId: inserted[0]!.sourceId,
        targetLang: "ko",
        leadId: lead[0]!.id,
        license: "CC-BY",
        slug: "longer",
      });

      // Search with a shorter bareId that is a prefix of the registered one.
      const repo = new SourceRepository(db);
      const found = await repo.findRegisteredByArxivBareId("2310.123");
      expect(found).toBeNull();
    });
  });
});
