# 0009. Proposal Stale 자동 전환 — 외부 cron + 멱등 엔드포인트

- **Status:** Accepted
- **Date:** 2026-04-27
- **Deciders:** @bonghyeon

## Context

[M0 §6 Proposal 워크플로우](../../specs/m0-mvp.md)와 [workflow-proposal.md §스팸·저품질 방어](../workflow-proposal.md)가 **"30일 무응답 open 제안은 배치 작업으로 `stale` 자동 전환"** 을 M0 acceptance criterion으로 박아 두었다. 스키마(`proposals.status` enum에 `stale` 포함, `resolvedAt`/`resolvedBy` nullable)는 이미 [ADR-0006 구현](./0006-proposal-crud-api.md)에서 끝났고, controller도 `?status=stale` 필터로 *읽기* 가능. 빠진 것은 **자동 전환 트리거 자체**.

```
$ grep -rn "stale\|@Cron\|node-cron" apps/api/src/
# resolved-by/withdrawn 등 enum 참조와 docstring만 나옴.
# *.create-stale-event*, *.scheduler*, *.batch* 같은 actor 코드는 0건.
```

ADR이 정해야 하는 것:

1. **트리거 인프라** — 누가, 어디서, 무슨 메커니즘으로 일 1회 batch를 돌릴지.
2. **트랜잭션·동시성** — 다중 worker / 중복 실행 / 부분 실패에 대한 안전 모델.
3. **이벤트 기록** — `Contribution` 또는 별도 audit row를 남길지.
4. **운영 가시성** — 실행 성공/실패를 어떻게 알지.

스키마·HTTP 표면은 **이미 결정**돼 있어 본 ADR 범위는 *어디서·어떻게 부르는가*에 한정된다.

## Decision

**외부 cron이 멱등 엔드포인트를 호출하는 모델**로 간다.

- API 안에 `POST /api/internal/proposals/sweep-stale`(이름 잠정) 엔드포인트를 둔다. 30일 이상 `open`인 proposal을 단일 SQL UPDATE로 `stale` 전환.
- 이 엔드포인트는 **shared secret(`X-Internal-Token`)** 헤더로 보호한다.
- **GitHub Actions cron**(`.github/workflows/proposal-stale-sweep.yml`)이 매일 02:00 UTC에 production API에 POST 호출. 실패하면 워크플로우가 빨갛게 떠 알림.

배치 로직은 *워커 프로세스에 박혀 있지 않고* HTTP 엔드포인트 뒤에 있어, 같은 코드를 사람이 (운영 사고 시) 수동으로 호출할 수 있고 e2e 테스트에서도 같은 표면이 검증된다. **Cron은 "스케줄"이고 SUT는 "엔드포인트"** — 두 책임이 분리된다.

### 1. 트리거 옵션 비교

| 옵션 | 장점 | 탈락 이유 |
|---|---|---|
| **`@nestjs/schedule` in-process `@Cron`** | 의존성 1개, 코드 간단 | (a) 다중 인스턴스 환경에서 동시 실행 → 분산 lock 필요. (b) 인스턴스가 죽어 있는 시간대에 fire 못 하면 다음 날까지 누락. (c) "지금 이 머신에서 안 도는 것 같다" 디버깅 어려움. (d) 컨테이너 재시작과 cron timer 상태가 결합. |
| **외부 cron(GitHub Actions) → 멱등 엔드포인트** ✅ | (a) cron 인프라가 우리 책임 외 — 가용성 보장. (b) 액션 페이지에 실행 이력·로그·실패 알림 자동 누적. (c) 같은 엔드포인트로 사람이 ad-hoc 트리거 가능. (d) 멱등하므로 다중 worker·재실행 무해. | 외부 의존성 1개 추가(GitHub Actions의 cron 정확도는 분 단위로 흔들림 — 일 1회면 무관). |
| 별도 워커 프로세스(BullMQ/queue) | 견고, 스케일아웃 가능 | M0 규모(수십 proposal/일)에 과도. Redis 의존성 추가. 인프라 비용·복잡도 모두 증가. |
| Vercel Cron / Railway Scheduled Job | 호스팅 단일화 | 호스트 ↔ 기능 락인. **API 호스트가 아직 결정되지 않았다** — 의존성 미루는 게 안전. |
| pg_cron(`pg_cron` extension + `cron.schedule`) | DB 안에서 독립 | (a) 비즈니스 로직이 SQL이 아니라 service 레이어에 있을 때 *코드 분기*가 SQL/TS 두 곳에 생긴다. (b) audit·contribution 기록이 service 레이어와 어긋난다. (c) managed Postgres에서 extension 권한이 막힌 경우가 흔함. |

### 2. 엔드포인트 계약

```
POST /api/internal/proposals/sweep-stale
Headers:
  X-Internal-Token: <shared secret, env INTERNAL_BATCH_TOKEN>
Body: (없음)

200 OK
{
  "status": "ok",
  "transitioned": 17,
  "thresholdDays": 30,
  "ranAt": "2026-05-01T02:00:00Z"
}

401 Unauthorized — 토큰 누락/오답
{
  "code": "unauthenticated",
  "message": "missing or invalid X-Internal-Token"
}
```

**가드 정책**:

- 일반 `SessionGuard`를 *쓰지 않는다*. 사용자 세션과 무관한 시스템 호출. 별도 `InternalTokenGuard`로 `X-Internal-Token` 헤더 1개만 비교(`crypto.timingSafeEqual`).
- 라우트 prefix `/api/internal/`는 NGINX/CDN 단에서 internal IP만 허용하는 등의 *2차 차단을 받기 쉬운 이름* 자체로 시그널. M0에선 토큰만 1차 방어.

**에러 모델**: ADR-0006 코드 표면을 그대로(`unauthenticated`/`internal_error`).

### 3. 트랜잭션·멱등성

```sql
UPDATE proposals
SET status = 'stale',
    resolved_at = now(),
    resolved_by = NULL  -- system actor: NULL을 "system이 닫았다"로 해석
WHERE status = 'open'
  AND created_at < now() - interval '30 days'
RETURNING proposal_id, translation_id, proposer_id;
```

- **단일 SQL UPDATE**로 끝낸다. JS 루프 없음 → 부분 실패 / 행 잠금 / N+1 모두 제거.
- `WHERE status = 'open'` 조건 덕에 **여러 번 호출돼도 같은 row를 두 번 전환하지 않음** (멱등). cron이 늦게 한 번 더 fire해도 무해.
- `resolvedBy = NULL`을 시스템 actor로 해석 — workflow-proposal.md가 system 사용자 row를 만들지 않은 결정과 일관(ADR-0006의 `decide`도 NULL 가능 컬럼). 이 의미는 본 ADR과 0006 양쪽 주석에서 명시.
- 동시 두 cron이 동시에 fire하는 경우(다중 worker / 재시도 중복): Postgres가 row-level lock으로 직렬화 → `RETURNING` 결과가 한쪽은 N행, 다른 쪽은 0행. 양쪽 모두 200 OK. 호출자(GitHub Actions)는 단일 워크플로우라 실제로는 동시 실행 거의 없음.

### 4. Contribution 이벤트 — *기록하지 않는다*

`stale` 자동 전환은 **사용자 행동이 아니다**. 기존 4종(`proposal_submit`/`proposal_merge`/`segment_edit`/`review_comment`)이 모두 *유저 actor*를 갖는 것과 다르다.

- `Contribution` row를 만들면 `userId`가 NULL이 되거나 system row가 필요 — 둘 다 schema에 없는 분기를 도입.
- 프로필·평판 집계(M1+)가 `stale`을 어떤 가중치로 셀지는 정해진 바 없다. *데이터를 만들어두기보다, 필요해지면 그때 생성한다*.
- 운영 가시성은 audit log(§5)와 cron 워크플로우 출력으로 충분.

전환 사실 자체는 `proposals.resolved_at` + `status = 'stale'`로 **테이블 자체에 박제**되어 있다.

### 5. 운영 가시성

세 단계 관찰점:

1. **GitHub Actions 페이지** — 실행 성공/실패 / curl exit code / API 응답 body. cron 실패는 빨간 X로 즉각.
2. **API access log** — `/api/internal/proposals/sweep-stale` 호출 시각·요청 IP·응답 시간.
3. **응답 본문 `transitioned`** — 매일의 sweep 규모. 0이 며칠 연속이면 "open이 30일 넘어가는 사례가 없다"(좋음) 또는 "엔드포인트가 못 도달 중"(나쁨)을 의심.

**알림 정책**: GitHub Actions의 기본 실패 이메일을 첫 단계로 두고, M1+에서 사용량 늘면 별도 모니터(Datadog/Grafana)로 이관.

### 6. 구성과 secret 운영

- API 환경변수 `INTERNAL_BATCH_TOKEN` — production·staging 별도 값.
- GitHub Actions `secrets.INTERNAL_BATCH_TOKEN`·`secrets.API_BASE_URL`로 주입.
- 로컬 dev에선 토큰을 default로 두지 *않는다* — 가드가 토큰 미설정 시 503으로 응답해 *dev에서 우연히 실행되는 사고*를 막는다(개발자가 명시적으로 export한 경우만 실행 가능).

### 7. 후속 PR 분해

| PR | 범위 | 산출 |
| --- | --- | --- |
| **0009-1** | API: `InternalTokenGuard` + `POST /api/internal/proposals/sweep-stale` 엔드포인트 + 단일 UPDATE 레포 메서드 + e2e | 엔드포인트 1개, 가드 1개, e2e 5케이스(200/멱등/30일 미만 미전환/401 missing/401 wrong token) |
| **0009-2** | CI: `.github/workflows/proposal-stale-sweep.yml` + secrets 문서 (`docs/guides/operations.md` 또는 신규) | cron 1개, 운영 가이드 한 절 |

0009-1만 머지돼도 **사람이 매일 curl로 호출하면 정책은 성립**. 0009-2는 자동화 단계.

## Alternatives considered

§1 트리거 옵션 표 참조. 추가로 고려한 미세 옵션:

| 옵션 | 탈락 이유 |
|---|---|
| 30일 *경과 즉시* 전환(create 시점 `expires_at` 컬럼) | 신규 컬럼 + 인덱스 + 마이그레이션. 배치 1회/일이면 충분한데 schema 비용이 더 큼. |
| 고정 30일 → **threshold 가변(`?days=N`)** | M0에 가변 필요 없음 — 정책으로 30일 고정. 가변은 M2+. |
| 응답에 전환된 proposal id 목록 동봉 | 페이로드 비대화. 운영자가 필요하면 `?status=stale&since=...`로 별도 조회. |
| 별도 audit 테이블 신설 | `proposals.resolved_at`로 충분. 이중 기록은 M1+ 감사 정책이 생기면. |

## Consequences

### 긍정

- M0 §6의 마지막 미체크 acceptance가 **인프라 결정 없이** 처리된다(GitHub Actions는 이미 우리가 쓰는 환경).
- 같은 엔드포인트가 *cron / 사람 / 테스트* 세 호출자에게 동일한 인터페이스를 제공한다.
- 멱등 + 단일 SQL이라 부분 실패 / 다중 호출 / 재시도가 모두 안전.
- 호스팅(API 배포 위치)이 아직 결정되지 않은 단계에 인프라 락인을 만들지 않는다.

### 부정

- `/api/internal/*` 노출 표면이 추가됨. 토큰 1개 + path 컨벤션이 1차 방어 — production에서 reverse proxy 단의 path 차단을 *빨리* 더해야 안전.
- GitHub Actions cron의 fire 정확도는 분~십분 단위로 흔들림. 일 1회 정책에 영향 없지만, 향후 시간 단위 정확도가 필요해지면 다른 트리거로 이관 필요.
- 시스템 actor를 `resolvedBy = NULL`로 표현하는 컨벤션이 ADR-0006의 `decide(approve|reject)`와 미세하게 다름(거기선 항상 lead userId). 두 ADR 본문 + service 주석에 "NULL = system"을 명시해 둠.

### 뒤집기 비용

- **트리거 교체(GitHub Actions → BullMQ 등)**: 엔드포인트는 그대로 두고 호출자만 바꾸면 됨. 사실상 무비용.
- **threshold 변경(30 → N일)**: SQL의 `interval` 한 곳, 환경변수로 빼는 것도 한 줄.
- **`resolvedBy` 시스템 user row 도입**: `users` seed에 system 행 1건, SQL의 `resolved_by` 값만 변경. 데이터 마이그레이션은 `UPDATE proposals SET resolved_by = $system WHERE status = 'stale' AND resolved_by IS NULL`.
- **Contribution 기록 추가**: 엔드포인트 안에서 `RETURNING`된 행 수만큼 `Contribution { event: 'proposal_stale', userId: proposer }` insert 추가. M1+ 평판 정책이 정해지면 1회 마이그레이션으로 과거 stale에 대한 contribution도 backfill.

## 관련

- [specs/m0-mvp.md §6 Proposal — "30일 무응답 제안은 배치 작업으로 stale 자동 전환"](../../specs/m0-mvp.md)
- [architecture/workflow-proposal.md §스팸·저품질 방어 표 — stale 자동 전환](../workflow-proposal.md)
- [ADR-0006](./0006-proposal-crud-api.md) — `proposals.status` enum, `resolvedBy/resolvedAt`, 에러 모델
- [data-model.md](../data-model.md) — `proposals` 스키마(컬럼 추가 없음)
