/**
 * arXiv 원문의 라이선스 조회 — M0에서는 fixture 기반 mock 구현.
 *
 * 실제 구현은 arXiv API / Crossref / DOAJ를 호출해야 한다. 그 교체 지점은
 * 이 파일 안의 fixture 배열과 resolveFromFixture 함수다. 계약(응답 shape +
 * outcome 분기)은 docs/specs/m0-mvp.md §2와 docs/policy/licensing.md를 따른다.
 */

import type { ParsedSource } from "./input.js";

export type AllowedLicense = "CC-BY" | "CC-BY-SA" | "PD";
export type BlockedLicense = "CC-BY-ND" | "CC-BY-NC-ND";
export type AnyLicense = AllowedLicense | BlockedLicense;

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
    };

type Fixture = {
  license: AnyLicense;
  title: string;
  authors: string[];
  version: string;
  alreadyRegistered?: string;
};

const FIXTURES: Record<string, Fixture> = {
  "2310.12345": {
    license: "CC-BY",
    title: "Sparse Mixture-of-Experts for Low-Resource Machine Translation",
    authors: ["Sofía Restrepo", "Arjun Iyer", "Lina Haddad"],
    version: "v2",
    alreadyRegistered: "sparse-moe-low-resource-mt",
  },
  "2504.20451": {
    license: "CC-BY-SA",
    title: "Adaptive Calibration under Distribution Shift",
    authors: ["Mei Tanaka", "Emeka Okafor"],
    version: "v1",
  },
  "2401.11112": {
    license: "CC-BY-ND",
    title: "A No-Derivatives Survey of Recent Diffusion Methods",
    authors: ["Jin Park"],
    version: "v3",
  },
  "2506.00001": {
    license: "PD",
    title: "Public Notes on Inverse Problems (1972)",
    authors: ["Henri Dubois"],
    version: "v1",
  },
};

function isAllowed(license: AnyLicense): license is AllowedLicense {
  return license === "CC-BY" || license === "CC-BY-SA" || license === "PD";
}

function resolveFromFixture(bareId: string): LicenseLookupResult {
  const fixture = FIXTURES[bareId];
  if (!fixture) {
    return {
      outcome: "not-found",
      reason: `arXiv에서 ${bareId}를 찾을 수 없다. ID가 정확한지 확인한다.`,
    };
  }

  if (!isAllowed(fixture.license)) {
    return {
      outcome: "blocked",
      license: fixture.license,
      title: fixture.title,
      reason:
        "파생물 제작을 금지하는 라이선스라 번역본을 등록할 수 없다. policy/licensing.md 참조.",
    };
  }

  const shareAlike = fixture.license === "CC-BY-SA";
  return {
    outcome: "allowed",
    license: fixture.license,
    translationLicense: fixture.license,
    title: fixture.title,
    authors: fixture.authors,
    version: fixture.version,
    shareAlike,
    alreadyRegistered: Boolean(fixture.alreadyRegistered),
    ...(fixture.alreadyRegistered ? { registeredSlug: fixture.alreadyRegistered } : {}),
  };
}

export function lookupLicense(parsed: ParsedSource): LicenseLookupResult {
  if (parsed.kind === "doi") {
    return {
      outcome: "unsupported-format",
      reason:
        "M0는 arXiv 원문만 import한다. DOI 경로는 M1에서 Crossref·DOAJ 연동과 함께 추가된다.",
    };
  }
  return resolveFromFixture(parsed.bareId);
}
