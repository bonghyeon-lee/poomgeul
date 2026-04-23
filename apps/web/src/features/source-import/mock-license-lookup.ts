/**
 * 원문 라이선스 조회의 mock 구현. 실제로는 arXiv API / Crossref / DOAJ를
 * 호출해야 하지만 M0 백엔드가 아직 붙지 않아 bareId 패턴으로 결정론적 시나리오를 돌려준다.
 *
 * 실제 API가 생기면 이 모듈은 그대로 소비되고 내부만 fetch로 교체된다.
 */

import type { LicenseKind } from "@/components/ui";

import type { ParsedSource } from "./parse-source-input";

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
      license: LicenseKind;
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

type MockFixture = {
  license: LicenseKind;
  title: string;
  authors: string[];
  version: string;
  alreadyRegistered?: string;
};

const FIXTURES: Record<string, MockFixture> = {
  // The sample reader bundle — already registered.
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

/**
 * 동기 구현이지만 UI에서 "조회 중…" 스피너를 보여줄 수 있도록 setTimeout으로 한 번 쉬어간다.
 */
export function lookupSourceLicense(
  parsed: ParsedSource,
): Promise<LicenseLookupResult> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(resolveSync(parsed)), 220);
  });
}

function resolveSync(parsed: ParsedSource): LicenseLookupResult {
  if (parsed.kind === "doi") {
    return {
      outcome: "unsupported-format",
      reason: "M0는 arXiv 원문만 import한다. DOI 경로는 M1에서 Crossref·DOAJ 연동과 함께 추가된다.",
    };
  }

  const fixture = FIXTURES[parsed.bareId];
  if (!fixture) {
    return {
      outcome: "not-found",
      reason: `arXiv에서 ${parsed.bareId}를 찾을 수 없다. ID가 정확한지 확인한다.`,
    };
  }

  if (fixture.license === "CC-BY-ND" || fixture.license === "CC-BY-NC-ND") {
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
    registeredSlug: fixture.alreadyRegistered,
  };
}
