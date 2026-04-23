/**
 * 원문 라이선스 조회 — M0 실제 arXiv API 경로.
 *
 * 입력은 parseSourceInput이 돌려준 ParsedSource. arXiv인 경우 ArxivClient로
 * Atom 메타를 가져와 라이선스 URL을 내부 kind로 정규화하고, 정책
 * (policy/licensing.md)에 따라 outcome을 결정한다. DOI는 M1까지 unsupported.
 *
 * alreadyRegistered 판정은 SourceRepository.findRegisteredByArxivBareId로
 * DB를 조회해 기존 번역본의 slug를 돌려준다. Translation 행이 없으면 false.
 */

import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  ArxivClient,
  ArxivNotFoundError,
  ArxivUpstreamError,
  type NormalizedLicense,
  normalizeLicenseUrl,
} from "./arxiv-client.js";
import type { ParsedSource } from "./input.js";
import { SourceRepository } from "./source.repository.js";

export type AllowedLicense = "CC-BY" | "CC-BY-SA" | "PD";
export type BlockedLicense = "CC-BY-ND" | "CC-BY-NC-ND" | "CC-BY-NC";

export type LicenseLookupResult =
  | {
      outcome: "allowed";
      license: AllowedLicense;
      translationLicense: AllowedLicense;
      title: string;
      authors: string[];
      version: string;
      shareAlike: boolean;
      alreadyRegistered: boolean;
      registeredSlug?: string;
    }
  | {
      outcome: "blocked";
      license: BlockedLicense | "arxiv-default";
      title: string;
      reason: string;
    }
  | {
      outcome: "unsupported-format";
      reason: string;
    }
  | {
      outcome: "not-found";
      reason: string;
    }
  | {
      outcome: "upstream-error";
      reason: string;
    };

export const ARXIV_CLIENT = Symbol("ARXIV_CLIENT");

function isAllowedLicense(kind: NormalizedLicense): kind is AllowedLicense {
  return kind === "CC-BY" || kind === "CC-BY-SA" || kind === "PD";
}

@Injectable()
export class LicenseLookupService {
  private readonly logger = new Logger(LicenseLookupService.name);

  constructor(
    @Inject(ARXIV_CLIENT) private readonly arxiv: ArxivClient,
    // tsx 환경의 emitDecoratorMetadata 누락 우회: @Inject(Class) 명시.
    @Inject(SourceRepository) private readonly repo: SourceRepository,
  ) {}

  async lookup(parsed: ParsedSource): Promise<LicenseLookupResult> {
    if (parsed.kind === "doi") {
      return {
        outcome: "unsupported-format",
        reason:
          "M0는 arXiv 원문만 import한다. DOI 경로는 M1에서 Crossref·DOAJ 연동과 함께 추가된다.",
      };
    }

    let metadata;
    try {
      metadata = await this.arxiv.fetchMetadata(parsed.bareId);
    } catch (err) {
      if (err instanceof ArxivNotFoundError) {
        return {
          outcome: "not-found",
          reason: `arXiv에서 ${parsed.bareId}를 찾을 수 없다. ID가 정확한지 확인한다.`,
        };
      }
      if (err instanceof ArxivUpstreamError) {
        return {
          outcome: "upstream-error",
          reason: `arXiv에 닿지 못했다: ${err.message}`,
        };
      }
      throw err;
    }

    const kind = normalizeLicenseUrl(metadata.licenseUrl);

    if (kind === null) {
      return {
        outcome: "blocked",
        license: "arxiv-default",
        title: metadata.title,
        reason:
          "저자가 CC 라이선스를 명시적으로 선택하지 않았다. arXiv 기본 라이선스는 파생물 제작을 허용하지 않아 번역본을 등록할 수 없다. policy/licensing.md 참조.",
      };
    }

    if (!isAllowedLicense(kind)) {
      return {
        outcome: "blocked",
        license: kind,
        title: metadata.title,
        reason:
          "파생물 제작을 금지하거나 비상업 조건이 붙은 라이선스라 번역본을 등록할 수 없다. policy/licensing.md 참조.",
      };
    }

    const shareAlike = kind === "CC-BY-SA";

    // DB에서 이미 등록된 ko 번역본을 찾는다. DB가 꺼져 있거나 조회 실패가 나도
    // 라이선스 판정 자체는 유효하므로 로그만 남기고 alreadyRegistered=false로 진행한다.
    let registeredSlug: string | undefined;
    try {
      const existing = await this.repo.findRegisteredByArxivBareId(parsed.bareId);
      registeredSlug = existing?.slug;
    } catch (err) {
      this.logger.warn(
        `registration lookup failed for ${parsed.bareId}; treating as not-registered: ${(err as Error).message}`,
      );
    }

    return {
      outcome: "allowed",
      license: kind,
      translationLicense: kind,
      title: metadata.title,
      authors: metadata.authors,
      version: metadata.version,
      shareAlike,
      alreadyRegistered: Boolean(registeredSlug),
      ...(registeredSlug ? { registeredSlug } : {}),
    };
  }
}
