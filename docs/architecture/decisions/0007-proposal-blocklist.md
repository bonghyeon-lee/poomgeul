# 0007. Proposal Blocklist — 번역본 단위 사용자 차단 모델

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @bonghyeon

## Context

Proposal 스팸·저품질 방어에서 "리드가 번역본 단위로 사용자 제안 차단"은 M0 필수 장치로 이미 정책 문서에 박혀 있다. 그러나 스키마·API·에러 코드는 비어 있어 정책이 코드로 이어지지 못한 상태다.

- [workflow-proposal.md §스팸·저품질 방어](../workflow-proposal.md)가 **"사용자 단위 차단 — 리드가 '이 번역본에서 제안 차단' 가능"**을 M0 장치로 명시.
- [policy/governance.md §5 제안 품질 악용 대응](../../policy/governance.md)이 **"대량 저품질 제안을 반복하는 사용자는 해당 번역본에서 제안 차단 + 전역 rate limit 대상"**까지 정책을 써 두었다. 코어팀 수동 검토가 M0~M1, 자동 탐지는 M2+.
- 현재 `packages/db/src/schema.ts`에는 blocklist 테이블이 없다.
- [ADR-0006](./0006-proposal-crud-api.md) 마지막 "대안(Alternatives considered)"에서 **"blocklist는 별도 후속 ADR-0007에서 결정"**으로 범위를 명시적으로 미뤘다.

이 ADR의 범위는 **데이터 모델 · 정책 경계 · 에러 코드 · PR 분해**까지다. 실제 스키마 마이그레이션·엔드포인트 구현·UI는 후속 PR이 처리한다.

## Decision

### 1. Scope — 번역본 단위

블록은 `(translation_id, user_id)` 쌍이 단위. 리드가 **자기 번역본에서만** 특정 사용자의 새 제안을 막을 수 있다. 사이트 전역(abuse 팀용) 차단은 본 ADR 범위 외 — M2에서 abuse 운영이 생기면 별도 ADR.

governance.md가 "해당 번역본에서"로 이미 명시하므로 이 선택이 정책과 일관.

### 2. 기존 open 제안 — 그대로 유지

차단 시점 이전에 해당 사용자가 남긴 open 제안은 **자동 withdrawn/stale 전환 없이 유지**. 그 제안들은 이미 리드의 결정 대기열에 들어간 정상 데이터고, 자동 전환은 이후 감사나 통계에서 "왜 withdrawn 상태인가"의 원인을 흐린다.

차단된 사용자는 **새 제안 생성 경로만 막힌다**. 기존 제안 철회는 여전히 proposer 본인 권리.

### 3. 권한 주체 — 리드만 (M0)

`translations.leadId === requester.id`인 사용자만 차단/해제. 공동 메인테이너는 M1 범위라 M0에선 리드 단수. 리드 이관 시에도 구조는 변하지 않음 — 새 리드가 기존 차단을 유지·해제할 수 있다.

### 4. 스키마

```text
proposal_blocklist
  translation_id  uuid  NOT NULL  REFERENCES translations(id) ON DELETE CASCADE
  user_id         uuid  NOT NULL  REFERENCES users(id)        ON DELETE CASCADE
  blocked_by      uuid  NOT NULL  REFERENCES users(id)
  reason          text  NULL                   -- 리드 전용 메모, 기본 비공개
  created_at      timestamptz NOT NULL DEFAULT now()
  revoked_at      timestamptz NULL
  revoked_by      uuid  NULL      REFERENCES users(id)
  PRIMARY KEY (translation_id, user_id)
```

- **Soft delete**: `revoked_at` nullable. row는 삭제하지 않고 revoke 마크. 재차단·감사 추적을 위해서다. 핫 delete 시 감사 로그가 사라지는 비용이 뒤집기 비용보다 크다.
- **핫패스 인덱스**: `CREATE INDEX ... ON proposal_blocklist (translation_id, user_id) WHERE revoked_at IS NULL`. 새 제안 생성 시마다 이 게이트를 타므로 partial index가 `sessions(session_id) WHERE revoked_at IS NULL` 패턴(ADR-0005)과 동일 모양으로 일관.
- PK가 `(translation_id, user_id)`이므로 **"재차단"은 기존 row를 UPDATE(`revoked_at`=NULL, `blocked_by`/`reason` 갱신)**. Soft delete 선택에 맞춰 insert-or-update 로직이 엔드포인트 구현 단계에서 처리.

### 5. Unblock

같은 번역본의 리드만 revoke 가능. 엔드포인트 형식은 기존 [ADR-0006의 `/decide` 패턴](./0006-proposal-crud-api.md)과 대칭:

- `POST /api/translations/:slug/blocklist` — `{ userId, reason? }`으로 차단 생성 또는 재차단.
- `DELETE /api/translations/:slug/blocklist/:userId` — 해제.
- `GET /api/translations/:slug/blocklist` — 리드용 차단 목록 (리드만 접근).

UI는 M1 범위라 M0 구현은 API까지. 리드가 수동으로 호출하는 상태여도 governance.md의 약속은 성립.

### 6. 차단된 사용자에게의 알림

- 제안 생성 시 `403 blocked_by_lead`. 응답 body는 `{ code: "blocked_by_lead", message: "이 번역본의 리드가 회원님의 새 제안을 차단했습니다" }`만.
- **`reason`은 기본 비공개** — 리드에게만 노출. 근거:
  - 악용된 문구가 공개되면 해당 사용자가 우회 방법을 학습할 수 있다.
  - 리드가 쓴 사유가 민감·감정적일 수 있어 공개가 사후 분쟁을 키운다.
- 투명성 요구(예: "왜 차단됐는지 알 권리")는 향후 정책 개정 지점. 필요 시 응답에 `reasonVisibleToUser` flag로 노출 토글.

### 7. ADR-0006 에러 모델과의 정합

- 신규 코드: `blocked_by_lead` (HTTP 403).
- `ProposalService.create`의 **맨 앞 게이트**. 호출 순서:
  1. slug → translation 존재 확인 (404 not_found)
  2. **blocklist 조회 → 403 blocked_by_lead** ← 여기
  3. segment 소속 확인 (404)
  4. optimistic lock (409 rebase_required)
  5. 중복 open 체크 (409 duplicate_open_proposal)
  6. insert + contribution

정책 gate가 비즈니스 유효성보다 먼저 평가돼야 한다. "블록된 사용자가 유효한 제안이더라도 만들 수 없다"는 의도를 코드 순서가 그대로 드러낸다.

### 8. 구현 PR 분해 (후속)

- **0007-1**: 스키마(drizzle-kit generate 마이그레이션 1건) + 3개 엔드포인트 + `ProposalService.create` 게이트 + 단위/통합 테스트. 단일 PR 3–4시간.
- **0007-2**: 리드 UI (Reader 옆 "차단 목록" 패널·차단 버튼·해제 버튼). M1 리드 거버넌스 UI 작업과 합류 가능. 범위 외.

## Alternatives considered

| 옵션 | 장점 | 탈락 이유 |
|---|---|---|
| 쿨다운만 (N일 제안 금지) | 스키마 없음 | 악성 스팸 대응 불가. 정책 판단자(리드) 부재. governance.md 약속과 미스매치. |
| 평판/티어 선제 도입 | 근본 해결 | M2 오버엔지 — 공식 튜닝·악용 탐지·UX 차별화 모두 필요. M0~M1에서는 수동 판단이 빠르고 공정. |
| 자동 차단(품질 스코어) | 리드 손 안 감 | 오탐 비용 높음. 점수 모델·학습 데이터 부재. M2+. |
| Hard delete (row 삭제) | 스키마 단순 | 재차단·감사 추적 불가. Soft delete가 뒤집기 비용이 더 낮다. |
| Scope 전역 (core team only) | abuse 단일 창구 | M0에 abuse 팀 없음. 코어팀 수동 처리로 충분. 후속 ADR에서 재검토. |
| `reason` 공개 | 사용자 알 권리 | 악용 우회 학습 + 감정 분쟁 확대. 개정 여지는 flag로 열어둠. |

## Consequences

### 긍정

- governance.md의 "차단" 약속이 스키마로 박제된다.
- 핫패스가 1 row lookup + partial index라 비용 무시 가능.
- 리드 자치가 코드 수준에서 강화된다 — 번역본 당 한 명의 결정권자만 관여.
- ADR-0006 에러 모델 확장이 최소다(코드 하나 추가).

### 부정

- 테이블 하나 증가 + `ProposalService.create` 맨 앞에 새 게이트 한 줄. 유지비는 낮지만 0은 아님.
- `reason` 비공개 정책은 향후 투명성 요구와 충돌할 수 있다. 정책 개정 여지는 열어 두되 디폴트는 비공개.
- 차단 남용(자의적 차단)에 대한 안전장치는 M0에 없다. M2에 abuse 팀이 "차단된 사용자의 이의 제기 경로"를 담당.

### 뒤집기 비용

- **스키마 롤백**: FK cascade라 row 삭제는 단순. 테이블 drop도 하나.
- **정책 변경(공동 메인테이너 허용 등)**: 권한 체크만 수정 — 쿼리는 변경 없음.
- **기존 블록 보존 + 정책만 변경**: `revoked_at`를 일괄 null 유지하고 가드 로직만 교체하면 된다.
- **`reason` 공개로 전환**: 응답 body에 `reason` 노출 추가 + 감사 정책 업데이트. 스키마 변경 없음.

## 관련

- [workflow-proposal.md — 스팸·저품질 방어 표](../workflow-proposal.md)
- [policy/governance.md §5 — 제안 품질 악용 대응](../../policy/governance.md)
- [ADR-0006 — 에러 모델 · ProposalService.create 체인](./0006-proposal-crud-api.md)
- [data-model.md](../data-model.md) — 테이블 신설 반영은 0007-1 구현 PR에서
