# poomgeul (품글)

> 공개 텍스트를 위한 오픈소스 번역 플랫폼 — 원문은 위키처럼, 번역본은 깃허브처럼

![status](https://img.shields.io/badge/status-Pre--M0-lightgrey)
![phase](https://img.shields.io/badge/phase-Phase%200-blue)
![license](https://img.shields.io/badge/license-AGPL--3.0-brightgreen)
![lang](https://img.shields.io/badge/Phase%201-en%E2%86%92ko-orange)

**poomgeul**은 arXiv 논문·오픈 라이선스 문학·기술문서처럼 **합법적으로 공개된 텍스트**를 대상으로, AI 초벌 번역과 커뮤니티 교열을 결합한 오픈소스 번역 허브입니다. 원문은 위키처럼 하나의 버전으로 수렴하고, 번역본은 GitHub처럼 여러 버전이 동등하게 공존합니다.

- **Phase 1 타겟:** 영어 arXiv CC BY 논문 → 한국어
- **핵심 워크플로우:** AI 초벌(세그먼트 단위) → 리드 메인테이너 편집 → 누구나 제안(Proposal) → 승인/거절/머지
- **기술 스택:** Next.js 14 + TypeScript / NestJS (Node 24 LTS) / Drizzle ORM / PostgreSQL 16 + pgvector / Gemini 2.5 Flash 메인 + Claude Haiku·Sonnet cascade

## 지금 상태

**Pre-M0 · Bootstrap 완료.** 실 비즈니스 로직은 아직 없지만, monorepo 스켈레톤·Drizzle 스키마 15개 테이블 마이그레이션·NestJS API(healthz)·Next.js 웹이 모두 **실제로 동작**합니다.

```bash
pnpm install && cp .env.example .env && docker compose up -d postgres
pnpm --filter @poomgeul/db migrate
pnpm dev   # api:3000 + web:3001
```

자세한 절차는 [docs/guides/dev-setup.md](docs/guides/dev-setup.md). 진행 로드맵은 [docs/overview/roadmap.md](docs/overview/roadmap.md).

## 빠른 네비게이션

| 목적 | 시작 지점 |
|---|---|
| 프로젝트 이해 | [docs/overview/vision.md](docs/overview/vision.md) |
| 로드맵 / 현재 Phase | [docs/overview/roadmap.md](docs/overview/roadmap.md) |
| 기술 설계 | [docs/architecture/system-overview.md](docs/architecture/system-overview.md) |
| M0 기능 명세 | [docs/specs/m0-mvp.md](docs/specs/m0-mvp.md) |
| 전체 문서 인덱스 | [docs/README.md](docs/README.md) |

## 라이선스

코어는 **AGPL-3.0**. 향후 공개될 SDK/클라이언트 라이브러리는 별도로 Apache-2.0 예정입니다. 상세: [LICENSE](LICENSE).

## 기여

- **코드 기여:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **번역 기여:** 플랫폼 자체의 Proposal 워크플로우를 통해 이뤄집니다([docs/architecture/workflow-proposal.md](docs/architecture/workflow-proposal.md)). 코드 기여와 다릅니다.
- **행동 강령:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 관련 문서

원본 제품 기획서·스코프 결정·PoC 워크스페이스는 별도 경로에서 관리됩니다. [docs/research/links.md](docs/research/links.md)를 참조하세요.
