# 0001. 백엔드 프레임워크: NestJS + Drizzle (on Node.js 24 LTS)

- **Status:** Accepted
- **Date:** 2026-04-22 (created) · 2026-04-23 (확정 — NestJS + Drizzle)
- **Deciders:** @bonghyeon

## Context

M0부터 API Gateway가 필요하다. Proposal 상태 머신·라이선스 검증·LLM 호출 오케스트레이션을 담당한다. 기획서 §9.3은 "FastAPI 또는 NestJS — 팀 숙련도에 따라 확정"으로 열어두었다.

제약:
- 사이드 프로젝트 1~2인, 주 20h cap.
- 프론트엔드가 TypeScript(Next.js 14)이므로 stack 이분화 비용이 고려 대상.
- AI/ML·LLM 생태계 연동이 많음(프롬프트 엔지니어링, 토큰화, 임베딩, pgvector).

## Decision

**NestJS + Drizzle + pnpm + Node.js 24 LTS**로 확정.

### 핵심 결정
- **런타임:** Node.js **24 LTS**. 로컬 개발·CI·프로덕션 모두 24 LTS 고정. 재현성 확보.
- **프레임워크:** NestJS (TypeScript).
- **패키지 매니저:** pnpm. 향후 Turborepo/monorepo 전환 시 호환성 최상.
- **ORM / DB 접근:** **Drizzle ORM** (`drizzle-orm/pg`). 스키마를 TypeScript로 선언, 쿼리 빌더 타입 안전.
- **마이그레이션:** `drizzle-kit generate` + `drizzle-kit migrate`.
- **pgvector:** `drizzle-orm/pg`의 `vector` 커뮤니티 지원 + 필요 시 raw SQL. M2 TM 구현 시 활용.
- **API 스키마 공유:** `@nestjs/swagger`로 OpenAPI 생성 → 프론트에서 `openapi-typescript`로 TS 타입 codegen.
- **검증:** `class-validator` + `class-transformer` (NestJS 관례).
- **테스트:** Jest (NestJS 기본) + Supertest(e2e).

### 이 조합을 고른 이유

- **언어 통일.** 프론트가 이미 TS/Next.js 14이므로 백엔드까지 TS로 통일하면 타입·유틸리티를 공유하기 쉽고 컨텍스트 전환 비용이 준다.
- **Drizzle의 TS-first 설계.** 스키마가 곧 TypeScript 타입이므로 DTO/Entity 이중 정의가 사라지고, 쿼리 결과 타입이 자동 추론된다. Prisma 대비 **런타임 의존성(별도 엔진 바이너리) 없음**, 마이그레이션 편집 가능, SQL 근접.
- **NestJS의 구조화.** Proposal 상태 머신·라이선스 검증 엔진 등 도메인 서비스를 모듈 단위로 쪼개기에 적합. 1~2인 팀엔 과할 수 있다는 우려가 있지만, M1 공동 메인테이너 초대·M2 용어집 등 기능이 늘수록 구조적 분리의 이득이 커진다.
- **Node 24 LTS.** 2026년 활성 LTS. 사용자 로컬의 Node 25(Current)와 구분해 **LTS로 고정**하면 외부 기여자 재현성이 좋다.

## Alternatives considered

| 옵션 | 장점 | 탈락 이유 |
|---|---|---|
| **FastAPI (Python)** | ML 생태계 1급 시민, 학습 곡선 낮음, COMET·pgvector-python 성숙 | 프론트와 언어 이분화, 타입 공유에 OpenAPI→TS codegen 필요. 운영자가 TS 선호. |
| **NestJS + Prisma** | Prisma ecosystem 성숙, migrate UX 좋음 | Prisma는 별도 쿼리 엔진(Rust 바이너리) 배포·메모리 오버헤드. pgvector 지원이 `unsupported` 필드로 우회 필요. |
| **Hono + Drizzle (경량)** | 엣지 친화, 번들 작음 | NestJS가 제공하는 DI·가드·모듈 구조가 Proposal 도메인에 더 적합. 장기 기능 증가 고려. |
| **Litestar (Python)** | FastAPI 대안, 구조화 | 커뮤니티 아직 얇음 + Python 스택 이분화 문제 동일. |
| **tRPC** | 스키마 공유 최강 | NestJS와 결이 달라 공존 어색. OpenAPI 경로가 더 자연스러움. |

## Consequences

### 긍정
- **단일 언어 생태계.** Turborepo/pnpm workspace로 monorepo 전환 직결. 공용 패키지(예: `packages/types`)에 도메인 타입 정의 공유 가능.
- **Drizzle 스키마 = 타입.** `TranslationSegment.version` 같은 optimistic locking 컬럼이 타입 수준에서 강제됨. DTO↔Entity 이중 정의가 줄어든다.
- **배포 단순성.** Prisma 엔진 같은 사이드카가 없어 Docker 이미지 작아지고 cold start 빠름.
- **Drizzle + raw SQL 혼용 용이.** pgvector KNN 쿼리는 raw SQL로 쓰되, 주변 로직은 타입 안전 쿼리 빌더로. M2 TM 구현이 자연스러움.

### 부정
- **ML/LLM 라이브러리는 Node SDK 기반.** `@anthropic-ai/sdk`·`@google/genai`는 성숙하지만, 토큰화·BLEU·COMET 같은 평가 유틸은 Python 대비 부족. → PoC처럼 평가 단계만 별도 Python 스크립트로 운용 허용(저장소 밖 `poc_workspace` 패턴 재사용).
- **NestJS의 DI·데코레이터 복잡성.** 과도한 모듈 분리를 피하기 위해 M0는 최소 3~4개 모듈(`auth`, `source`, `translation`, `proposal`)만 운영.
- **Drizzle 마이그레이션 자동 생성의 한계.** `drizzle-kit`는 스키마 diff → SQL 생성이지만, 데이터 이관이 필요한 변경은 수작업 SQL 병행. 데이터 모델 변경 시 PR 리뷰에서 필수 체크.

### 뒤집기 비용
서비스 레이어를 얇게 유지하고 API 스키마를 OpenAPI로 관리하면, 프레임워크 교체는 ~2주 수준. 다만 Drizzle 스키마 파일(`packages/db/schema.ts`)이 깊숙이 쓰이면 교체 비용이 오름. **M1 착수 전까지는 교체 여지를 닫지 않게** DB 스키마를 `schema.ts` 한 파일에 집약할 것.

## 디렉터리 규약 (결정)

```
apps/
├── api/                     # NestJS 앱
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── modules/
│   │       ├── auth/        # GitHub OAuth, 세션
│   │       ├── source/      # 원문 import, 라이선스 검증
│   │       ├── translation/ # 번역본, 세그먼트, revision
│   │       └── proposal/    # Proposal 상태 머신
│   ├── test/                # Jest + Supertest e2e
│   └── package.json
├── web/                     # Next.js 15 + React 19
└── ...
packages/
├── db/                      # Drizzle schema + migrations (공용)
│   ├── schema.ts
│   ├── migrations/
│   └── package.json
└── types/                   # OpenAPI 생성 타입 + 공용 enum
```

## 후기 (2026-04-23)

본 ADR을 확정할 당시에는 프론트엔드가 Next.js 14였다. 이후 같은 날 Next.js 15.5 LTS + React 19로 업그레이드되어 현재 `apps/web`은 Next 15 기준이다. 본 결정(NestJS + Drizzle + Node 24 LTS)은 프론트 메이저 버전과 독립적으로 유효하다.

## 관련

- [guides/dev-setup.md](../../guides/dev-setup.md) — 실제 실행 명령
- [architecture/system-overview.md](../system-overview.md) — 컴포넌트 다이어그램
- [architecture/data-model.md](../data-model.md) — 엔티티 스키마
