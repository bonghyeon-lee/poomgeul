import type { Metadata } from "next";
import Link from "next/link";

import { Chip, LicenseBadge, Logo } from "@/components/ui";
import {
  AttributionBlock,
  findReaderBundleBySlug,
  listReaderSlugs,
  loadReaderBundleFromApi,
  ReprocessButton,
  RetryFailedButton,
  SegmentPair,
} from "@/features/reader";

import styles from "./page.module.css";

type RouteParams = { slug: string };

// mock 슬러그는 SSG로, Import로 새로 만들어진 슬러그는 런타임에 렌더한다.
export const dynamicParams = true;

export function generateStaticParams(): RouteParams[] {
  return listReaderSlugs().map((slug) => ({ slug }));
}

async function resolveBundle(slug: string) {
  const apiBundle = await loadReaderBundleFromApi(slug);
  if (apiBundle) return apiBundle;
  return findReaderBundleBySlug(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await resolveBundle(slug);
  if (!bundle) {
    return {
      title: `${slug} — 세그먼트 분할 대기 · poomgeul`,
      robots: { index: false },
    };
  }

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
  const bundle = await resolveBundle(slug);
  if (!bundle) {
    return <PendingSegmentsView slug={slug} />;
  }
  // 세그먼트가 비어 있으면 API에서 번역본은 찾았으나 분할이 아직인 상태로 간주.
  if (bundle.segments.length === 0) {
    return <PendingSegmentsView slug={slug} />;
  }

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

  // 번역 진행도 계산: reference 제외한 세그먼트 중 aiDraftText가 실제로 채워진 개수.
  const translatable = segments.filter((s) => s.kind !== "reference");
  const translatedOk = translatable.filter((s) => {
    const ts = tsByKey.get(s.segmentId);
    return ts !== undefined && ts.aiDraftText !== null;
  }).length;
  const translatedFailed = translatable.length - translatedOk;
  const progressPct =
    translatable.length > 0 ? Math.round((translatedOk / translatable.length) * 100) : 100;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.crumbs}>
            <Logo variant="mark" href="/" ariaLabel="poomgeul 홈" />
            <span className={styles.crumbsSep}>/</span>
            <Link href="/translations">번역본 목록</Link>
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
            <h2>번역 진행도</h2>
            <span className={styles.sectionHeaderHint}>reference 제외 · AI 초벌 기준</span>
          </div>
          <div className={styles.progressCard}>
            <div className={styles.progressHead}>
              <span className={styles.progressTitle}>
                {translatedOk} / {translatable.length} 세그먼트 번역됨 ({progressPct}%)
              </span>
              <span className={styles.progressStats}>
                <span>총 segments: {segments.length}</span>
                <span>references 제외: {referenceSegments.length}</span>
                <span>실패 / 원문 유지: {translatedFailed}</span>
              </span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={`${styles.progressFill} ${
                  progressPct === 0
                    ? styles.progressFillEmpty
                    : progressPct < 100
                      ? styles.progressFillPartial
                      : ""
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {translatedFailed > 0 ? (
              <RetryFailedButton slug={slug} failedCount={translatedFailed} />
            ) : null}
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

function PendingSegmentsView({ slug }: { slug: string }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.crumbs}>
            <Logo variant="mark" href="/" ariaLabel="poomgeul 홈" />
            <span className={styles.crumbsSep}>/</span>
            <Link href="/">홈</Link>
            <span className={styles.crumbsSep}>/</span>
            <span>{slug}</span>
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.statusTag}>pending</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.title}>
          <h1 className={styles.paperTitle}>세그먼트 분할 대기 중</h1>
          <p className={styles.byline}>slug: {slug}</p>
        </section>
        <section>
          <div className={styles.sectionHeader}>
            <h2>무슨 일이 일어났나</h2>
          </div>
          <p className={styles.notice}>
            번역본 row는 만들어졌으나 원문 세그먼트 분할과 AI 초벌이 아직 비어 있다.
            등록 당시에 파서·LLM이 없었거나, 당시 호출이 실패했거나, 직접 URL을 입력해
            도착했는데 슬러그가 없는 경우다. arXiv 원문이라면 아래 버튼으로 ar5iv에서
            다시 가져와 Gemini 초벌까지 다시 채울 수 있다. 호출 수에 비례해 시간이 걸린다.
          </p>
          <div className={styles.reprocessWrap}>
            <ReprocessButton slug={slug} />
          </div>
          <p className={`${styles.notice} ${styles.noticeSpaced}`}>
            슬러그 오타라면 <Link href="/">홈</Link>에서 다시 시작할 수 있다.
          </p>
        </section>
      </main>
    </div>
  );
}
