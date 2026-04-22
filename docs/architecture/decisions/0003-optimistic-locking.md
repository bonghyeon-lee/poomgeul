# 0003. 동시 편집 충돌 방어 — `segment.version` Optimistic Locking

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** @bonghyeon

## Context

M0에서 세그먼트는 세 경로로 동시에 변경될 수 있다.

1. 리드 메인테이너의 직접 편집
2. Proposal 머지
3. (M1+) 공동 메인테이너의 편집

사용자에게 Git 개념(브랜치·리베이스)을 노출하지 않으면서도, 덮어쓰기 사고를 막아야 한다. 동시에 자연어는 자동 머지가 불가능하다는 기획서 §6.3 원칙이 있다.

## Decision

`TranslationSegment.version` (monotonic int) 컬럼으로 **Optimistic Locking** 적용.

### 세부 규칙
- Proposal 생성 시 `base_segment_version` 스냅샷.
- 머지/직접 편집 시 서버가 `version` 일치 여부 검사. 불일치 시 **409 Conflict** + "리베이스 필요" 메시지.
- **자동 리베이스 없음.** 제안자가 현재 버전 기준으로 다시 작성.
- HTTP 레벨에서는 `If-Match: <version>` 헤더로 일관된 검사.

## Alternatives considered

| 옵션 | 탈락 이유 |
|---|---|
| **Pessimistic Lock (세그먼트 잠금)** | 대기 UX가 공유 에디터에 부적합. 잠금 누수·데드락 관리 비용. |
| **CRDT (자동 머지)** | 자연어 텍스트에서 의미 보존 보장 불가. 기획서 §6.3 원칙에 반함. |
| **3-way merge (Git diff)** | 세그먼트가 짧은 한국어·영어 혼합 문장에서 ill-defined. UX 복잡. |
| **Last-write-wins** | 기여가 조용히 덮어써짐. 커뮤니티 신뢰 훼손. |

## Consequences

### 긍정
- 구현이 단순하고 예측 가능.
- Proposal 상태 머신과 자연스럽게 결합.
- 사용자는 "이 세그먼트는 그 사이 변경되었습니다" 한 줄만 이해하면 됨.

### 부정
- 트래픽이 많은 세그먼트에서 반복 409가 발생 가능. **완화책:** UI가 현재 본문 diff를 즉시 보여주어 proposer가 5~10초 안에 새 제안을 제출할 수 있게 함.
- 리베이스가 수작업 → proposer 이탈 리스크. **모니터링:** M0 6주차부터 409 발생률을 메트릭으로 수집, 임계치 초과 시 UX 개선.

### 확장
- M2 인라인 댓글(세그먼트보다 작은 단위)은 버전 체크 대상 아님.
- M2 TM 도입 시 TM 재사용은 승인 흐름과 분리된 경로로 설계(새 Proposal 생성).

## 구현 참고

```python
# pseudo code (FastAPI 기준)
@app.post("/proposals/{id}/approve")
def approve(id: UUID, lead=Depends(require_lead)):
    p = get(Proposal, id, status='open')
    ts = get(TranslationSegment, p.translation_id, p.segment_id)
    if ts.version != p.base_segment_version:
        raise HTTPException(409, detail={
            "code": "rebase_required",
            "current_version": ts.version,
            "current_text": ts.text,
        })
    with tx():
        ts.text = p.proposed_text
        ts.version += 1
        ts.last_editor_id = p.proposer_id
        ts.last_edited_at = now()
        ts.status = 'approved'
        create(TranslationRevision, ...)
        p.status = 'merged'
        p.resolved_by = lead.id
        p.resolved_at = now()
```

## 관련

- [workflow-proposal.md](../workflow-proposal.md) — 전체 상태 머신
- [data-model.md](../data-model.md) — `TranslationSegment.version`
