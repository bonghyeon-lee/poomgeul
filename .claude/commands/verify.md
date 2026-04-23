---
description: pre-push 훅과 동일한 로컬 게이트(typecheck · format · lint · 유닛 테스트)를 순차 실행합니다. 실패 시 원인을 분석해 수정 제안. 사용법 `/verify` 또는 `/verify full`(integration/e2e 포함).
---

poomgeul의 품질 게이트를 로컬에서 그대로 재현합니다. `$ARGUMENTS`에 `full`이 오면 `api integration/e2e`·`web playwright`까지 확장.

## 실행 파이프라인

### 기본 (fast) — `.husky/pre-push`와 동일 구성, 약 10–15초

```bash
pnpm -r run typecheck
pnpm format:check
pnpm lint
pnpm --filter @poomgeul/api run test:unit
pnpm --filter @poomgeul/web run test
```

### 확장 (`/verify full`) — CI의 `db migrate · api smoke`, `web e2e` job과 동등

CI와 동일한 로컬 DB가 필요합니다(`docker compose` 기준 postgres + pgvector). `DATABASE_URL`, `TEST_DATABASE_URL`이 설정돼 있는지 먼저 확인.

```bash
# DB 준비 (이미 떠 있다고 가정 — 없으면 사용자에게 안내)
pnpm --filter @poomgeul/db migrate

# API 통합/e2e
pnpm --filter @poomgeul/api run test:integration
pnpm --filter @poomgeul/api run test:e2e

# Swagger 스모크 재현 (main.ts 주석 참조 — tsx 경로는 Swagger 비활성이라 compiled 경로를 씀)
pnpm --filter @poomgeul/api run build
PORT=3100 pnpm --filter @poomgeul/api start &
API_PID=$!
for i in $(seq 1 30); do curl -fsS http://localhost:3100/healthz > /dev/null && break; sleep 1; done
curl -o /dev/null -s -w "docs-json: %{http_code}\n" http://localhost:3100/api/docs-json
kill "$API_PID" 2>/dev/null || true

# Web Playwright
pnpm --filter @poomgeul/web run test:e2e
```

> 포트는 3100으로 고정 — CI는 3000이지만 로컬은 `pnpm dev`가 차지할 수 있어 충돌 회피.

## 실패 단계별 분석 가이드

각 단계는 **이 레포에서 실제로 관찰된 실패 패턴**을 우선 점검합니다.

### 1) `typecheck` 실패

- `Cannot find module '@poomgeul/db' or its corresponding type declarations` → `packages/db/dist/`가 없다는 뜻. `pnpm install`로 `postinstall`을 다시 트리거하거나 `pnpm --filter @poomgeul/db build`를 직접 실행. **소스 수정이 아님**.
- `Parameter 'tx'/'r'/'s' implicitly has an 'any' type`이 **`@poomgeul/db` 에러와 함께** 뜨면 루트 원인은 1번과 같음(any로 추론됨). db 빌드로 선결 후 재실행.
- 진짜 any 타입 누락인 경우에만 signature를 채워 넣음. `any` 박아 넣어 무시하지 않음.

### 2) `format:check` 실패

- 곧장 `pnpm format` 실행해 일괄 수정(의미 변화 없는 포맷만). 그 뒤 재실행해 통과 확인.
- 의심스러우면 `git diff`로 포맷 변경이 의미 변경을 포함하지 않았는지 확인 — 극히 드문 케이스.

### 3) `lint` 실패

- `pnpm lint:fix`로 자동 수정 가능한 것 선처리. 남은 것만 규칙 이름 기준으로 손으로 고침.
- `eslint-disable` 추가는 최후 수단. 우선 패턴을 규칙에 맞도록 리팩터.

### 4) 유닛 테스트 실패

- **api (Jest, ESM)**: 스냅샷·외부 네트워크·환경변수 기대값. 실제 코드 vs 테스트 기대값 어느 쪽이 틀렸는지 먼저 구분.
- **web (Vitest + RTL, jsdom)**: 최근에 UI 카피가 바뀐 뒤 매처가 남아있는 패턴이 반복됐음(예: landing h1 "함께 번역한다" → "함께 번역합니다"). 카피 변경이 있다면 `page.test.tsx`와 `e2e/*.spec.ts`를 먼저 훑음.

### 5) (full) integration/e2e 실패

- `poomgeul_test` DB 존재·마이그레이션 적용 여부 확인. `withRollback` 헬퍼는 테스트별 트랜잭션 롤백 기준이므로 fixture 잔류물 의심은 적음.
- API e2e는 Nest `INestApplication` + supertest. CORS/validation pipe의 `forbidNonWhitelisted` 영향 확인.

### 6) (full) Swagger 404 / 스모크 실패

- `pnpm dev`(tsx)로 띄운 API는 **의도적으로 Swagger가 꺼집니다** (`apps/api/src/main.ts` 주석 참조). 스모크는 반드시 `build` → `start` 경로로 검증.
- `/healthz`는 200인데 `/api/docs-json`만 404라면 Swagger 등록이 try/catch에 삼켜진 것. stdout에 `[api] Swagger document generation skipped` 경고가 있는지 확인.

## 수정 원칙

1. **에러 메시지를 그대로 읽고 가장 앞에 터진 것부터**. 뒷쪽 에러는 앞쪽 에러의 연쇄인 경우가 많음(특히 typecheck).
2. **무시 플래그 금지**: `@ts-ignore`/`eslint-disable`/`as any`는 쓰지 않음. 실제 타입/규칙에 맞도록 수정.
3. **수정 범위는 최소**. 실패를 고치러 들어갔다가 주변을 리팩터하지 않음.
4. 수정 후 **같은 단계를 재실행해 통과** 확인, 그 뒤 전체 파이프라인 재실행.

## 완료 보고

```
[1/5] typecheck       ✓ / ✗ (요약)
[2/5] format:check    ✓ / ✗
[3/5] lint            ✓ / ✗
[4/5] api unit        ✓ / ✗ (N passed / M failed)
[5/5] web unit        ✓ / ✗ (N passed / M failed)
```

`full`이면 6–9단계(integration · api e2e · smoke · web e2e) 추가.

수정한 파일이 있으면 변경 요약을 한 단락으로 보고하고, `git status --short`와 diff 핵심만 출력.
