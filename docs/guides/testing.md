# Testing

![phase](https://img.shields.io/badge/phase-all-blue)

poomgeul의 테스트 규약과 실행 방법. TDD(Red-Green-Refactor)를 실제로 돌릴 수 있도록 레이어·도구·명령을 고정합니다.

---

## 원칙

1. **실제 Postgres 사용.** 통합 테스트에서 DB를 mock하지 않는다. 기획서·dev-setup 공통 원칙 — Proposal 머지/optimistic locking이 트랜잭션 본질이기 때문.
2. **느린 테스트는 전용 레이어.** 단위 테스트가 수 초 안에 돌아야 TDD 리듬이 유지된다.
3. **테스트 간 격리.** 공유 DB를 쓸 땐 `withRollback`, 격리가 필요하면 `startIsolatedContainer`.
4. **Assertion > 커버리지.** 커버리지 숫자는 지표일 뿐. 테스트 이름·AAA 구조·의도가 명확한 게 우선.

## 레이어와 네이밍

| 레이어 | 위치 | 파일명 규약 | 러너 |
|---|---|---|---|
| **Unit** | `apps/api/src/**` | `*.spec.ts` | Jest |
| **Integration** | `apps/api/test/integration/**` | `*.int-spec.ts` | Jest + 실제 Postgres |
| **E2E** | `apps/api/test/**` | `*.e2e-spec.ts` | Jest + NestApplication + supertest |

### 각 레이어가 하는 일

- **Unit** — 순수 함수, 서비스 클래스 단위, Nest `TestingModule`로 DI만 확인. DB·HTTP·LLM 호출 없음.
- **Integration** — 실제 Drizzle + Postgres에 대고 쿼리·트랜잭션 경로 검증. `TEST_DATABASE_URL`을 가리키는 `poomgeul_test` DB 사용.
- **E2E** — `NestFactory`로 앱 부팅, supertest로 HTTP 경로를 끝까지 검증. Proposal 머지 같은 end-to-end 시나리오.

## 테스트 설명 스타일 (AAA)

```ts
it("rolls back when the proposal base version does not match", async () => {
  // Arrange
  const { translation, segment } = await seedScenario(db);
  await db.update(translationSegments).set({ version: 5 }).where(...);

  // Act
  const response = await api.post(`/proposals/${p.id}/approve`);

  // Assert
  expect(response.status).toBe(409);
  const fresh = await db.query.translationSegments.findFirst(...);
  expect(fresh.version).toBe(5); // 변경 없음
});
```

- **Describe**: "<대상 단위> (레이어)". 예: `ProposalService (unit)`, `GET /proposals/:id/approve (e2e)`.
- **It**: `<현재 상태>를 <액션>할 때 <기대 결과>`. 한국어 허용.
- **한 it = 한 Assertion 의도**. 여러 expect를 쓰더라도 같은 사실을 보강하는 범위 내에서.

## 명령

### 로컬

```bash
# TDD 기본 루프 — 단위 테스트만 watch
pnpm --filter @poomgeul/api run test:watch

# 레이어별
pnpm --filter @poomgeul/api run test:unit
pnpm --filter @poomgeul/api run test:integration
pnpm --filter @poomgeul/api run test:e2e

# 전체
pnpm --filter @poomgeul/api run test

# 커버리지(선택)
pnpm --filter @poomgeul/api run test:coverage
```

### 로컬에서 통합 테스트 준비

```bash
# 1) DB 컨테이너
docker compose up -d postgres

# 2) app DB + test DB 둘 다 마이그레이션
pnpm --filter @poomgeul/db migrate

DATABASE_URL=postgres://poomgeul:poomgeul@localhost:5432/poomgeul_test \
  pnpm --filter @poomgeul/db migrate   # test DB가 없다면 먼저 psql로 CREATE DATABASE
```

test DB를 아직 만들지 않았다면:
```bash
docker exec poomgeul-postgres psql -U poomgeul -d postgres \
  -c "CREATE DATABASE poomgeul_test;"
```

## DB 통합 테스트 — 두 전략

### 전략 1: `withRollback` (빠르고 기본값)

```ts
import { withRollback } from "../db/test-db.js";
import { users, eq } from "@poomgeul/db";

it("inserts + rolls back", async () => {
  await withRollback(async (db) => {
    await db.insert(users).values({ email: "x@y.z" });
    const rows = await db.select().from(users).where(eq(users.email, "x@y.z"));
    expect(rows).toHaveLength(1);
  });
  // 트랜잭션이 롤백됐으므로 row는 남지 않는다.
});
```

- 공유 DB(`TEST_DATABASE_URL`)에서 한 트랜잭션을 열어 롤백.
- 장점: 컨테이너 기동 비용 없음. Jest 워커 1개에서 순차 실행해도 테스트당 <100ms.
- 제약: 프로덕션 코드가 **스스로** `db.transaction(...)`을 호출하면 중첩됨. 그 경로는 전략 2로.

### 전략 2: `startIsolatedContainer` (격리 필요할 때)

```ts
import { startIsolatedContainer, type ContainerHarness } from "../db/test-db.js";

describe("Proposal merge transactional path (isolated)", () => {
  let harness: ContainerHarness;

  beforeAll(async () => {
    harness = await startIsolatedContainer();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  });

  it("commits the revision and updates segment.version atomically", async () => {
    // harness.db 로 자유롭게 commit 가능한 시나리오 작성
  });
});
```

- Testcontainers로 `pgvector/pgvector:pg16` 컨테이너를 suite마다 새로 기동.
- 첫 부팅에 3~5초가 소요되므로 **한 suite 안에서 여러 it을 공유**하도록.
- 완전 격리 필요(중첩 트랜잭션, DDL 검증)한 경우에만.

## Nest 서비스·컨트롤러 단위 테스트

```ts
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";

describe("GET /healthz (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns status ok", async () => {
    await request(app.getHttpServer()).get("/healthz").expect(200).expect({ status: "ok" });
  });
});
```

- 대부분의 단위 테스트는 **컨트롤러/서비스를 직접 `new` 생성**하는 편이 가볍다(의존성을 생성자 인자로 넣기).
- DI·guard·interceptor 파이프라인 자체를 검증해야 할 때만 `TestingModule` 사용.

## 금지 패턴

- **DB를 mock** — 쿼리 결과를 직접 꾸미지 않는다. 실패한 통합이 숨겨진다.
- **`any`로 타입 우회** — 테스트는 실제 계약의 증거. `any`로 숨기면 계약 자체가 허물어짐. 정 안 되는 경우에만 `*.spec.ts`에 한해 허용.
- **다수 시나리오를 한 `it`에** — 실패 시 원인 추적이 어려워진다.
- **상태 공유하는 `beforeAll`에서 DB 씨드 + 개별 it에서 수정** — `withRollback` 대신 상태가 누적되면 테스트 순서 의존이 생긴다.

## CI 분리

`.github/workflows/ci.yml`의 두 잡에 맞춰 레이어가 실행된다.

| 잡 | 실행 레이어 |
|---|---|
| `quality` | `test:unit` (빠름, 외부 의존 없음) |
| `migrate-and-smoke` | `test:integration`, `test:e2e`, `/healthz` 스모크 |

PR에서 단위 테스트만 깨져도 즉시 실패가 떠야 하고, 통합/e2e는 DB를 띄운 잡에서 순차 검증한다.

## 로드맵

- **커버리지 게이트**: M0 후반부에 `statements/branches ≥ 60%` 선부터 시작.
- **mutation testing**: M1 이후 Stryker 도입 여부 결정.
- **Web 테스트**: Playwright 혹은 Vitest + RTL로 별도 도입([ADR-0001 후기](../architecture/decisions/0001-backend-framework.md)).

## 관련

- [dev-setup.md](dev-setup.md) — 로컬 환경, CI 재현 명령
- [architecture/decisions/0003-optimistic-locking.md](../architecture/decisions/0003-optimistic-locking.md) — 통합 테스트에서 검증할 핵심 경로
- [architecture/data-model.md](../architecture/data-model.md) — 테스트 씨드가 지켜야 할 FK 관계
