/**
 * /api/sources/license 호출 클라이언트.
 *
 * 서버는 LicenseLookupResult의 union + invalid-input outcome을 그대로 돌려준다.
 * 현재 화면은 서버에 보내기 전에 parseSourceInput으로 클라이언트 측 검증을
 * 이미 하므로, 일반 경로에서는 invalid-input이 오지 않는다(안전망으로만 수용).
 *
 * dev에서는 next.config.mjs의 rewrite가 /api/* → :3000/api/*로 프록시하므로
 * 호출자는 같은 origin이라고 믿고 상대 경로로 호출한다.
 */

import type { LicenseKind } from "@/components/ui";

import type { ParsedSource } from "./parse-source-input";

/**
 * 서버 응답의 blocked.license는 CC 라이선스 키 외에도 "arxiv-default" 리터럴을
 * 돌려준다. 이는 저자가 CC를 선택하지 않아 arXiv 기본 non-exclusive 라이선스가
 * 적용되는 경우로, LicenseBadge가 아닌 텍스트 배지로 렌더한다.
 */
export type BlockedLicense = LicenseKind | "arxiv-default";

export type LicenseLookupResult =
  | {
      outcome: "allowed";
      license: LicenseKind;
      translationLicense: LicenseKind;
      title: string;
      authors: string[];
      version: string;
      shareAlike: boolean;
      alreadyRegistered: boolean;
      registeredSlug?: string;
    }
  | {
      outcome: "blocked";
      license: BlockedLicense;
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
    }
  | {
      outcome: "network-error";
      reason: string;
    };

type ServerResult =
  | Exclude<LicenseLookupResult, { outcome: "network-error" }>
  | { outcome: "invalid-input"; code: "empty" | "unsupported"; reason: string };

function rawInputFor(parsed: ParsedSource): string {
  if (parsed.kind === "arxiv") {
    return parsed.version ? `${parsed.bareId}v${parsed.version}` : parsed.bareId;
  }
  return parsed.id;
}

export async function lookupSourceLicense(parsed: ParsedSource): Promise<LicenseLookupResult> {
  const input = rawInputFor(parsed);
  const url = `/api/sources/license?input=${encodeURIComponent(input)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  } catch (err) {
    return {
      outcome: "network-error",
      reason:
        err instanceof Error
          ? `API 서버에 닿지 못했다: ${err.message}. dev 환경에서는 apps/api가 :3000에서 떠 있어야 한다.`
          : "API 서버에 닿지 못했다.",
    };
  }

  if (!res.ok) {
    return {
      outcome: "network-error",
      reason: `API 오류: HTTP ${res.status}`,
    };
  }

  const body = (await res.json()) as ServerResult;

  // invalid-input은 클라이언트 파서가 먼저 걸러낸 형태라 일반적으로 도달하지 않는다.
  // 도달하면 사용자 관점에서는 not-found와 동일하게 취급한다.
  if (body.outcome === "invalid-input") {
    return { outcome: "not-found", reason: body.reason };
  }
  return body;
}
