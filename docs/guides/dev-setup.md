# 개발 환경 셋업

![phase](https://img.shields.io/badge/phase-Pre--M0-lightgrey)

> **현재 상태: Pre-M0.** 실행 가능한 코드는 아직 저장소에 포함되어 있지 않지만, 스택은 확정되었습니다 ([ADR-0001](../architecture/decisions/0001-backend-framework.md)). 이 문서는 코드가 유입될 때 **가장 먼저 업데이트되는** 지점이며, 지금은 **타깃 구성**을 고정합니다.

---

## 기술 스택

- **Frontend:** Next.js 14 + TypeScript · shadcn/ui · TanStack Query
- **Backend:** **NestJS** (TypeScript) — [ADR-0001](../architecture/decisions/0001-backend-framework.md)
- **ORM:** **Drizzle ORM** (`drizzle-orm/pg`) + `drizzle-kit` 마이그레이션
- **DB:** PostgreSQL 16 + pgvector
- **Runtime:** **Node.js 24 LTS** (로컬·CI·프로덕션 고정)
- **Package Manager:** **pnpm**
- **Container:** Docker Compose

## 디렉터리 구조 (타깃)

```
poomgeul/
├── apps/
│   ├── web/                  # Next.js 14
│   └── api/                  # NestJS
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   └── modules/{auth,source,translation,proposal}
│       └── test/             # Jest + Supertest
├── packages/
│   ├── db/                   # Drizzle schema + migrations
│   │   ├── schema.ts
│   │   └── migrations/
│   └── types/                # OpenAPI 생성 타입 공유
├── prompts/                  # 이미 존재
├── docs/                     # 이미 존재
├── docker-compose.yml        # postgres + api + web
├── .env.example
├── pnpm-workspace.yaml
├── .nvmrc                    # 24
└── package.json
```

## 전제 요건

```bash
# Node 24 LTS — mise / fnm / nvm 중 하나 사용 권장
mise use -g node@24         # mise 사용 시
# 또는
fnm install 24 && fnm use 24

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Docker Desktop (Postgres 컨테이너 실행용)
```

저장소 루트 `.nvmrc`에 `24`가 있으므로 `nvm`/`fnm`/`mise` 자동 스위칭 지원.

## 환경 변수 (`.env.example`)

### 데이터베이스
- `DATABASE_URL` — 예: `postgres://poomgeul:poomgeul@localhost:5432/poomgeul`

### 인증
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

### LLM (OpenRouter + 직접 경로)
- `GEMINI_API_KEY` — 기본 경로 (Free tier 메인, [ADR-0002](../architecture/decisions/0002-llm-provider-abstraction.md))
- `ANTHROPIC_API_KEY` — Budget 폴백 + Mid escalation
- `OPENROUTER_API_KEY` — 선택적 통합 라우팅
- `LLM_PRIMARY_MODEL` — 기본 `google/gemini-2.5-flash`
- `LLM_BUDGET_MODEL` — 기본 `anthropic/claude-haiku-4-5-20251001`
- `LLM_MID_MODEL` — 기본 `anthropic/claude-sonnet-4-6`

### 외부 메타데이터
- `ARXIV_USER_AGENT` — arXiv API polite pool 식별
- `CROSSREF_MAILTO` — Crossref polite pool 등록용

### 관측
- `SENTRY_DSN` (선택)
- `LOG_LEVEL` — 기본 `info`

## 로컬 실행 (타깃 명령)

```bash
# 1. 저장소 클론 & .env
cp .env.example .env
# ... .env 값 채우기

# 2. 의존성 설치
pnpm install

# 3. DB 컨테이너 부팅
docker compose up -d postgres

# 4. 스키마 마이그레이션
pnpm --filter @poomgeul/db migrate

# 5. 시드 (CC BY arXiv 논문 1~3편 import)
pnpm --filter api seed

# 6. 개발 서버 (api + web 동시)
pnpm dev
```

> 실제 명령은 코드 유입 시점에 반영됩니다. 위는 **타깃 규약**입니다.

## Drizzle 사용 규약

- **스키마 정본:** `packages/db/schema.ts` 한 파일.
- **마이그레이션 생성:** `pnpm --filter @poomgeul/db generate` → `packages/db/migrations/NNNN_*.sql` 생성.
- **마이그레이션 적용:** `pnpm --filter @poomgeul/db migrate`.
- **데이터 이관이 필요한 변경:** 생성된 SQL을 **수작업으로 편집**해 DML 포함. 자동 diff가 덮어쓸 수 있으니 PR 리뷰에서 수작업 편집 여부 필수 확인.
- **pgvector:** 커뮤니티 확장(`drizzle-orm/pg` `vector` 타입) 사용. M2 TM 도입 전까지 컬럼만 pre-design.

## OpenAPI → TS codegen

- API가 `@nestjs/swagger`로 `/api/docs/openapi.json` 노출.
- `packages/types/` 안의 스크립트가 `openapi-typescript`를 돌려 공유 타입 파일 생성.
- 프론트(`apps/web`)는 이 공용 타입을 import. 수동 타입 작성 금지.

## 테스트

- **단위 테스트 (Jest):** 백엔드 서비스 레이어(Proposal 상태 머신, optimistic locking)에 우선.
- **통합 테스트:** 실제 PostgreSQL + pgvector를 Docker로 띄워 사용. DB는 mock하지 않음 — Proposal 머지 플로우가 트랜잭션 본질이기 때문.
- **e2e (Supertest):** M0 수락 흐름(로그인 → import → 초벌 → 제안 → 머지 → 공개 URL).

## CI (타깃)

- `.github/workflows/ci.yml` — 코드 유입 시 생성.
- 필수 체크: `pnpm typecheck`, `pnpm lint`, `pnpm test`, e2e 스모크.
- Node 매트릭스는 LTS 24 단일. 호환성 확장은 필요 시점에 결정.

## 자주 찾게 될 참조

- [ADR-0001 백엔드 프레임워크](../architecture/decisions/0001-backend-framework.md)
- [ADR-0002 LLM 추상화](../architecture/decisions/0002-llm-provider-abstraction.md)
- [ADR-0003 optimistic locking](../architecture/decisions/0003-optimistic-locking.md)
- [llm-integration.md](llm-integration.md)
- [source-import.md](source-import.md)
- [data-model.md](../architecture/data-model.md)
