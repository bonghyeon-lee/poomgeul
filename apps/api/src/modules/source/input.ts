/**
 * Normalize a user-provided source identifier into a typed token.
 *
 * Accepts modern arXiv ids (with or without version), arXiv URLs (abs/pdf/html
 * across arxiv.org and ar5iv.labs.arxiv.org), the `arXiv:` text prefix, and
 * DOIs (bare, prefixed, or via doi.org URLs).
 *
 * Throws `SourceInputError` for empty input, legacy arXiv ids
 * (`cs.AI/0601001`-style), and any other unrecognized form. Validation of
 * whether the parsed id actually exists or is openly licensed is the next
 * pipeline step's job — see docs/guides/source-import.md.
 */

export type ArxivId = {
  kind: "arxiv";
  /** Canonical token as we recognized it, possibly versioned. */
  id: string;
  /** The id without a version suffix, e.g. "2504.20451". */
  bareId: string;
  /** Version number if the user pinned one; undefined means latest. */
  version: number | undefined;
};

export type DoiId = {
  kind: "doi";
  /** Lower-cased canonical form: "10.<registrant>/<suffix>". */
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

// ---- arXiv patterns ----
const ARXIV_MODERN = /^(\d{4}\.\d{4,5})(?:v(\d+))?$/;
const ARXIV_PREFIX = /^arxiv:/i;
const ARXIV_URL_HOSTS = new Set(["arxiv.org", "www.arxiv.org", "ar5iv.labs.arxiv.org"]);
const ARXIV_PATH_ID = /\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?(?:\/|$)/;

// ---- DOI patterns ----
// DOI syntax: "10.<registrant>/<suffix>". The suffix is opaque per the
// Handle System spec; this pattern is intentionally permissive — Crossref
// is the authoritative validator downstream.
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
  return {
    kind: "arxiv",
    id: token,
    bareId,
    version,
  };
}

function parseBareDoi(token: string): DoiId | undefined {
  const m = DOI_BODY.exec(token);
  if (!m || m.index !== 0) return undefined;
  return {
    kind: "doi",
    id: m[0].toLowerCase(),
  };
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

  throw new SourceInputError("unsupported", `unsupported source input: ${JSON.stringify(trimmed)}`);
}
