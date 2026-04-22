# poomgeul에 기여하기

poomgeul은 두 가지 종류의 기여를 구분합니다.

| 기여 유형 | 어디서? | 절차 |
|---|---|---|
| **코드·문서 기여** | 이 저장소 | 아래 절차 |
| **번역 기여** | poomgeul 플랫폼 자체 | 플랫폼 UI의 "제안(Proposal)" 버튼 → [Proposal 워크플로우](docs/architecture/workflow-proposal.md) |

번역 기여는 저장소 PR이 아니라 플랫폼의 Proposal 워크플로우로 들어옵니다. 이 문서는 **코드·문서 기여자**용입니다.

---

## 시작하기 전에

1. [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)를 읽습니다.
2. 현재 Phase([docs/overview/roadmap.md](docs/overview/roadmap.md))를 확인합니다. 활성화되지 않은 Phase의 기능 PR은 보류될 수 있습니다.
3. 큰 변경은 먼저 이슈를 열어 논의하세요.

## 개발 환경

> **현재 Pre-M0입니다.** 실행 가능한 개발 환경은 아직 구성되지 않았습니다. 구성 이후에는 [docs/guides/dev-setup.md](docs/guides/dev-setup.md)가 최신 지침을 유지합니다.

## PR 가이드

- **한 PR = 한 관심사.** 리팩토링과 기능 추가를 섞지 않습니다.
- **커밋 메시지:** 명령형 현재시제, 한국어/영어 모두 허용. 예: `feat: Proposal 상태 머신 초안 추가`
- **작성 언어:** 코드 주석·커밋·PR 설명은 한국어를 기본으로 하되, 퍼블릭 API·문서화된 용어는 영어 병기 허용.
- **테스트:** 변경이 코드에 있다면 테스트를 포함합니다. 문서만 바꾸는 PR은 예외.

## 브랜치 / 릴리스

- `main`: 현재 개발 라인.
- Phase 단위 마일스톤(`m0`, `m1`, `m2`)으로 릴리스를 구분합니다. 자세한 변경 이력은 [CHANGELOG.md](CHANGELOG.md).

## 라이선스 동의

PR을 여는 것은 본인의 기여가 [LICENSE](LICENSE)(AGPL-3.0) 조건으로 배포됨에 동의하는 것으로 간주됩니다. 별도 CLA는 현재 운영하지 않습니다.

## 이슈 템플릿

[.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE)의 카테고리를 사용해주세요.
- **Bug report** — 재현 가능한 버그
- **Feature request** — 기능 제안
- **Translation policy** — 저작권·라이선스·ToS 관련 이슈 (빠른 대응 대상)
