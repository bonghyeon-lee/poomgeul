# 개발 환경 셋업

![phase](https://img.shields.io/badge/phase-Pre--M0-lightgrey)

> **현재 상태: Bootstrap 완료.** monorepo 껍데기 · DB 스키마 · NestJS API(healthz) · Next.js 웹이 실제로 동작합니다. 비즈니스 로직 구현은 M0 킥오프부터 시작합니다.

---

## 기술 스택

- **Frontend:** Next.js 14 + TypeScript
- **Backend:** NestJS (TypeScript) — [ADR-0001](../architecture/decisions/0001-backend-framework.md)
- **ORM:** Drizzle ORM (`drizzle-orm/pg`) + `drizzle-kit`
- **DB:** PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16` 이미지)
- **Runtime:** Node.js 24 LTS (`.mise.toml`·`.nvmrc`에 고정)
- **Package Manager:** pnpm 10
- **Container:** Docker Compose

## 전제 요건

```bash
# 1) Node 24 + pnpm — mise 사용 권장
mise install              # .mise.toml을 읽어 Node 24.12.0 + pnpm latest 설치
mise trust                # 신규 프로젝트 진입 시 한 번

# 대안: fnm / nvm 사용자는 `.nvmrc`를 읽도록 셸에 hook 설정 후
#   corepack enable && corepack prepare pnpm@latest --activate

# 2) Docker Desktop (Postgres 컨테이너 실행)
docker --version
```

## 최초 부팅

```bash
# 1) 의존성 설치
pnpm install

# 2) .env 준비
cp .env.example .env
# 필요한 값은 일단 비워둬도 healthz·DB 마이그레이션은 동작

# 3) DB 컨테이너 기동 (호스트 5432 사용)
docker compose up -d postgres

# 4) 스키마 마이그레이션
pnpm --filter @poomgeul/db migrate

# 5) API + Web 개발 서버
pnpm dev          # api(3000) + web(3001) 동시 기동
```

성공 확인:
- `curl http://localhost:3000/healthz` → `{"status":"ok"}`
- `open http://localhost:3000/api/docs` (Swagger UI)
- `open http://localhost:3001` (Next 랜딩)

## 디렉터리 구조 (현재)

```
poomgeul/
├── apps/
│   ├── api/                 # NestJS (tsx watch, Jest)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── modules/health/
│   │   └── jest.config.ts
│   └── web/                 # Next.js 14
│       ├── next.config.mjs
│       └── src/app/{layout.tsx,page.tsx}
├── packages/
│   ├── db/                  # Drizzle schema + migrations
│   │   ├── src/{schema.ts,client.ts,index.ts}
│   │   ├── drizzle.config.ts
│   │   └── migrations/
│   └── types/               # OpenAPI codegen 수신 위치
├── prompts/
├── docs/
├── .env.example
├── .mise.toml               # node + pnpm 버전 고정
├── .nvmrc                   # 24.12.0
├── docker-compose.yml       # postgres (pgvector:pg16)
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## 루트 스크립트

```bash
pnpm dev         # apps/* 동시 실행 (api + web)
pnpm build       # 전 워크스페이스 빌드
pnpm typecheck   # 전 워크스페이스 tsc --noEmit
pnpm lint        # 각 워크스페이스 lint
pnpm test        # 각 워크스페이스 jest (--passWithNoTests)
```

## Drizzle 사용 규약

- **스키마 정본:** `packages/db/src/schema.ts` 한 파일. 모든 엔티티·enum·관계가 여기 모여있음.
- **마이그레이션 생성:**
  ```bash
  pnpm --filter @poomgeul/db generate   # 스키마 변경분 → migrations/NNNN_*.sql
  ```
- **마이그레이션 적용:**
  ```bash
  pnpm --filter @poomgeul/db migrate
  ```
- **데이터 이관이 필요한 변경:** 생성 SQL을 **수작업으로 편집**하여 DML(UPDATE/INSERT) 추가. PR 리뷰에서 수작업 편집 여부 확인.
- **Drizzle Studio(스키마 탐색 UI):** `pnpm --filter @poomgeul/db studio`
- **pgvector:** M2 TM 도입 전까지 컬럼은 placeholder 문자열로 선언(`tm_units.embedding`). KNN 인덱스·쿼리는 M2 마이그레이션에서 활성화.

## OpenAPI → TS codegen

- API는 `@nestjs/swagger`로 `/api/docs` (UI) + `/api/docs-json` (스펙) 노출.
- 프론트 타입 공유:
  ```bash
  # API가 떠 있는 상태에서
  pnpm --filter @poomgeul/types generate
  # packages/types/src/openapi.d.ts에 타입 생성
  ```
- 프론트(`apps/web`)는 이 공용 타입을 import. **수동 타입 작성 금지**.

## 환경 변수 (`.env.example`)

주요 항목:
- `DATABASE_URL` — `postgres://poomgeul:poomgeul@localhost:5432/poomgeul`
- `PORT` — API 포트 (기본 3000)
- `SESSION_SECRET` — 프로덕션 시 반드시 교체
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — M0 OAuth
- `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` — LLM cascade ([ADR-0002](../architecture/decisions/0002-llm-provider-abstraction.md))
- `LLM_PRIMARY_MODEL` / `LLM_BUDGET_MODEL` / `LLM_MID_MODEL` — 모델 식별자
- `ARXIV_USER_AGENT` / `CROSSREF_MAILTO` — 외부 API polite pool 식별

## 테스트

- **단위 테스트 (Jest):** 백엔드 서비스 레이어(Proposal 상태 머신, optimistic locking)에 우선.
- **통합 테스트:** 실제 PostgreSQL을 Docker로 띄워 사용. DB는 mock하지 않음 — Proposal 머지 플로우가 트랜잭션 본질이기 때문.
- **e2e (Supertest):** M0 수락 흐름(로그인 → import → 초벌 → 제안 → 머지 → 공개 URL). 현재는 템플릿만.

## 일반 트러블슈팅

- **`ECONNREFUSED 127.0.0.1:5432`** — Postgres 컨테이너가 아직 기동 중. `docker compose ps`로 `healthy` 확인. 호스트에 이미 다른 Postgres가 5432를 점유 중이면 그걸 끄거나 compose의 host 포트를 변경.
- **`mise WARN No version is set for shim: node`** — `mise trust` 한 번 실행.
- **Next.js eslint 피어 경고** — `eslint-config-next@14`가 eslint v9를 아직 공식 지원하지 않음. 당장은 경고 허용. Next 15 업그레이드 시 해소 예정.

## CI

`.github/workflows/ci.yml`에 GitHub Actions 파이프라인 구성됨. 2개 잡이 병렬로 돌아감.

### `quality` 잡
- 체크아웃 → pnpm + Node 24 (`.nvmrc` 자동 인식) → `pnpm install --frozen-lockfile`
- `pnpm -r run typecheck` — 4개 워크스페이스 tsc
- `pnpm -r --if-present run lint` — 현재 placeholder(no-op), 추후 eslint 설정 추가
- `pnpm -r --if-present run test` — apps/api는 jest(`--passWithNoTests`), web은 placeholder

### `migrate-and-smoke` 잡
- Postgres `pgvector/pgvector:pg16` 서비스 컨테이너 (5432)
- `pnpm --filter @poomgeul/db migrate` — 15개 테이블 실제 생성
- API 백그라운드 기동 → 30초 내 `/healthz` 200 대기
- `/api/docs-json` 200 검증

### 로컬에서 CI 재현

```bash
# 1) quality 잡과 동일
pnpm install --frozen-lockfile
pnpm -r run typecheck
pnpm -r --if-present run lint
pnpm -r --if-present run test

# 2) migrate-and-smoke 잡과 동일
docker compose up -d postgres
pnpm --filter @poomgeul/db migrate
pnpm --filter @poomgeul/api dev &
curl -fsS http://localhost:3000/healthz
curl -fsS http://localhost:3000/api/docs-json > /dev/null
```

### 알려진 TODO
- **Lint 미구성.** ADR-0001 스택(TS·NestJS·Next 14)에 맞춘 eslint + prettier 설정은 별도 PR에서 추가 예정. 현재는 CI 표면만 유지.
- **Web 테스트 프레임워크 미선택.** Playwright/RTL 중 M0 e2e 시나리오에 맞춰 도입.
- **Branch protection.** 이 두 잡을 main 브랜치 required check으로 지정하는 것은 저장소가 공개 전환될 때.

## 자주 찾게 될 참조

- [ADR-0001 백엔드 프레임워크](../architecture/decisions/0001-backend-framework.md)
- [ADR-0002 LLM 추상화](../architecture/decisions/0002-llm-provider-abstraction.md)
- [ADR-0003 optimistic locking](../architecture/decisions/0003-optimistic-locking.md)
- [data-model.md](../architecture/data-model.md)
- [llm-integration.md](llm-integration.md)
- [source-import.md](source-import.md)
