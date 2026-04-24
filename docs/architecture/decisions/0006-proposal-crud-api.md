# 0006. Proposal CRUD API — 경로·페이로드·PR 분해 전략

- **Status:** Accepted
- **Date:** 2026-04-24
- **Deciders:** @bonghyeon

## Context

[M0 §6 Proposal 워크플로우](../../specs/m0-mvp.md)와 [workflow-proposal.md](../workflow-proposal.md)가 **상태 머신·머지 절차·Attribution 규칙**을 정리해 두었다. 남은 것은 **실제 HTTP 계약과 NestJS 모듈 구조**다. 관련 스키마([proposals · proposal_comments · translation_revisions](../data-model.md))는 이미 있고, 동시성 규칙([ADR-0003](0003-optimistic-locking.md))도 정해져 있다.

UI 쪽 단서:

- Reader(`apps/web/src/app/t/[slug]/page.tsx`)에 이미 **제안 목록 섹션과 빈 상태 메시지**가 렌더되며, 세그먼트 카드가 `openProposalStatus`를 chip으로 표시한다. 현재는 mock 데이터로 채워져 있어 **API만 붙이면 바로 살아나는 구조**.
- Reader bundle(`apps/web/src/features/reader/types.ts`의 `ProposalSummary`)에는 `proposerDisplayName`·`status`·`createdAt`·`segmentId`만 내려간다. 번들에 "모든 제안 목록"을 끼워 넣는 것은 페이로드 비대·프라이버시 관점에서 바람직하지 않음 → **별도 엔드포인트**로 분리.

ADR 범위는 **계약 표면(HTTP 경로/페이로드/에러 모델)·PR 분해 순서·UI 통합 전략**. 구현 코드·테스트는 각 PR이 처리한다.

## Decision

M0 §6의 수락 기준을 충족하는 **5개 엔드포인트**로 Proposal CRUD를 펼치고, **4개 PR로 쪼개** 순차 착지시킨다. 모든 쓰기 엔드포인트는 `SessionGuard` 옵트-인(ADR-0005). 읽기는 익명 허용.

### 엔드포인트

모두 `setGlobalPrefix("api")` 하위 — `/api/translations/:slug`를 공통 prefix로 한다. 이유: 기존 `/api/translations/:slug/reprocess` 등과 결·URL 멘탈 모델을 통일하고, slug→translationId 매핑 로직이 `TranslationsController`에 한 번만 있으면 된다.

| 메서드·경로 | 목적 | 가드 |
| --- | --- | --- |
| `GET /api/translations/:slug/proposals` | 특정 번역본의 제안 목록. 기본 open 우선, 필터 가능. | 없음 |
| `GET /api/translations/:slug/proposals/:proposalId` | 제안 상세(현재 세그먼트 본문·댓글 스레드 포함). | 없음 |
| `POST /api/translations/:slug/proposals` | 새 제안 생성. | `SessionGuard` |
| `POST /api/translations/:slug/proposals/:proposalId/decide` | 리드의 approve/reject 통합 엔드포인트. | `SessionGuard` + **리드 체크** |
| `POST /api/translations/:slug/proposals/:proposalId/withdraw` | proposer의 철회. | `SessionGuard` + **proposer 본인 체크** |
| `POST /api/translations/:slug/proposals/:proposalId/comments` | 댓글 추가(스레드). | `SessionGuard` |
| `GET /api/translations/:slug/proposals/:proposalId/comments` | 댓글 목록. | 없음 |

상태 전이를 `/approve`·`/reject` 각각 두지 않고 **`/decide`로 통합**한 이유: (1) 둘의 DB 트랜잭션·가드·권한이 동일, (2) 후속 `approve-with-edits`(M1+)가 붙을 때 같은 엔드포인트에서 `action` 필드만 확장하면 됨.

### 페이로드 (JSON)

**생성 — `POST .../proposals`**

```jsonc
// request
{
  "segmentId": "uuid",
  "baseSegmentVersion": 3,
  "proposedText": "...",
  "reason": "선택"
}
// 201
{
  "proposalId": "uuid",
  "status": "open",
  "createdAt": "2026-04-24T10:12:00Z"
}
```

중복 규칙(M0 §6 AC: "같은 사용자·같은 세그먼트 open 1개") 위반 시 `409 Conflict`, body `{ code: "duplicate_open_proposal", existingProposalId: "..." }`.

**Decide — `POST .../proposals/:id/decide`**

```jsonc
// request
{ "action": "approve" | "reject", "note": "선택" }
// 200 (approve merged)
{
  "proposalId": "uuid",
  "status": "merged",
  "segment": { "segmentId": "uuid", "version": 4, "text": "..." },
  "revisionId": "uuid"
}
// 200 (reject)
{ "proposalId": "uuid", "status": "rejected", "resolvedAt": "..." }
// 409 Conflict (optimistic locking 불일치 — ADR-0003)
{
  "code": "rebase_required",
  "currentVersion": 5,
  "currentText": "..."
}
```

approve 트랜잭션 내부는 ADR-0003 §구현 참고의 의사 코드와 동일하다. `TranslationRevision` 스키마가 `snapshot jsonb`를 요구하므로 **M0에서는 "해당 세그먼트 전후 스냅샷"만**을 잡음(`{ before: {...}, after: {...} }`). 번역본 전체 스냅샷은 M2 blame 경로로 미룸.

**Withdraw — `POST .../proposals/:id/withdraw`**

요청 바디 없음. `204 No Content`. proposer 본인이 아니거나 상태가 `open`이 아니면 `403`/`409`.

**Comment — `POST .../proposals/:id/comments`**

```jsonc
{ "body": "텍스트" }
// 201
{ "commentId": "uuid", "createdAt": "...", "author": { "userId": "...", "displayName": "..." } }
```

### 권한 체크 위치

- **리드 체크**: `TranslationsRepository.isLead(translationId, userId)` 헬퍼를 추가하고 `/decide`에서 사용. `translation_collaborators` 테이블이 존재하지만 M0에서는 `translations.leadId`만 신뢰(collaborator 행 채움은 M1+). 구현은 `leadId === userId` 비교 한 줄.
- **proposer 체크**: `/withdraw`에서 `proposal.proposerId === req.user.id` 비교.
- **블록 리스트(M0 §6 "리드가 특정 사용자 제안 차단")**: 이 ADR 범위 외. 차단 모델은 **별도 ADR-0007 후속**에서 결정(뒤집기 쉬운 feature flag로 도입 예정).

### 에러 모델

일관성을 위해 비즈니스 에러는 discriminated union 식 JSON 본문:

| HTTP | code | 상황 |
| --- | --- | --- |
| 400 | `validation_failed` | class-validator 실패 (빈 proposedText, 길이 초과 등) |
| 401 | `unauthenticated` | SessionGuard 실패 |
| 403 | `forbidden` | decide인데 리드 아님, withdraw인데 proposer 아님 |
| 404 | `not_found` | translation·proposal·segment 미존재 |
| 409 | `duplicate_open_proposal` | 중복 제안 |
| 409 | `rebase_required` | optimistic lock 실패 — `currentVersion`·`currentText` 동반 |
| 409 | `not_open` | 이미 종결된 proposal에 decide/withdraw |

### 입력 검증

- `proposedText`: trim 후 비어 있지 않음, 최대 5,000자(세그먼트 단위 문장이므로 충분히 넉넉). 연속 공백 정리는 M0에서 서버가 하지 않음(입력 그대로 저장 → 리뷰 시 diff가 명확).
- `reason`: 선택, 최대 500자.
- `body`(comment): trim 후 비어 있지 않음, 최대 2,000자.

### Reader bundle과의 관계

Reader bundle(`GET /api/translations/:slug`)은 기존처럼 **최근 proposals의 얕은 요약**(`ProposalSummary[]`)만 내려 세그먼트 카드의 chip 렌더에 쓴다. 목록·상세·댓글은 별도 엔드포인트를 **Reader에서 lazy fetch**. 이유: bundle 응답 크기 안정화, CRUD 변화가 bundle 캐시·ETag 전략에 전파되지 않음.

### PR 분해 (C1 → C4)

| PR | 범위 | 엔드포인트 | 부작용 |
| --- | --- | --- | --- |
| **C1** | **Read 경로** | `GET :slug/proposals`, `GET :slug/proposals/:id`, `GET :slug/proposals/:id/comments` | 없음(쓰기 미포함). Reader UI의 proposal 섹션을 mock → 실 API로 전환. |
| **C2** | **생성** | `POST :slug/proposals` | SessionGuard + 중복 체크. Reader 세그먼트 카드에 "제안하기" 버튼 추가는 이 PR에. |
| **C3** | **Decide + Withdraw** | `POST :id/decide`, `POST :id/withdraw` | ADR-0003 optimistic locking 구현이 실제로 일어나는 지점. 리드 UI(승인/거절 버튼)와 proposer UI(철회) 포함. |
| **C4** | **Comments** | `POST :id/comments`, `GET :id/comments` | 댓글 UI. Contribution 이벤트 기록도 C4에서 함께. |

Contribution 이벤트(`proposal_submit`·`proposal_merge`·`review_comment`) 삽입은 **각 PR이 자기 동사에서 같이 기록**한다. 단일 관찰자/옵서버로 분리하지 않음 — 프로필·평판 집계가 M1+인데 지금 이벤트 버스를 세우는 것은 오버엔지니어링.

### 모듈 구조

```
apps/api/src/modules/proposal/
  proposal.module.ts
  proposal.controller.ts       (GET/POST 라우트)
  proposal.service.ts           (비즈니스 로직, optimistic lock 포함)
  proposal.repository.ts        (Drizzle 쿼리 집중)
  comment.service.ts            (C4)
  dto.ts                        (class-validator DTO)
  lead.guard.ts                 (리드 체크 — C3에서 도입)
```

`DatabaseModule`(ADR-0006 직전 리팩터)을 통해 `DB_TOKEN` 해소. `AuthModule`에서 `SessionGuard`·`@CurrentUser()` 주입.

## Alternatives considered

| 옵션 | 장점 | 탈락 이유 |
|---|---|---|
| `/decide` 대신 `/approve`·`/reject` 분리 | URL에서 동사 명시 | 트랜잭션·가드·권한 동일 — 중복 컨트롤러 핸들러만 생김. 후속 `approve-with-edits` 추가도 `action` 파라미터 확장이 더 자연스럽다. |
| **Reader bundle에 전체 proposal 목록 포함** | 추가 요청 없음 | bundle 페이로드 비대화, 캐시 무효화 타이밍 전파. 제안이 많은 번역본에서 수십 KB 추가. |
| 상태 전이를 PATCH로 | REST 원칙에 가까움 | body의 `action` 값에 따른 분기가 PATCH 메서드의 "부분 수정" 의미와 어긋남. POST 서브리소스가 Nest 패턴과도 일관. |
| **blocklist를 C0로 선행** | 스팸 방어 먼저 | M0 초기 사용자 수가 아주 적다. UI 지원도 필요해 범위 팽창. 별도 후속 ADR로 명시 분리. |
| 한 PR로 전체 | 리뷰 1회 | 파일 30+ / 커밋 10+ 예상 — 리뷰 불가 수준. 위 PR 분해로 각 50 ± 30라인 규모로 유지. |

## Consequences

### 긍정

- Reader UI의 proposal 섹션이 **C1 머지만으로** 목업 → 실 데이터. 가시적 가치가 빠름.
- ADR-0003 optimistic locking이 **코드로 실제로 실행되는 첫 지점**이 C3 — `/decide`의 트랜잭션과 409 응답이 테스트로 박제됨.
- Attribution 이중 기록(`proposer_id` author vs `resolved_by` committer)이 **스키마 위에 실제로 흐르게** 되어 향후 프로필(M1 #4)이 소비할 이벤트가 쌓이기 시작.

### 부정

- `/decide`의 `action` 문자열 분기는 switch 하나 더. class-validator enum으로 막아 실수 여지는 낮음.
- `TranslationRevision.snapshot`을 M0에 "해당 세그먼트 전후"만 채우면 M2의 "번역본 전체 blame"으로 확장할 때 스키마 해석이 버전별로 갈린다. 구현 PR에서 `snapshot.schemaVersion` 필드로 방어.
- 4 PR 체인 — 스택 관리 필요. 중간 머지로 rebase 유발은 PR#1~#4(ADR-0005)에서 겪은 대로 **각 단계에서 base=main으로 끊는 형태**로 운영하면 안전.

### 뒤집기 비용

- **엔드포인트 변경**: `/decide` → `/approve`+`/reject` 분리는 라우트 추가와 호출부 수정만. Reader UI는 결정 이후에만 C3에서 붙이므로 영향 범위 최소.
- **에러 코드 이름 변경**: UI가 한 곳에서 코드를 분기하도록 `features/reader/proposal-errors.ts` 같은 단일 파일로 격리.
- **블록리스트 도입**: `ProposalService.create`에 체크 한 줄 + 리드 UI 한 버튼. C2 이후 언제든.

## 구현 가이드 (요약)

PR별 핵심 체크포인트. 상세 코드 패턴은 ADR-0003의 의사코드와 일관성을 유지한다.

- **C1**: `proposal.repository.ts`에 `listByTranslation(translationId, { status?, limit })`, `findDetail(proposalId)`, `listComments(proposalId)`. `TranslationsController`가 아닌 **새 `ProposalController`**를 만들어 routes를 `@Controller("translations/:slug/proposals")`로 마운트. slug→translationId는 `SourceRepository.findBySlug`를 이동(별도 작은 리팩터)하거나 `ProposalRepository`에 재노출.
- **C2**: `ProposalService.create` — 중복 체크(`proposerId + segmentId + status=open`이 존재하면 409). `Contribution { event: 'proposal_submit' }` 기록. DTO 검증.
- **C3**: `ProposalService.decide`와 `withdraw`. `decide`의 approve 분기는 ADR-0003 트랜잭션 의사코드 그대로 구현. `lead.guard.ts`는 `CanActivate` + `TranslationsRepository.isLead`.
- **C4**: `CommentService`. 댓글은 상태 전이 없음. `review_comment` Contribution 기록.

## 관련

- [specs/m0-mvp.md §6 Proposal](../../specs/m0-mvp.md)
- [architecture/workflow-proposal.md](../workflow-proposal.md) — 상태 머신·Attribution 이중 기록 규칙
- [ADR-0003](0003-optimistic-locking.md) — `segment.version` optimistic locking
- [ADR-0005](0005-github-oauth-session.md) — SessionGuard·@CurrentUser 인프라
- [data-model.md](../data-model.md) — `proposals`, `proposal_comments`, `translation_revisions`, `contributions` 스키마
