import { Injectable, Logger } from "@nestjs/common";

/**
 * ar5iv HTML fetcher. arXiv의 ar5iv.labs 프로젝트가 LaTeXML로 렌더한 HTML을
 * 1차 파싱 소스로 쓴다(ADR-0004).
 *
 * M0에서는 메모리에 HTML 문자열을 그대로 돌려준다. 캐시·재시도는 필요해지면 추가.
 */

export class Ar5ivNotFoundError extends Error {
  constructor(bareId: string) {
    super(`ar5iv has no HTML for ${bareId}`);
    this.name = "Ar5ivNotFoundError";
  }
}

export class Ar5ivUpstreamError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "Ar5ivUpstreamError";
    this.cause = cause;
  }
}

const DEFAULT_ENDPOINT = "https://ar5iv.labs.arxiv.org/html";
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class Ar5ivFetcher {
  private readonly logger = new Logger(Ar5ivFetcher.name);
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options?: { endpoint?: string; timeoutMs?: number }) {
    this.endpoint = options?.endpoint ?? process.env.AR5IV_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options?.timeoutMs ?? Number(process.env.AR5IV_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  async fetchHtml(bareId: string): Promise<string> {
    const url = `${this.endpoint}/${encodeURIComponent(bareId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { accept: "text/html" },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Ar5ivUpstreamError(`ar5iv request timed out after ${this.timeoutMs}ms`, err);
      }
      throw new Ar5ivUpstreamError("ar5iv request failed", err);
    }
    clearTimeout(timer);

    if (res.status === 404) {
      throw new Ar5ivNotFoundError(bareId);
    }
    if (!res.ok) {
      throw new Ar5ivUpstreamError(`ar5iv responded with HTTP ${res.status}`);
    }

    const html = await res.text();
    this.logger.log(`ar5iv:${bareId} · ${html.length} bytes`);
    return html;
  }
}
