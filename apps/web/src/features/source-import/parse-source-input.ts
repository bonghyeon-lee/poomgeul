/**
 * arXiv/DOI 원문 입력 파서 (web 클라이언트 측 검증 전용).
 *
 * 정본은 apps/api/src/modules/source/input.ts 이고, 이 파일은 동일 구현의
 * 포팅본이다. 두 쪽이 드리프트하면 parse-source-input.test.ts(이쪽)와
 * apps/api의 input.spec.ts가 같은 가정을 검증하지 못해 테스트로 드러난다.
 *
 * 이 중복은 의도적인 단기 조치다. M0 이후 @poomgeul/source-input 같은
 * 공유 패키지로 이관하고 한 쪽만 남기는 것을 ADR로 남긴다.
 */

export type ArxivId = {
  kind: "arxiv";
  id: string;
  bareId: string;
  version: number | undefined;
};

export type DoiId = {
  kind: "doi";
  id: string;
};

export type ParsedSource = ArxivId | DoiId;

export type SourceInputErrorCode = "empty" | "unsupported";

export class SourceInputError extends Error {
  readonly code: SourceInputErrorCode;
  constructor(code: SourceInputErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SourceInputError";
    this.code = code;
  }
}

const ARXIV_MODERN = /^(\d{4}\.\d{4,5})(?:v(\d+))?$/;
const ARXIV_PREFIX = /^arxiv:/i;
const ARXIV_URL_HOSTS = new Set(["arxiv.org", "www.arxiv.org", "ar5iv.labs.arxiv.org"]);
const ARXIV_PATH_ID = /\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?(?:\/|$)/;

const DOI_BODY = /10\.\d{4,9}\/\S+/;
const DOI_PREFIX = /^doi:/i;
const DOI_URL_HOSTS = new Set(["doi.org", "dx.doi.org"]);

function tryParseArxivUrl(url: URL): ArxivId | undefined {
  if (!ARXIV_URL_HOSTS.has(url.hostname)) return undefined;
  const m = ARXIV_PATH_ID.exec(url.pathname);
  if (!m) return undefined;
  return parseBareArxiv(m[1]!);
}

function tryParseDoiUrl(url: URL): DoiId | undefined {
  if (!DOI_URL_HOSTS.has(url.hostname)) return undefined;
  const path = decodeURIComponent(url.pathname.replace(/^\//, ""));
  return parseBareDoi(path);
}

function parseBareArxiv(token: string): ArxivId | undefined {
  const m = ARXIV_MODERN.exec(token);
  if (!m) return undefined;
  const bareId = m[1]!;
  const version = m[2] ? Number(m[2]) : undefined;
  return { kind: "arxiv", id: token, bareId, version };
}

function parseBareDoi(token: string): DoiId | undefined {
  const m = DOI_BODY.exec(token);
  if (!m || m.index !== 0) return undefined;
  return { kind: "doi", id: m[0].toLowerCase() };
}

function tryAsUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export function parseSourceInput(raw: string): ParsedSource {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SourceInputError("empty", "source input must not be empty");
  }

  const url = tryAsUrl(trimmed);
  if (url) {
    const arxiv = tryParseArxivUrl(url);
    if (arxiv) return arxiv;
    const doi = tryParseDoiUrl(url);
    if (doi) return doi;
  }

  const withoutArxivPrefix = trimmed.replace(ARXIV_PREFIX, "");
  const bareArxiv = parseBareArxiv(withoutArxivPrefix);
  if (bareArxiv) return bareArxiv;

  const withoutDoiPrefix = trimmed.replace(DOI_PREFIX, "");
  const bareDoi = parseBareDoi(withoutDoiPrefix);
  if (bareDoi) return bareDoi;

  throw new SourceInputError(
    "unsupported",
    `unsupported source input: ${JSON.stringify(trimmed)}`,
  );
}
