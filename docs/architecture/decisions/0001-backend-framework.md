# 0001. 백엔드 프레임워크: FastAPI vs NestJS

- **Status:** Proposed
- **Date:** 2026-04-22
- **Deciders:** @bonghyeon

## Context

M0부터 API Gateway가 필요하다. Proposal 상태 머신·라이선스 검증·LLM 호출 오케스트레이션을 담당한다. 기획서 §9.3은 "FastAPI 또는 NestJS — 팀 숙련도에 따라 확정"으로 열어두었다.

제약:
- 사이드 프로젝트 1~2인, 주 20h cap.
- AI/ML·LLM 생태계 연동이 많음(프롬프트 엔지니어링, 토큰화, 임베딩, pgvector).
- 프론트엔드가 TypeScript(Next.js 14)이므로 stack 이분화 비용이 고려 대상.

## Decision

**미결(Proposed).** PoC 결과와 운영자 숙련도 프로파일링 이후 확정. 잠정적으로 **FastAPI** 선호.

### 잠정 선호 이유
- LLM·ML 생태계(tokenizer, unbabel-comet 등)의 1차 언어가 Python.
- pgvector SQLAlchemy 드라이버가 성숙.
- 타입 안전성은 pydantic + mypy로 충분.

## Alternatives considered

| 옵션 | 장점 | 단점 |
|---|---|---|
| **FastAPI (Python)** | ML 생태계 활용, 단순, 배우기 쉬움, 빠른 prototyping | TypeScript와 스택 이분화, ESM/ts 프론트와 타입 공유 어려움 |
| **NestJS (Node.js)** | 프론트와 언어 통일, 공유 타입(OpenAPI·tRPC), 엔터프라이즈 구조 | LLM/임베딩 라이브러리 성숙도 아쉬움, DI 복잡성이 1-2인 팀에 과함 |
| **Hono + Drizzle (Node.js)** | 경량, Edge 친화 | 생태계 얇음, SSR-like 워크로드엔 overkill |
| **Python + Litestar** | FastAPI 대안, 구조화 | 커뮤니티 규모 아직 작음 |

## Consequences

### 만약 FastAPI로 확정 시
- **+** pgvector·COMET·tokenizer 연동 비용 최소화.
- **+** Schema-first OpenAPI → 프론트 타입 생성 가능(openapi-typescript 등).
- **−** TypeScript-Python 중복 타입 정의가 생김. pydantic → TS 생성기로 완화.
- **−** 두 언어 런타임 Docker 이미지 유지.

### 만약 NestJS로 확정 시
- **+** 단일 언어 생태계. Turborepo·pnpm workspace 즉시 활용.
- **−** LLM 호출 체인(prompt templating, retries, cost 계측)은 Node SDK로 직접 구현해야 함.
- **−** pgvector 통합은 Drizzle/TypeORM에서 추가 공수.

### 뒤집기 비용
API 스키마를 OpenAPI로 관리하고 핵심 로직을 얇은 서비스 레이어에 가두면, 백엔드 프레임워크 교체 비용은 ~1~2주 수준. 단, DB 마이그레이션 도구(Alembic vs TypeORM Migrations)가 달라 DB 스키마 history가 분기되므로 "초기에 확정"이 유리.

## 결정 기한

**Phase 0 종료 전**(2026 Q2 말)까지 확정. PoC 완료 시점에 맞춰 결정하고 이 ADR을 `Accepted` 또는 `Superseded by`로 갱신한다.
