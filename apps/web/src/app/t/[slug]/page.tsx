import type { Metadata } from "next";
import Link from "next/link";

import { Chip, LicenseBadge } from "@/components/ui";
import {
  AttributionBlock,
  BlocklistManager,
  BlockProposerButton,
  DecideButtons,
  findReaderBundleBySlug,
  listReaderSlugs,
  loadBlocklistFromApi,
  loadMe,
  loadProposalCommentsFromApi,
  loadProposalsFromApi,
  loadReaderBundleFromApi,
  ProposalCommentThread,
  type ProposalCommentItem,
  ProposeButton,
  ReprocessButton,
  RetryFailedButton,
  SegmentPair,
  WithdrawButton,
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
  const description = `${bundle.source.author.join(", ")}의 ${bundle.source.sourceVersion} 판본을 한국어로 옮깁니다. 리드: ${bundle.translation.leadDisplayName}.`;
  return {
    title,
    description,
    robots: bundle.translation.status === "draft" ? { index: false } : undefined,
  };
}

export default async function ReaderPage({ params }: { params: Promise<RouteParams> }) {
  const { slug } = await params;
  // Reader bundle과 Proposal 목록을 병렬 fetch (ADR-0006: 번들에 proposals를 끼우지 않고
  // 별도 엔드포인트에서 lazy fetch). API가 404 등으로 실패하면 loadProposalsFromApi는
  // 빈 배열을 돌려줘, mock bundle이 자체 보유한 샘플 proposals로 자연 폴백된다.
  const [bundle, apiProposals, me] = await Promise.all([
    resolveBundle(slug),
    loadProposalsFromApi(slug),
    loadMe(),
  ]);
  if (!bundle) {
    return <PendingSegmentsView slug={slug} />;
  }
  // 세그먼트가 비어 있으면 API에서 번역본은 찾았으나 분할이 아직인 상태로 간주.
  if (bundle.segments.length === 0) {
    return <PendingSegmentsView slug={slug} />;
  }

  const { source, segments, translation, translationSegments, contributors } = bundle;
  const proposals = apiProposals.length > 0 ? apiProposals : bundle.proposals;
  const isAuthed = me !== null;
  const isLead = me !== null && me.id === translation.leadId;

  // ADR-0007-2: 리드만 blocklist를 읽는다(API가 403 → null). 그 외 사용자는 섹션 자체가 숨겨진다.
  const blocklistEntries = isLead ? await loadBlocklistFromApi(slug) : null;
  const activelyBlockedUserIds = new Set(
    (blocklistEntries ?? []).filter((e) => e.revokedAt === null).map((e) => e.userId),
  );

  const tsByKey = new Map<string, (typeof translationSegments)[number]>();
  for (const ts of translationSegments) {
    tsByKey.set(ts.segmentId, ts);
  }

  const openProposalBySegment = new Map<string, (typeof proposals)[number]>();
  for (const p of proposals) {
    if (p.status !== "open") continue;
    openProposalBySegment.set(p.segmentId, p);
  }

  // open proposal별 댓글을 병렬 fetch. Reader bundle이 API 출처일 때만 의미가
  // 있으므로 apiProposals.length > 0인 경우에만 실제 호출, 그 외에는 빈 맵.
  // 실패는 API helper 안에서 [] 폴백 — Reader 섹션이 깨지지 않는다.
  const commentsByProposalId = new Map<string, ProposalCommentItem[]>();
  if (apiProposals.length > 0) {
    const openProposalIds = Array.from(openProposalBySegment.values()).map((p) => p.proposalId);
    const lists = await Promise.all(
      openProposalIds.map((pid) => loadProposalCommentsFromApi(slug, pid)),
    );
    openProposalIds.forEach((pid, i) => {
      const list = lists[i];
      if (list) commentsByProposalId.set(pid, list);
    });
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
      <main className={styles.main}>
        <div className={styles.pageBar}>
          <nav className={styles.crumbs} aria-label="breadcrumb">
            <Link href="/translations">번역본 목록</Link>
            <span className={styles.crumbsSep}>/</span>
            <span>{source.sourceVersion}</span>
          </nav>
          <div className={styles.headerMeta}>
            <span className={styles.statusTag}>{translation.status}</span>
            <span className={styles.crumbsSep}>·</span>
            <span>en → ko</span>
            <span className={styles.crumbsSep}>·</span>
            <LicenseBadge kind={translation.license} />
          </div>
        </div>
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
            <span className={styles.sectionHeaderHint}>
              원문 · 번역 병렬 · 세그먼트 {bodySegments.length}개
            </span>
          </div>
          <div className={styles.bodyColumn}>
            {bodySegments.map((seg) => {
              const ts = tsByKey.get(seg.segmentId);
              if (!ts) return null;
              const proposal = openProposalBySegment.get(seg.segmentId);
              return (
                <div key={seg.segmentId}>
                  <SegmentPair
                    segment={seg}
                    translation={ts}
                    openProposalStatus={proposal ? proposal.status : null}
                  />
                  <ProposeButton
                    slug={slug}
                    segmentId={seg.segmentId}
                    baseSegmentVersion={ts.version}
                    initialText={ts.text}
                    isAuthed={isAuthed}
                  />
                </div>
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
              아직 등록된 제안이 없습니다. 번역을 읽다가 개선할 부분을 발견하시면 세그먼트 옆의
              &lsquo;제안하기&rsquo;를 눌러주세요.
            </p>
          ) : (
            <div>
              {proposals.map((p) => {
                const threadComments = commentsByProposalId.get(p.proposalId);
                // decide/withdraw는 open일 때만 의미가 있다. terminal 제안에는
                // 목록 행만 보여 주고 액션 버튼은 숨긴다.
                const isOpen = p.status === "open";
                const isProposer = me !== null && p.proposerId === me.id;
                return (
                  <div key={p.proposalId}>
                    <div className={styles.proposalRow}>
                      <span className={styles.proposalId}>#{p.proposalId}</span>
                      <a
                        href={`#seg-${segments.find((s) => s.segmentId === p.segmentId)?.order ?? ""}`}
                        className={styles.proposalSeg}
                      >
                        {p.segmentId}
                      </a>
                      <Chip status={p.status}>{p.status}</Chip>
                      <span className={styles.proposalWho}>{p.proposerDisplayName}</span>
                      {isOpen && isLead ? (
                        <DecideButtons slug={slug} proposalId={p.proposalId} />
                      ) : null}
                      {isOpen && isProposer && !isLead ? (
                        <WithdrawButton slug={slug} proposalId={p.proposalId} />
                      ) : null}
                      {isLead &&
                      p.proposerId !== translation.leadId &&
                      !activelyBlockedUserIds.has(p.proposerId) ? (
                        <BlockProposerButton
                          slug={slug}
                          proposerId={p.proposerId}
                          proposerDisplayName={p.proposerDisplayName}
                        />
                      ) : null}
                    </div>
                    {threadComments ? (
                      <ProposalCommentThread
                        slug={slug}
                        proposalId={p.proposalId}
                        comments={threadComments}
                        isAuthed={isAuthed}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isLead && blocklistEntries !== null ? (
          <section>
            <div className={styles.sectionHeader}>
              <h2>제안 차단 관리</h2>
              <span className={styles.sectionHeaderHint}>리드 전용 · ADR-0007</span>
            </div>
            <BlocklistManager slug={slug} entries={blocklistEntries} />
          </section>
        ) : null}

        <section>
          <div className={styles.sectionHeader}>
            <h2>출처와 기여자</h2>
            <span className={styles.sectionHeaderHint}>CC BY / CC BY-SA / PD</span>
          </div>
          <AttributionBlock source={source} translation={translation} contributors={contributors} />
        </section>
      </main>
    </div>
  );
}

function PendingSegmentsView({ slug }: { slug: string }) {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.pageBar}>
          <nav className={styles.crumbs} aria-label="breadcrumb">
            <Link href="/">홈</Link>
            <span className={styles.crumbsSep}>/</span>
            <span>{slug}</span>
          </nav>
          <div className={styles.headerMeta}>
            <span className={styles.statusTag}>pending</span>
          </div>
        </div>
        <section className={styles.title}>
          <h1 className={styles.paperTitle}>세그먼트 분할 대기 중</h1>
          <p className={styles.byline}>slug: {slug}</p>
        </section>
        <section>
          <div className={styles.sectionHeader}>
            <h2>무슨 일이 일어났나</h2>
          </div>
          <p className={styles.notice}>
            번역본 데이터는 생성되었으나 원문 세그먼트 분할과 AI 초벌 번역이 아직 진행되지
            않았습니다. 등록 당시에 파서 또는 LLM 오류가 있었거나, 호출이 실패했거나, 잘못된
            슬러그로 접속한 경우일 수 있습니다. arXiv 원문이라면 아래 버튼으로 ar5iv에서 다시 가져와
            Gemini 초벌까지 다시 생성할 수 있습니다. 분량에 따라 다소 시간이 소요될 수 있습니다.
          </p>
          <div className={styles.reprocessWrap}>
            <ReprocessButton slug={slug} />
          </div>
          <p className={`${styles.notice} ${styles.noticeSpaced}`}>
            슬러그 오타인 경우 <Link href="/">홈</Link>에서 다시 시작하실 수 있습니다.
          </p>
        </section>
      </main>
    </div>
  );
}
