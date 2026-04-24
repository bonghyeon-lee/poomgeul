/**
 * Reader 번들을 서버 측에서 가져오는 loader. Next App Router의 서버 컴포넌트에서
 * 직접 호출하도록 설계되어 있다(이 파일은 "use client" 아님).
 *
 * 전략:
 *   1) GET /api/translations/:slug를 시도한다. dev에선 Next rewrite가 api(:3000)로
 *      프록시한다. 서버 컴포넌트가 직접 `/api/...`로 때릴 때는 절대 URL이 필요하다 —
 *      NEXT_PUBLIC_API_BASE(기본 http://localhost:3001)로 self-host URL을 만든다.
 *   2) 200이면 API bundle을 UI가 쓰는 ReaderBundle shape으로 변환.
 *   3) 404/네트워크 오류면 null. 호출부가 mock을 fallback으로 조회한다.
 */

import type {
  Contributor,
  ProposalCommentItem,
  ProposalSummary,
  ReaderBundle,
  Segment,
  Source,
  SourceLicense,
  Translation,
  TranslationSegment,
  TranslationStatus,
} from "./types";

type ApiBundle = {
  source: {
    sourceId: string;
    title: string;
    author: string[];
    originalLang: string;
    license: SourceLicense;
    attributionSource: string;
    sourceVersion: string;
    importedAt: string;
    importer: { userId: string; displayName: string | null; githubHandle: string | null };
  };
  translation: {
    translationId: string;
    sourceId: string;
    targetLang: string;
    leadId: string;
    leadDisplayName: string | null;
    status: TranslationStatus;
    license: SourceLicense;
    slug: string;
    currentRevisionId: string | null;
  };
  segments: Array<{
    segmentId: string;
    order: number;
    originalText: string;
    kind: Segment["kind"];
  }>;
  translationSegments: Array<{
    segmentId: string;
    text: string;
    aiDraftText: string | null;
    aiDraftSource: {
      model: string;
      promptHash: string;
      promptVersion?: string;
      version?: string;
    } | null;
    version: number;
    status: TranslationSegment["status"];
  }>;
};

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
}

/**
 * 서버 컴포넌트에서 로그인 여부를 확인. AppHeader도 같은 조회를 하지만 page는
 * 그 결과를 받을 수 없어 이 헬퍼로 한 번 더 호출한다. 실패 시 미인증 취급.
 * Next dev rewrite 경유라 브라우저 쿠키를 다시 복제해 주어야 한다.
 */
export async function loadIsAuthed(): Promise<boolean> {
  // next/headers는 서버 모듈이라 이 파일이 클라이언트 번들에 포함되면 오류가 난다.
  // Reader page는 서버 컴포넌트에서만 이 함수를 호출한다("use client" 없음).
  const { headers } = await import("next/headers");
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie) return false;
  try {
    const res = await fetch(`${apiBase()}/api/auth/me`, {
      headers: { cookie },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reader 페이지에서 제안 섹션·세그먼트 카드 chip을 채우기 위한 경량 목록.
 * ADR-0006에 따라 Reader 번들에서 분리해 별도 엔드포인트에서 가져온다.
 * API 실패 시 빈 배열로 폴백해 Reader가 계속 렌더되도록.
 */
export async function loadProposalsFromApi(slug: string): Promise<ProposalSummary[]> {
  const url = `${apiBase()}/api/translations/${encodeURIComponent(slug)}/proposals`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  type ApiItem = {
    proposalId: string;
    segmentId: string;
    proposerDisplayName: string | null;
    proposerGithubHandle: string | null;
    status: ProposalSummary["status"];
    createdAt: string;
  };
  let items: ApiItem[];
  try {
    items = (await res.json()) as ApiItem[];
  } catch {
    return [];
  }

  return items.map((p) => ({
    proposalId: p.proposalId,
    segmentId: p.segmentId,
    proposerDisplayName: p.proposerDisplayName ?? p.proposerGithubHandle ?? "(이름 없음)",
    status: p.status,
    createdAt: p.createdAt,
  }));
}

/**
 * 단일 proposal의 댓글 목록. Reader에서 open proposal 행 아래 인라인으로
 * 바로 표시하는 용도. 실패 시 빈 배열 폴백(댓글 섹션만 생략되도록).
 */
export async function loadProposalCommentsFromApi(
  slug: string,
  proposalId: string,
): Promise<ProposalCommentItem[]> {
  const url = `${apiBase()}/api/translations/${encodeURIComponent(slug)}/proposals/${encodeURIComponent(
    proposalId,
  )}/comments`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  try {
    return (await res.json()) as ProposalCommentItem[];
  } catch {
    return [];
  }
}

export type TranslationListItem = {
  translationId: string;
  slug: string;
  targetLang: string;
  status: TranslationStatus;
  license: SourceLicense;
  sourceId: string;
  title: string;
  authors: string[];
  sourceLicense: SourceLicense;
  sourceVersion: string;
  importedAt: string;
  leadDisplayName: string | null;
  segmentCount: number;
  translatedCount: number;
  /**
   * Reader가 의미 있는 렌더를 할 수 있는가(세그먼트가 1개 이상 존재). false면 ar5iv가
   * 지원하지 않은 논문으로 간주하고 목록에서 별도 섹션에 둔다.
   */
  renderable: boolean;
};

/**
 * 최근 등록된 ko 번역본 목록을 API에서 가져온다. 서버 컴포넌트에서 /translations 페이지가 호출.
 * API가 닿지 않으면 빈 배열 + 에러 문자열을 상위로 전달해 "API 꺼짐" 안내를 띄울 수 있게 한다.
 */
export async function loadTranslationList(
  limit = 50,
): Promise<{ items: TranslationListItem[]; error: string | null }> {
  const url = `${apiBase()}/api/translations?limit=${limit}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    return {
      items: [],
      error: `API 서버에 닿지 못했다: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!res.ok) {
    return { items: [], error: `API 오류: HTTP ${res.status}` };
  }
  const body = (await res.json()) as TranslationListItem[];
  return { items: body, error: null };
}

export async function loadReaderBundleFromApi(slug: string): Promise<ReaderBundle | null> {
  const url = `${apiBase()}/api/translations/${encodeURIComponent(slug)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      // 생성 직후 읽기 요청이 자주 오므로 서버 캐시는 비활성.
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const api = (await res.json()) as ApiBundle;
  return toReaderBundle(api);
}

function toReaderBundle(api: ApiBundle): ReaderBundle {
  const translationId = api.translation.translationId;
  const source: Source = {
    sourceId: api.source.sourceId,
    title: api.source.title,
    author: api.source.author,
    originalLang: api.source.originalLang,
    license: api.source.license,
    attributionSource: api.source.attributionSource,
    sourceVersion: api.source.sourceVersion,
    importedAt: api.source.importedAt,
    importedBy: {
      userId: api.source.importer.userId,
      displayName: api.source.importer.displayName ?? "(이름 없음)",
      ...(api.source.importer.githubHandle
        ? { githubHandle: api.source.importer.githubHandle }
        : {}),
    },
  };

  const translation: Translation = {
    translationId: api.translation.translationId,
    sourceId: api.translation.sourceId,
    targetLang: api.translation.targetLang,
    leadId: api.translation.leadId,
    leadDisplayName: api.translation.leadDisplayName ?? "(리드 미정)",
    status: api.translation.status,
    license: api.translation.license,
    slug: api.translation.slug,
    currentRevisionId: api.translation.currentRevisionId,
  };

  const segments: Segment[] = api.segments.map((s) => ({
    segmentId: s.segmentId,
    sourceId: source.sourceId,
    order: s.order,
    originalText: s.originalText,
    kind: s.kind,
  }));

  // DB에 translationSegments가 아직 없을 수 있다. UI의 SegmentPair는 각 원문 세그먼트에
  // 대응되는 TranslationSegment가 있다고 가정하므로, 없으면 원문을 그대로 text로 넣어
  // "번역 대기" 스텁을 만든다. version=0으로 두어 아직 번역이 안 됐음을 드러낸다.
  const tsMap = new Map(api.translationSegments.map((ts) => [ts.segmentId, ts]));
  const translationSegments: TranslationSegment[] = segments.map((seg) => {
    const existing = tsMap.get(seg.segmentId);
    if (existing) {
      return {
        translationId,
        segmentId: seg.segmentId,
        text: existing.text,
        aiDraftText: existing.aiDraftText,
        aiDraftSource: existing.aiDraftSource,
        version: existing.version,
        lastEditorId: translation.leadId,
        lastEditedAt: api.source.importedAt,
        status: existing.status,
      };
    }
    return {
      translationId,
      segmentId: seg.segmentId,
      text: "(번역 대기)",
      aiDraftText: null,
      aiDraftSource: null,
      version: 0,
      lastEditorId: translation.leadId,
      lastEditedAt: api.source.importedAt,
      status: "unreviewed",
    };
  });

  const contributors: Contributor[] = [
    {
      userId: translation.leadId,
      displayName: translation.leadDisplayName,
      ...(api.source.importer.githubHandle
        ? { githubHandle: api.source.importer.githubHandle }
        : {}),
      mergedProposalCount: 0,
    },
  ];

  const proposals: ProposalSummary[] = [];

  return {
    source,
    segments,
    translation,
    translationSegments,
    contributors,
    proposals,
  };
}
