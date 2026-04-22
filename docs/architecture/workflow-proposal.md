# Proposal 워크플로우

![phase](https://img.shields.io/badge/phase-M0%2B-green)

기획서 §11.3을 구현 관점의 상태 머신·동시성 규칙·UX 경로로 정리합니다.

## 핵심 원칙

> **"누구나 읽고, 누구나 제안하고, 메인테이너가 머지한다."** — M0 최소 거버넌스의 전부.

- Git PR의 축소판. 단, 브랜치/리베이스/충돌 해결 같은 Git 개념은 사용자에게 노출하지 않음.
- 작업 단위는 **세그먼트 단위 Proposal**. 묶음 제안(PR 단위)은 Could Have.
- **Attribution 이중 기록:** `proposer_id`(author) + `resolved_by`(committer). 머지되어도 proposer의 기여는 보존.

## 상태 머신

```
                   ┌────────────────────────────┐
                   │                            │
                   ▼                            │
        ┌────────────────┐                      │
[create]─▶│     open      │───[withdraw by proposer]─▶ withdrawn ─[final]
        └───┬─────────┬──┘
            │         │
 [approve]  │         │  [reject]
            │         │
            ▼         ▼
        ┌─────────┐ ┌──────────┐
        │ merged  │ │ rejected │
        └─────────┘ └──────────┘
             │            │
             └─── final ──┘

        open (30일+ 무응답) ──[auto]──▶ stale ──[resubmit]──▶ 새 Proposal
```

### 상태 정의

| 상태 | 의미 | 전이 조건 | 전이 주체 |
|---|---|---|---|
| `open` | 기본. 리드 메인테이너의 액션 대기 | 생성 시 | proposer |
| `merged` | 승인되어 세그먼트에 반영 | `approve` | 리드 메인테이너 |
| `rejected` | 거절. 히스토리 유지, 재제출 가능 | `reject` | 리드 메인테이너 |
| `withdrawn` | proposer가 철회 | `withdraw` | proposer |
| `stale` | 30일 이상 응답 없음. 피드 노이즈 제거용 | 배치 작업(auto) | system |

> `stale` → `open` 복구는 없음. 기여자가 다시 제출하면 새 Proposal 생성.

## 머지 절차 (승인 흐름)

```
1. (precondition) Proposal.status = 'open'
2. server: current_ts = TranslationSegment.version
3. if Proposal.base_segment_version != current_ts:
     return 409 Conflict
            + message "이 세그먼트는 그 사이 변경되었습니다 — 리베이스하시겠어요?"
     (M0는 자동 리베이스 안 함. proposer가 현재 버전 기준으로 다시 작성)
4. transaction:
     TranslationSegment.text       = proposal.proposed_text
     TranslationSegment.version    += 1
     TranslationSegment.last_editor_id = proposal.proposer_id  // committer는 별도
     TranslationSegment.last_edited_at = now()
     TranslationSegment.status     = 'approved'
     INSERT TranslationRevision { author_id=proposer, merged_proposal_id=proposal.id, snapshot=... }
     proposal.status      = 'merged'
     proposal.resolved_by = lead.id
     proposal.resolved_at = now()
     Contribution { user=proposer, event='proposal_merge', ... }
5. publish event (for 프로필·평판 집계)
```

> `TranslationSegment.last_editor_id`는 author(=proposer) 저장. committer는 Proposal·Revision을 통해 추적. Git의 author/committer 분리와 같은 의도.

## 리드 메인테이너의 직접 편집

리드는 Proposal을 거치지 않고 `TranslationSegment`를 직접 수정 가능.

```
PATCH /translations/{tid}/segments/{sid}
  If-Match: <expected_version>
  { text: "...", commit_message: "..." }
```

- 요청 헤더 `If-Match`로 optimistic locking 체크. 불일치 시 409.
- `TranslationRevision` 생성 시 `merged_proposal_id = NULL`, `author_id = lead.id`.
- 소수 개인이 꾸준히 작업하는 시나리오(예: 대학원생 혼자 논문 번역)에서는 제안 큐가 비어 있는 경우가 일반적이므로 강제 PR 모델을 요구하지 않음.

## 동시성·충돌 방어

**Optimistic Locking — 세그먼트 `version` 컬럼**

- 제안 작성 시 `base_segment_version`을 저장.
- 머지/직접 편집 시 현재 `version`과 비교.
- 자연어 자동 머지는 불가능하다는 원칙(기획서 §6.3)에 따라 **자동 리베이스 없음**.

**스팸·저품질 방어 (M0 최소 장치)**

| 장치 | 구현 |
|---|---|
| 익명 차단 | GitHub OAuth 가입 필수 |
| 같은 세그먼트 동시 제안 수 제한 | 한 사용자당 `open` 제안 1개 |
| 사용자 단위 차단 | 리드가 "이 번역본에서 제안 차단" 가능 |
| stale 자동 전환 | 배치 작업이 30일 이상 `open` → `stale` |

정교한 rate limit·자동 품질 점수는 M2+.

## UI 경로 (M0)

1. **"제안하기" 버튼** — 번역 세그먼트 옆. 로그인 필요.
2. **제안 패널** — 번역본 우측 drawer. "열린 제안 N / 머지된 제안 M".
3. **제안 상세** — `proposed_text` diff (원문·현재·제안 3열), `reason`, 댓글 스레드(`ProposalComment`).
4. **리드 액션** — `Approve` / `Reject` / `Approve with edits`. "Approve with edits"는 서버에서 새 `merged` Proposal로 처리하거나 리드가 별도 직접 편집으로 기록. M0 결정: **"수정 후 승인"은 2단계(reject → 리드 직접 편집)로 표현**해 단순화.
5. **Withdraw** — proposer만. `open` 상태에서만 가능.

## M0에서 의도적으로 제외

- 다중 메인테이너 / 공동 소유 → M1
- 투표·민주적 승인 → Phase 3+
- 제안 간 머지/분기 → M2+
- 라인 단위 inline 댓글 → M2 (`ProposalComment.anchor` 필드 추가로 확장)
- 4단계 티어 자동 승급 → M2

## 이벤트 발행 (집계용)

머지·거절·withdraw·생성 시 `Contribution` row 생성. 이후 프로필·평판 공식(M1+ 계산 시작, M2 자동 승급)에서 소비.

| 이벤트 | 트리거 | 생성되는 Contribution |
|---|---|---|
| Proposal 생성 | POST /proposals | `proposal_submit` |
| Proposal 머지 | Approve 성공 | `proposal_merge` (+ `segment_edit` 간주 가능) |
| 리드 직접 편집 | 직접 PATCH | `segment_edit` |
| ProposalComment 작성 | POST /proposals/{id}/comments | `review_comment` |

## 관련 문서

- [data-model.md](data-model.md) — 스키마 세부
- [policy/attribution.md](../policy/attribution.md) — Attribution 규칙
- [policy/governance.md](../policy/governance.md) — 권한·차단·계승
