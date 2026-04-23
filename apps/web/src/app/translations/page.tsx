import type { Metadata } from "next";
import Link from "next/link";

import { Button, Chip, LicenseBadge, Logo } from "@/components/ui";
import {
  loadTranslationList,
  sampleReaderBundle,
  type TranslationListItem,
} from "@/features/reader";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "번역본 목록 — poomgeul",
  description:
    "poomgeul에 등록된 한국어 번역본 목록. 최근 등록 순. 각 항목은 제목·저자·상태·번역 진행도를 포함한다.",
};

// 매번 새로 조회(캐시 X). API_BASE가 바뀌거나 API가 꺼져 있을 때 fallback 흐름이 안정.
export const dynamic = "force-dynamic";

export default async function TranslationsListPage() {
  const { items, error } = await loadTranslationList(50);
  const merged = mergeWithSample(items);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.crumbs}>
            <Logo variant="mark" href="/" ariaLabel="poomgeul 홈" />
            <span className={styles.crumbsSep}>/</span>
            <Link href="/">홈</Link>
            <span className={styles.crumbsSep}>/</span>
            <span>번역본 목록</span>
          </div>
          <Button variant="secondary" href="/import">
            원문 가져오기
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.title}>번역본 목록</h1>
          <p className={styles.lead}>
            등록된 한국어 번역본이다. 최근 등록된 것부터. 각 카드를 눌러 Reader로 이동한다.
          </p>
        </section>

        {error ? (
          <p className={styles.errorBox}>
            API에서 목록을 가져오지 못했다 — {error}. dev에서는 apps/api가 :3000에 떠 있어야
            한다. 아래는 mock 샘플 하나만 표시된다.
          </p>
        ) : null}

        {merged.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyTitle}>아직 번역본이 없다</span>
            <span className={styles.emptyBody}>
              <Link href="/import">원문 가져오기</Link>에서 arXiv ID나 URL을 붙여넣어 첫 번째
              번역본을 등록해보자.
            </span>
          </div>
        ) : (
          <div className={styles.grid}>
            {merged.map((item) => (
              <TranslationCard key={item.translationId} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TranslationCard({ item }: { item: TranslationListItem }) {
  const progressPct =
    item.segmentCount > 0
      ? Math.round((item.translatedCount / item.segmentCount) * 100)
      : null;

  return (
    <Link href={`/t/${item.slug}`} className={styles.card}>
      <div className={styles.cardMeta}>
        <span className={styles.cardMetaLeft}>
          <Chip status={statusToChip(item.status)}>{item.status}</Chip>
          <LicenseBadge kind={item.license} />
        </span>
        <span>{item.sourceVersion}</span>
      </div>
      <h2 className={styles.cardTitle}>{item.title}</h2>
      <p className={styles.cardByline}>
        {formatAuthors(item.authors)} · 리드 {item.leadDisplayName ?? "(미정)"}
      </p>
      <div className={styles.cardStats}>
        <span>segments {item.segmentCount}</span>
        <span>
          translated {item.translatedCount}
          {progressPct !== null ? ` · ${progressPct}%` : ""}
        </span>
        <span>imported {formatDate(item.importedAt)}</span>
      </div>
    </Link>
  );
}

function statusToChip(status: "draft" | "reviewed" | "featured") {
  switch (status) {
    case "draft":
      return "open" as const;
    case "reviewed":
      return "merged" as const;
    case "featured":
      return "merged" as const;
  }
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "(저자 미상)";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} 외 ${authors.length - 3}명`;
}

function formatDate(iso: string): string {
  // 로케일 포맷 차이를 피하기 위해 yyyy-mm-dd로.
  return iso.slice(0, 10);
}

/**
 * Reader mock 샘플(sparse-moe-...)을 목록 맨 뒤에 넣는다.
 * API 목록에 같은 slug가 이미 있으면 중복시키지 않는다.
 */
function mergeWithSample(items: TranslationListItem[]): TranslationListItem[] {
  if (items.some((it) => it.slug === sampleReaderBundle.translation.slug)) {
    return items;
  }
  const sample: TranslationListItem = {
    translationId: sampleReaderBundle.translation.translationId,
    slug: sampleReaderBundle.translation.slug,
    targetLang: sampleReaderBundle.translation.targetLang,
    status: sampleReaderBundle.translation.status,
    license: sampleReaderBundle.translation.license,
    sourceId: sampleReaderBundle.source.sourceId,
    title: sampleReaderBundle.source.title,
    authors: sampleReaderBundle.source.author,
    sourceLicense: sampleReaderBundle.source.license,
    sourceVersion: sampleReaderBundle.source.sourceVersion,
    importedAt: sampleReaderBundle.source.importedAt,
    leadDisplayName: sampleReaderBundle.translation.leadDisplayName,
    segmentCount: sampleReaderBundle.segments.length,
    translatedCount: sampleReaderBundle.translationSegments.filter(
      (ts) => ts.aiDraftText !== null,
    ).length,
  };
  return [...items, sample];
}
