# 개발 환경 셋업

![phase](https://img.shields.io/badge/phase-Pre--M0-lightgrey)

> **현재 상태: Bootstrap 완료.** monorepo 껍데기 · DB 스키마 · NestJS API(healthz) · Next.js 웹이 실제로 동작합니다. 비즈니스 로직 구현은 M0 킥오프부터 시작합니다.

---

## 기술 스택

- **Frontend:** Next.js 15.5 LTS + React 19 + TypeScript
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
- `curl "http://localhost:3000/api/sources/license?input=2310.12345"` → `outcome:"allowed"` 등 discriminated union
- `open http://localhost:3001` (Next 랜딩)
- `open http://localhost:3001/import` → 실제 `/api/*` 호출 (web의 next rewrite가 `:3000`으로 프록시)
- `open http://localhost:3000/api/docs` (Swagger UI) — **주의**: `pnpm dev`는 tsx를 써서 decorator metadata를 emit하지 않아 Swagger 문서 생성이 실패할 수 있다. 그 경우 콘솔에 경고만 찍고 서버는 정상 동작. Swagger UI가 필요하면 `pnpm --filter @poomgeul/api build && node apps/api/dist/main.js`로 띄운다.

라우팅 규약: 도메인 라우트는 모두 `/api/*` 프리픽스를 받는다(예: `/api/sources/license`). 운영/프로브용 `/healthz`만 프리픽스 바깥이다. 웹 `/api/*` rewrite도 이 경계를 그대로 통과시킨다.

## 디렉터리 구조 (현재)

```
poomgeul/
├── apps/
│   ├── api/                 # NestJS (tsx watch, Jest)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── modules/health/
│   │   ├── tsconfig.json         # solution: build + test references
│   │   ├── tsconfig.build.json   # 프로덕션 빌드 (spec 제외)
│   │   ├── tsconfig.test.json    # spec / e2e 포함, jest 타입
│   │   └── jest.config.cjs
│   └── web/                 # Next.js 15 + React 19
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
pnpm dev           # apps/* 동시 실행 (api + web)
pnpm build         # 전 워크스페이스 빌드
pnpm typecheck     # 전 워크스페이스 tsc --noEmit
pnpm lint          # 루트 ESLint flat config로 전체 검사
pnpm lint:fix      # 같은 내용을 --fix 적용
pnpm format        # Prettier --write .
pnpm format:check  # Prettier --check . (CI에서 사용)
pnpm test          # 각 워크스페이스 jest (--passWithNoTests) / web은 placeholder
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
- **dev에서는 tsx 제약으로 Swagger 문서 생성이 실패**한다(경고 후 스킵). codegen은 빌드된 번들로 띄운 뒤 실행한다:
  ```bash
  pnpm --filter @poomgeul/api build
  node apps/api/dist/main.js &            # :3000에서 docs 포함 부팅
  pnpm --filter @poomgeul/types generate  # packages/types/src/openapi.d.ts 생성
  kill %1                                 # API 종료
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

세부 규약과 전략은 [testing.md](testing.md) 참조. 요약:

**API (`apps/api`, Jest)**
- **Unit** (`src/**/*.spec.ts`) — 외부 의존 없음, `pnpm --filter @poomgeul/api run test:unit`로 watch TDD.
- **Integration** (`test/integration/**/*.int-spec.ts`) — 실제 Postgres `poomgeul_test` DB 사용. `withRollback` 헬퍼로 각 it이 트랜잭션을 롤백. 격리가 필요한 suite는 Testcontainers(`startIsolatedContainer`).
- **E2E** (`test/**/*.e2e-spec.ts`) — NestApplication + supertest.

**Web (`apps/web`)**
- **Unit/Component** (`src/**/*.test.{ts,tsx}`) — Vitest + RTL + jsdom. `pnpm --filter @poomgeul/web run test:watch`로 TDD 루프.
- **E2E 브라우저** (`e2e/**/*.spec.ts`) — Playwright (chromium). `pnpm --filter @poomgeul/web run test:e2e`가 Next dev 서버를 자동 기동·종료.

## 일반 트러블슈팅

- **`ECONNREFUSED 127.0.0.1:5432`** — Postgres 컨테이너가 아직 기동 중. `docker compose ps`로 `healthy` 확인. 호스트에 이미 다른 Postgres가 5432를 점유 중이면 그걸 끄거나 compose의 host 포트를 변경.
- **`mise WARN No version is set for shim: node`** — `mise trust` 한 번 실행.
- **docker compose 포트 미노출** — `docker compose ps`에 `0.0.0.0:5432->5432/tcp` 매핑이 안 보이면 `docker compose down && docker compose up -d postgres`로 재생성.
- **VS Code에서 `*.spec.ts`가 `Cannot find name 'describe'`** — TS Server가 다른 프로젝트를 골랐을 가능성. `apps/api/tsconfig.json`은 solution(빌드 + 테스트 두 reference)으로 구성되어 있으므로, 명령 팔레트 → "TypeScript: Restart TS server" 실행. 그래도 안 되면 동일 명령에서 "Select TypeScript Version" → workspace 버전 선택.

## CI

`.github/workflows/ci.yml`에 GitHub Actions 파이프라인 구성됨. 2개 잡이 병렬로 돌아감.

### `quality` 잡
- 체크아웃 → pnpm + Node 24 (`.nvmrc` 자동 인식) → `pnpm install --frozen-lockfile`
- `pnpm -r run typecheck` — 4개 워크스페이스 tsc
- `pnpm lint` — 루트 ESLint flat config(`eslint.config.mjs`), typescript-eslint + Next 플러그인 + Prettier 호환
- `pnpm format:check` — Prettier (마크다운은 현재 ignore 목록)
- `pnpm --filter @poomgeul/api run test:unit` — 빠른 단위 테스트 (DB 없음)

### `migrate-and-smoke` 잡
- Postgres `pgvector/pgvector:pg16` 서비스 컨테이너 (5432)
- app DB(`poomgeul`)와 test DB(`poomgeul_test`)를 모두 migrate
- `pnpm --filter @poomgeul/api run test:integration` — 실제 DB에 대해 withRollback 경로 검증
- `pnpm --filter @poomgeul/api run test:e2e` — NestApplication + supertest
- API 백그라운드 기동 → 30초 내 `/healthz` 200 대기
- `/api/docs-json` 200 검증

### `web-e2e` 잡
- Playwright (chromium) 기반 브라우저 E2E
- `actions/cache`로 `~/.cache/ms-playwright` 브라우저 바이너리 캐시 (다운로드 ~100MB 절약)
- `pnpm --filter @poomgeul/web run test:e2e` — `playwright.config.ts`의 `webServer`가 `pnpm dev`를 자동 기동·종료
- 실패 시 `apps/web/playwright-report/`를 artifact로 업로드 (14일 보관)

### 로컬에서 CI 재현

```bash
# 1) quality 잡과 동일
pnpm install --frozen-lockfile
pnpm -r run typecheck
pnpm lint
pnpm format:check
pnpm -r --if-present run test

# 2) migrate-and-smoke 잡과 동일
docker compose up -d postgres
pnpm --filter @poomgeul/db migrate
pnpm --filter @poomgeul/api dev &
curl -fsS http://localhost:3000/healthz
curl -fsS http://localhost:3000/api/docs-json > /dev/null
```

### 코드 스타일 — ESLint + Prettier

- **ESLint**: 루트 `eslint.config.mjs` (flat config, typescript-eslint v8).
  - `apps/web/**`에 `@next/eslint-plugin-next`의 recommended + core-web-vitals 규칙 배선. `settings.next.rootDir="apps/web/"`로 모노레포 경로 명시.
  - 포매팅 규칙은 `eslint-config-prettier`로 전부 off — Prettier와 충돌 없음.
  - `pnpm lint` / `pnpm lint:fix` 로 전체 실행.
- **Prettier**: 루트 `prettier.config.mjs` (printWidth 100, semi true, doubleQuote, trailing comma all).
  - `pnpm format:check` / `pnpm format` 으로 전체 실행.
  - 마크다운은 현재 `.prettierignore`에 포함 — 표·ASCII 다이어그램이 많아 자동 포맷이 붕괴 위험.
- **에디터 자동 포매팅**: `.editorconfig`가 LF·UTF-8·2-space를 선언. VS Code/Cursor는 "Format on Save" + Prettier 확장 권장.

### 알려진 TODO
- **Branch protection.** 이 세 잡을 main 브랜치 required check으로 지정하는 것은 저장소가 공개 전환될 때.
- **마크다운 포매팅.** docs 파이프라인(Vale·markdownlint 등) 도입 시점에 Prettier 포함 재검토.
- **Playwright 멀티 브라우저.** 현재 chromium만. 실제 크로스 브라우저 이슈가 보고되면 WebKit/Firefox 추가.

## 자주 찾게 될 참조

- [ADR-0001 백엔드 프레임워크](../architecture/decisions/0001-backend-framework.md)
- [ADR-0002 LLM 추상화](../architecture/decisions/0002-llm-provider-abstraction.md)
- [ADR-0003 optimistic locking](../architecture/decisions/0003-optimistic-locking.md)
- [testing.md](testing.md) — TDD 레이어·DB 격리 전략
- [data-model.md](../architecture/data-model.md)
- [llm-integration.md](llm-integration.md)
- [source-import.md](source-import.md)
