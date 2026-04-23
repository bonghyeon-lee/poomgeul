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
    version: number;
    status: TranslationSegment["status"];
  }>;
};

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
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
        aiDraftSource: null,
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
