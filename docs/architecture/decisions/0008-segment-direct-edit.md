# 0008. Segment 직접 편집 — HTTP 계약·이중 기록 모델

- **Status:** Accepted
- **Date:** 2026-04-27
- **Deciders:** @bonghyeon

## Context

[workflow-proposal.md §리드 메인테이너의 직접 편집](../workflow-proposal.md#리드-메인테이너의-직접-편집)이 **"리드는 Proposal을 거치지 않고 `TranslationSegment`를 직접 수정 가능"** 이라고 정해 두었다. 단서:

- `PATCH /translations/{tid}/segments/{sid}`, `If-Match: <expected_version>` 헤더, body `{ text, commit_message }`.
- `TranslationRevision`은 `merged_proposal_id = NULL`, `author_id = lead.id`.
- 이벤트는 `Contribution { event: 'segment_edit' }` 1행.

스키마([translation_segments · translation_revisions · contributions](../data-model.md))와 동시성 규칙([ADR-0003](0003-optimistic-locking.md)), `SessionGuard`·`@CurrentUser` 인프라([ADR-0005](0005-github-oauth-session.md))는 이미 있다. Proposal 머지 경로의 HTTP/에러 모델·트랜잭션은 [ADR-0006](0006-proposal-crud-api.md)에서 정해졌다.

이 ADR이 정해야 하는 것: **(1) 단일 엔드포인트의 정확한 계약 표면, (2) Proposal `decide(approve)`와의 코드 공유 여부, (3) Reader UI에서 편집 모드를 어떻게 노출할지, (4) PR 분해**. 구현 코드·테스트는 PR이 처리한다.

## Decision

**1개 엔드포인트 + 1개 NestJS 모듈**로 직접 편집 경로를 분리하고, **2개 PR로 쪼개** 착지시킨다.

### 엔드포인트

| 메서드·경로 | 목적 | 가드 |
| --- | --- | --- |
| `PATCH /api/translations/:slug/segments/:segmentId` | 리드의 직접 편집. If-Match 헤더로 expected version 전달. | `SessionGuard` + **리드 체크** |

`/decide`처럼 별도 모듈로 빼는 이유: (a) Proposal 경로는 `proposalId`가 1차 entity인데 직접 편집은 `segmentId`가 1차 entity — controller routing이 다른 prefix로 가는 게 자연스럽다. (b) 트랜잭션 본체는 비슷하지만 *기록되는 행*이 달라서(아래 §이중 기록 모델) 한 서비스로 합치면 분기가 더 늘어난다. (c) 같은 `SegmentEditService` 안에 향후 `bulk-edit`(M2+)이 자라도 Proposal 도메인을 오염시키지 않는다.

### 페이로드

**Request**

```jsonc
// PATCH /api/translations/:slug/segments/:segmentId
// Headers: Cookie: sid=...; If-Match: "3"   (또는 W/"3", 또는 그냥 3)
// Body
{
  "text": "...",          // trim 후 비어 있지 않음, 최대 5000자
  "commitMessage": "..."  // 선택, 최대 500자
}
```

**200 OK — 갱신 성공**

```jsonc
{
  "segmentId": "uuid",
  "version": 4,
  "text": "...",
  "revisionId": "uuid",
  "lastEditedAt": "2026-04-27T03:11:09Z"
}
```

**에러 모델** — ADR-0006의 코드 표면을 그대로 따른다(UI에서 코드 분기 단일화).

| HTTP | code | 상황 |
| --- | --- | --- |
| 400 | `validation_failed` | trim 후 빈 text, 길이 초과, 알 수 없는 필드(`forbidNonWhitelisted`) |
| 401 | (NestJS 기본) | SessionGuard 실패 |
| 403 | `forbidden` | 리드가 아님 |
| 404 | `not_found` | translation 또는 segment 미존재 |
| 409 | `rebase_required` | 현재 version이 `If-Match` 값과 다름. body에 `currentVersion`·`currentText` 동반(ADR-0003) |
| 412 | `precondition_failed` | `If-Match` 헤더 누락 또는 형식 오류(따옴표 안 숫자가 아님) |

**412 vs 409 분리 이유**: RFC 7232 시맨틱과 가깝게 — *서버에 도달한 요청이 헤더 자체를 알아볼 수 없는* 상태(412)와 *해석은 됐는데 서버 상태와 어긋남*(409)을 분리한다. 클라이언트가 자동 재시도 정책을 다르게 짜기 쉬움. ADR-0006이 모든 동시성 충돌을 409로 통일한 것과 일치하게, *version mismatch는 전부 409*로 집약하고 412는 헤더 누락/파싱 실패에만 한정한다.

**If-Match 파서 관용 범위**: `"3"`, `3`, `W/"3"` 모두 정수 3으로 해석. RFC 7232 strong match 시맨틱(quoted-string 필수)까지 엄격하게 강제하지 않음 — 내부 API이고, fetch 클라이언트가 quote 처리를 빼먹는 것이 흔하다.

**no-op 가드**: `trim(text) === current.text && expectedVersion === current.version`이면 `revision`·`contribution`을 *기록하지 않고* 200을 그대로 돌려준다. 사용자가 편집 모드를 열어 본문을 보고만 닫는 흔한 흐름에서 revision noise를 막는다.

### 이중 기록 모델 (Proposal 머지와의 대칭)

`approve`와 직접 편집의 트랜잭션은 구조적으로 대칭이지만 **기록되는 행이 다르다** — Git의 *merge commit vs. direct commit* 구분과 같은 의도.

| 컬럼 | Proposal `decide(approve)` | 직접 편집 (이 ADR) |
| --- | --- | --- |
| `translation_segments.text` / `version` | 새 값 / +1 | 새 값 / +1 |
| `translation_segments.last_editor_id` | proposer | lead |
| `translation_revisions.author_id` | proposer | lead |
| `translation_revisions.merged_proposal_id` | proposal.id | **NULL** |
| `translation_revisions.snapshot.kind` | `proposal-merge` | `segment-direct-edit` |
| `contributions.event_type` | `proposal_merge` | `segment_edit` |
| `contributions.user_id` | proposer | lead |

`snapshot.schemaVersion = 1`을 함께 기록(ADR-0006 결정). M2의 "번역본 전체 blame"이 들어올 때 두 kind가 같은 jsonb 컬럼에 공존하므로 reader가 분기할 수 있어야 한다.

### 권한 체크 위치

- **리드 체크**: `SegmentEditService.edit`의 첫 단계에서 `translation.leadId === user.id` 비교(translation 조회 후 즉시). ADR-0006이 도입한 별도 `lead.guard.ts`를 *재사용하지 않는* 이유: 그 가드는 `:proposalId`로 translation을 역조회하지만 이 경로는 `:slug`로 직접 조회하므로 가드 안에서 또 한 번 fetch가 일어나면 service에서도 재조회가 생긴다. service 한 곳에서 처리.
- **`forbidden` vs `not_found`** 순서: translation 미존재면 404, 존재하지만 리드 아님은 403. translation의 존재 자체를 권한 escalation 단서로 노출하는 것은 무방(translation/slug는 공개 자원).

### 동시성·재진입

ADR-0003 의사코드를 그대로 따라 **두 단계 방어**:

1. 트랜잭션 시작 직후 `SELECT version, text` 다시 읽기 → `expected`와 비교. 다르면 `rebase_required`.
2. `UPDATE WHERE version = current.version` 실행 후 `RETURNING` 0행이면 그 사이 다른 트랜잭션이 끼어든 것. 한 번 더 `SELECT`해서 최신 값을 담아 `rebase_required` 반환.

서비스에서 첫 `findSegmentSnapshot`은 일관성보다 *no-op 판정*을 위해 한다(트랜잭션 밖 조회 한 번이 추가되지만, 트랜잭션 안에서 한 번 더 읽으므로 race가 일어나도 정확).

### Reader UI 통합 (편집 모드)

직접 편집은 *리드 한정*이라 일반 reader 경험에 노이즈가 되면 안 된다. **편집 모드 토글**을 도입한다.

- `EditModeProvider`(클라이언트 React context) — `isLead`인 페이지에서만 `<main>` 트리(또는 본문 섹션)를 감쌈. 비-리드는 Provider 자체가 없다.
- `EditModeToggle` — 본문 섹션 헤더에 위치. 클릭 시 `enabled` toggle. 켜져 있을 때만 각 세그먼트 아래 `SegmentEditor`가 자기를 렌더한다(`useOptionalEditMode`로 Provider 부재 시 자동 no-op).
- `SegmentEditor` — 행 단위 편집 패널. textarea + 선택 commit message + Save/Cancel. `Ctrl+Enter` 저장, `Esc` 취소.
- 키보드 단축키 — 편집 모드 ON & 활성 에디터 없음일 때 `j`/`k`로 세그먼트 간 이동(`#seg-{order}` 앵커로 scroll). textarea 안에서는 가로채지 않음.

UI가 호출하는 fetch는 단일 — `PATCH /api/translations/:slug/segments/:segmentId`에 `if-match: "${currentVersion}"` 헤더를 붙여 보낸다. 200이면 `router.refresh()`로 server component를 재실행해 새 본문을 끌어온다(별도 client cache 갱신 로직 없음).

### PR 분해 (D1 → D2)

| PR | 범위 | 산출 |
| --- | --- | --- |
| **D1** | API — 모듈 + 엔드포인트 + e2e | `apps/api/src/modules/segment-edit/*`, `app.module.ts` 등록, `apps/api/test/integration/segment-edit.e2e-spec.ts` |
| **D2** | Web — 편집 모드 UI | `EditModeProvider`, `EditModeToggle`, `SegmentEditor` 컴포넌트 + `t/[slug]/page.tsx` 와이어링 |

D1은 UI 변경 없이 단독 안전 머지. D2는 D1이 base에 있어야 의미가 있으므로 stack 형태(ADR-0006의 4-PR 체인과 동일한 운영).

### 모듈 구조

```
apps/api/src/modules/segment-edit/
  segment-edit.module.ts
  segment-edit.controller.ts   (PATCH 1개)
  segment-edit.service.ts       (리드 체크 + If-Match 파싱 + no-op 가드)
  segment-edit.repository.ts    (트랜잭션: UPDATE + revision insert + contribution insert)
  dto.ts                        (EditSegmentBody — class-validator)
```

`AuthModule` import로 `SessionGuard` 주입. `DatabaseModule`이 `@Global()`이라 별도 import 불필요(ADR-0006 직전 리팩터).

```
apps/web/src/features/reader/components/
  EditModeProvider.tsx          (context + j/k handler)
  EditModeToggle.tsx            (헤더 버튼)
  SegmentEditor.tsx             (행 단위 편집 패널)
```

세 컴포넌트는 `features/reader/index.ts` Public API로 export(FSD 규칙: `components/*` 직접 import 금지).

## Alternatives considered

| 옵션 | 장점 | 탈락 이유 |
|---|---|---|
| `ProposalService.decide`에 `direct-edit` 액션 추가 | 트랜잭션 코드 1곳 | 이중 기록 모델이 다르다(merged_proposal_id, contribution event_type, snapshot.kind). 한 서비스 안에서 분기를 늘리면 양쪽 변경 시 영향이 번지고 가드도 (proposalId vs segmentId)로 갈린다. |
| **`/segments/:id`를 PUT으로** | REST에 가까움 | text 외 다른 컬럼은 서버가 결정(version, lastEditorId, lastEditedAt, status). 부분 갱신 의미라 PATCH가 더 정확. |
| If-Match 대신 body에 `expectedVersion` | 표준 헤더 의존 X, 단순 | ADR-0006이 이미 `currentVersion`을 응답 본문으로 돌려주는 비대칭이 생긴다. HTTP 도구·로깅에서도 헤더 쪽이 가시적. |
| 모든 version mismatch를 412로 | RFC와 일치 | 클라이언트가 409 본문 schema(`currentVersion`/`currentText`)를 이미 ADR-0006용으로 가지고 있다. 일관성을 위해 409로 통일. |
| 리드 외 collaborator도 직접 편집 허용 | 향후 다중 메인테이너 | M0 결정(workflow-proposal.md): collaborator 모델은 M1+. 지금은 lead 1인. |
| **편집 모드 토글 없이 항상 인라인 편집 버튼** | 클릭 1회 절감 | reader 시야에서 편집 위젯이 항상 보이면 일반 사용자에게 노이즈. lead 한정이라도 reading 흐름 방해. |

## Consequences

### 긍정

- Proposal 머지 경로와 **이중 기록 모델이 코드 위에 명시적으로** 박힘 — `merged_proposal_id`/`event_type`/`snapshot.kind`의 의미가 PR diff에서 직접 읽힌다.
- `If-Match` + 409 `rebase_required`가 ADR-0006의 응답 schema와 **호환** — UI 한 곳(`features/reader/proposal-errors.ts` 류)에서 분기를 흡수.
- 편집 모드 컨텍스트가 *Provider 부재 시 no-op* 패턴이라 비-리드에 새는 위험이 없다(서버 권한 체크와 클라이언트 시야 분리가 이중 방어).

### 부정

- `SegmentEditService`와 `ProposalService.decide`의 트랜잭션이 구조적으로 비슷해서 향후 한쪽 버그가 다른 쪽에서 재현될 가능성이 있다(예: lock 순서 변경). e2e가 양쪽에 동등한 케이스를 가지도록 유지 필요.
- 412/409 두 코드를 따로 쓰는 것이 ADR-0006의 "409로 집약" 정책과 부분 충돌처럼 보일 수 있다. 정리: *값 mismatch는 409, 헤더 자체 부재/형식 오류는 412* — service 주석과 본 ADR에 박제.
- 편집 모드 j/k 단축키가 다른 페이지·widget의 단축키와 충돌할 여지(reading mode 등 미래 기능). 시작 단계라 활성 widget이 없어 즉시 충돌은 없음.

### 뒤집기 비용

- **가드 위치 이동**: `lead.guard.ts` 재사용으로 옮기는 것은 service에서 한 줄 빼고 `@UseGuards()` 추가. 5분 작업.
- **`/decide` 통합**: 두 서비스가 공통 transaction 헬퍼를 추출하는 리팩터로 D2 머지 후 언제든. 이중 기록 분기는 헬퍼 인자로 흡수 가능.
- **편집 모드 UX 변경**: `SegmentEditor`가 자체 가드(Provider/enabled)로 렌더 결정 → 토글 위치만 옮기면 됨.

## 구현 가이드 (요약)

PR별 핵심 체크포인트.

- **D1**: `SegmentEditController`가 `@Controller("translations/:slug/segments")` + `@Patch(":segmentId")` 한 핸들러. `parseIfMatch` 헬퍼는 `service.ts` private function. e2e는 happy/weak-ETag/no-op/401/403/404(slug, segmentId)/409 rebase/412 missing+invalid/400 empty+missing+forbidNonWhitelisted/연속 편집 단조 증가.
- **D2**: `EditModeProvider`는 `useOptionalEditMode` exporter도 함께 노출(SegmentEditor에서 Provider 부재 가드용). `t/[slug]/page.tsx`에서 `wrapEditMode(...)`는 `isLead`만 Provider로 감싸고, 비-리드는 동일 노드를 그대로 통과시켜 트리 모양 유지. `SegmentEditor` 자체가 `if (!ctx || !ctx.enabled) return null`로 자기 게이트.

## 관련

- [architecture/workflow-proposal.md §리드 메인테이너의 직접 편집](../workflow-proposal.md#리드-메인테이너의-직접-편집)
- [ADR-0003](0003-optimistic-locking.md) — `segment.version` optimistic locking
- [ADR-0005](0005-github-oauth-session.md) — SessionGuard·@CurrentUser
- [ADR-0006](0006-proposal-crud-api.md) — 에러 모델·이벤트 기록 컨벤션·PR 분해 운영
- [data-model.md](../data-model.md) — `translation_segments`, `translation_revisions`, `contributions`
