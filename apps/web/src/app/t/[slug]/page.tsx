import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Chip, LicenseBadge, Logo } from "@/components/ui";
import {
  AttributionBlock,
  findReaderBundleBySlug,
  listReaderSlugs,
  SegmentPair,
} from "@/features/reader";

import styles from "./page.module.css";

type RouteParams = { slug: string };

export function generateStaticParams(): RouteParams[] {
  return listReaderSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = findReaderBundleBySlug(slug);
  if (!bundle) return { title: "번역본을 찾을 수 없음 — poomgeul" };

  const title = `${bundle.source.title} — 한국어 번역 (poomgeul)`;
  const description = `${bundle.source.author.join(", ")}의 ${bundle.source.sourceVersion} 판본을 한국어로 옮긴다. 리드: ${bundle.translation.leadDisplayName}.`;
  return {
    title,
    description,
    robots: bundle.translation.status === "draft" ? { index: false } : undefined,
  };
}

export default async function ReaderPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const bundle = findReaderBundleBySlug(slug);
  if (!bundle) notFound();

  const { source, segments, translation, translationSegments, contributors, proposals } = bundle;

  const tsByKey = new Map<string, (typeof translationSegments)[number]>();
  for (const ts of translationSegments) {
    tsByKey.set(ts.segmentId, ts);
  }

  const openProposalBySegment = new Map<string, (typeof proposals)[number]>();
  for (const p of proposals) {
    if (p.status !== "open") continue;
    openProposalBySegment.set(p.segmentId, p);
  }

  const bodySegments = segments.filter((s) => s.kind !== "reference");
  const referenceSegments = segments.filter((s) => s.kind === "reference");

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.crumbs}>
            <Logo variant="mark" href="/" ariaLabel="poomgeul 홈" />
            <span className={styles.crumbsSep}>/</span>
            <Link href="/">원문 목록</Link>
            <span className={styles.crumbsSep}>/</span>
            <span>{source.sourceVersion}</span>
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.statusTag}>{translation.status}</span>
            <span className={styles.crumbsSep}>·</span>
            <span>en → ko</span>
            <span className={styles.crumbsSep}>·</span>
            <LicenseBadge kind={translation.license} />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.title}>
          <span className={styles.langPair}>
            arxiv:{source.attributionSource.split("/").pop()} · {source.sourceVersion}
          </span>
          <h1 className={styles.paperTitle}>{source.title}</h1>
          <p className={styles.byline}>
            {source.author.join(", ")} · 한국어 번역 리드 {translation.leadDisplayName}
          </p>
          <div className={styles.badges}>
            <LicenseBadge kind={source.license} />
            <Chip status="open">open proposals {openProposalBySegment.size}</Chip>
            <Chip status="merged">reviewed revision</Chip>
          </div>
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <h2>본문</h2>
            <span className={styles.sectionHeaderHint}>원문 · 번역 병렬 · 세그먼트 {bodySegments.length}개</span>
          </div>
          <div className={styles.bodyColumn}>
            {bodySegments.map((seg) => {
              const ts = tsByKey.get(seg.segmentId);
              if (!ts) return null;
              const proposal = openProposalBySegment.get(seg.segmentId);
              return (
                <SegmentPair
                  key={seg.segmentId}
                  segment={seg}
                  translation={ts}
                  openProposalStatus={proposal ? proposal.status : null}
                />
              );
            })}
          </div>
        </section>

        {referenceSegments.length > 0 ? (
          <section>
            <div className={styles.sectionHeader}>
              <h2>참고문헌</h2>
              <span className={styles.sectionHeaderHint}>번역 진행도 계산에서 제외</span>
            </div>
            <div className={styles.bodyColumn}>
              {referenceSegments.map((seg) => {
                const ts = tsByKey.get(seg.segmentId);
                if (!ts) return null;
                return <SegmentPair key={seg.segmentId} segment={seg} translation={ts} />;
              })}
            </div>
          </section>
        ) : null}

        <section>
          <div className={styles.sectionHeader}>
            <h2>제안 현황</h2>
            <span className={styles.sectionHeaderHint}>최근 {proposals.length}건</span>
          </div>
          {proposals.length === 0 ? (
            <p className={styles.notice}>
              아직 제안이 없다. 번역을 읽다가 개선할 곳을 찾으면 세그먼트 옆의
              &lsquo;제안하기&rsquo;를 누르자.
            </p>
          ) : (
            <div>
              {proposals.map((p) => (
                <div key={p.proposalId} className={styles.proposalRow}>
                  <span className={styles.proposalId}>#{p.proposalId}</span>
                  <a href={`#seg-${segments.find((s) => s.segmentId === p.segmentId)?.order ?? ""}`} className={styles.proposalSeg}>
                    {p.segmentId}
                  </a>
                  <Chip status={p.status}>{p.status}</Chip>
                  <span className={styles.proposalWho}>{p.proposerDisplayName}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <h2>출처와 기여자</h2>
            <span className={styles.sectionHeaderHint}>CC BY / CC BY-SA / PD</span>
          </div>
          <AttributionBlock
            source={source}
            translation={translation}
            contributors={contributors}
          />
        </section>
      </main>
    </div>
  );
}
