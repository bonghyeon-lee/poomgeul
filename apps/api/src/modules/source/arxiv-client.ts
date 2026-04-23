import { Injectable, Logger } from "@nestjs/common";

/**
 * arXiv Query API 클라이언트.
 *
 * 엔드포인트: GET https://export.arxiv.org/api/query?id_list=<bareId>
 * 응답은 Atom XML. 우리가 실제로 쓰는 필드는 entry.title / author.name /
 * link[rel="license"] 뿐이라 정규식 추출이면 충분하다. 스키마가 바뀌면
 * arxiv-client.spec.ts(고정된 Atom 문자열) 쪽이 먼저 실패한다.
 *
 * arXiv는 논문별로 라이선스 링크를 "저자가 CC 하나를 선택한 경우에만"
 * 포함한다. 기본은 arXiv non-exclusive distribution license — 번역·재배포
 * 권한 없음 → policy/licensing.md상 차단 대상.
 *
 * Rate limit: arXiv는 초당 1회 수준 권고. M0 트래픽에서는 캐시 없이도 안전.
 */

export type ArxivLicenseUrl = string;

export type ArxivMetadata = {
  bareId: string;
  /** arXiv가 돌려준 최신 버전. 예: "v1", "v2" (absolute <id>에서 추출). */
  version: string;
  title: string;
  authors: string[];
  /** license link의 href. null이면 CC를 명시적으로 선택하지 않은 것(= arXiv 기본). */
  licenseUrl: ArxivLicenseUrl | null;
};

export class ArxivNotFoundError extends Error {
  constructor(bareId: string) {
    super(`arXiv entry not found for ${bareId}`);
    this.name = "ArxivNotFoundError";
  }
}

export class ArxivUpstreamError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ArxivUpstreamError";
    this.cause = cause;
  }
}

const DEFAULT_ENDPOINT = "https://export.arxiv.org/api/query";
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 아주 작은 Atom 파서. 네임스페이스가 붙은 요소(xmlns:arxiv)는 무시한다.
 * 우리 목적에 `<entry>`가 1개뿐인 응답(id_list=하나)만 다루므로 충분하다.
 */
function parseAtomEntry(xml: string, bareId: string): ArxivMetadata | null {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return null;
  const entry = entryMatch[1]!;

  const idMatch = entry.match(/<id>([^<]+)<\/id>/);
  // id 형태: http://arxiv.org/abs/2310.12345v2
  const versionMatch = idMatch?.[1]?.match(/\/([0-9.]+)(v\d+)\s*$/);
  const version = versionMatch?.[2] ?? "v1";

  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  const title = (titleMatch?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const authors: string[] = [];
  for (const m of entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)) {
    const raw = (m[1] ?? "").trim();
    if (raw) authors.push(raw);
  }

  // <link href="..." rel="license" .../> — 순서·추가 속성이 arXiv 쪽에서 바뀔 수 있으니 느슨하게.
  const licenseLinkMatch = entry.match(/<link[^>]*rel="license"[^>]*>/);
  let licenseUrl: string | null = null;
  if (licenseLinkMatch) {
    const href = licenseLinkMatch[0].match(/href="([^"]+)"/);
    licenseUrl = href?.[1] ?? null;
  } else {
    // href="..." rel="license" 순이 아닐 수도 있으니 반대 조합도 한 번.
    const alt = entry.match(/<link[^>]*rel='license'[^>]*>/);
    if (alt) {
      const href = alt[0].match(/href='([^']+)'/);
      licenseUrl = href?.[1] ?? null;
    }
  }

  return {
    bareId,
    version,
    title: title || "(untitled)",
    authors,
    licenseUrl,
  };
}

@Injectable()
export class ArxivClient {
  private readonly logger = new Logger(ArxivClient.name);
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options?: { endpoint?: string; timeoutMs?: number }) {
    this.endpoint = options?.endpoint ?? process.env.ARXIV_API_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options?.timeoutMs ?? Number(process.env.ARXIV_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  async fetchMetadata(bareId: string): Promise<ArxivMetadata> {
    const url = `${this.endpoint}?id_list=${encodeURIComponent(bareId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { accept: "application/atom+xml" },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new ArxivUpstreamError(`arXiv request timed out after ${this.timeoutMs}ms`, err);
      }
      throw new ArxivUpstreamError("arXiv request failed", err);
    }
    clearTimeout(timer);

    if (res.status === 404) {
      throw new ArxivNotFoundError(bareId);
    }
    if (!res.ok) {
      throw new ArxivUpstreamError(`arXiv responded with HTTP ${res.status}`);
    }

    const xml = await res.text();
    const metadata = parseAtomEntry(xml, bareId);
    if (!metadata) {
      // arXiv는 없는 ID에도 200 + totalResults=0 빈 entry를 돌려준다.
      throw new ArxivNotFoundError(bareId);
    }

    // Query API가 모든 논문에 license link를 싣지 않는다(관측된 누락 사례: 2604.00030
    // CC BY-NC-SA). null이면 abs HTML 페이지에서 한 번 더 찾아본다 — 여기 실패는
    // 치명적이지 않으므로 null 유지로 fallback.
    if (metadata.licenseUrl === null) {
      const htmlLicense = await this.tryFetchLicenseFromAbs(bareId);
      if (htmlLicense) {
        metadata.licenseUrl = htmlLicense;
      }
    }

    this.logger.log(
      `arxiv:${bareId} · version=${metadata.version} · license=${metadata.licenseUrl ?? "(arxiv-default)"}`,
    );

    return metadata;
  }

  /**
   * abs 페이지의 `<div class="abs-license"><a href="...">...</a></div>` 한 줄에서
   * 라이선스 URL을 뽑는다. Query API가 null을 돌려줄 때만 호출.
   * 네트워크/파싱 실패는 null로 삼켜 상위가 기존 fallback(arxiv-default)을 그대로 쓰게 한다.
   */
  private async tryFetchLicenseFromAbs(bareId: string): Promise<string | null> {
    const url = `https://arxiv.org/abs/${encodeURIComponent(bareId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { accept: "text/html" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(
        /<div[^>]*class="[^"]*abs-license[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i,
      );
      return match?.[1] ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * arXiv가 돌려주는 라이선스 URL을 내부 라이선스 kind로 정규화한다.
 *
 * URL 예:
 *   https://creativecommons.org/licenses/by/4.0/         → "CC-BY"
 *   https://creativecommons.org/licenses/by-sa/4.0/      → "CC-BY-SA"
 *   https://creativecommons.org/licenses/by-nd/4.0/      → "CC-BY-ND"
 *   https://creativecommons.org/licenses/by-nc-nd/4.0/   → "CC-BY-NC-ND"
 *   https://creativecommons.org/publicdomain/zero/1.0/   → "PD"
 *   null 또는 arxiv-specific                              → null (arXiv 기본 라이선스)
 */
export type NormalizedLicense =
  | "CC-BY"
  | "CC-BY-SA"
  | "CC-BY-ND"
  | "CC-BY-NC"
  | "CC-BY-NC-SA"
  | "CC-BY-NC-ND"
  | "PD";

export function normalizeLicenseUrl(url: string | null): NormalizedLicense | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (!u.includes("creativecommons.org")) return null;
  if (u.includes("/publicdomain/")) return "PD";
  // 접두가 겹치므로 더 구체적인 쪽을 먼저 매칭해야 한다.
  if (u.includes("/by-nc-nd/")) return "CC-BY-NC-ND";
  if (u.includes("/by-nc-sa/")) return "CC-BY-NC-SA";
  if (u.includes("/by-nc/")) return "CC-BY-NC";
  if (u.includes("/by-nd/")) return "CC-BY-ND";
  if (u.includes("/by-sa/")) return "CC-BY-SA";
  if (u.includes("/by/")) return "CC-BY";
  return null;
}
