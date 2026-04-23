# M0 MVP 기능 명세

![phase](https://img.shields.io/badge/phase-M0-green)

> **한 문장 정의:** "CC BY arXiv 논문 URL을 붙여넣으면 → AI 초벌이 생성되고 → 리드 메인테이너가 세그먼트 단위로 교정하고, 로그인한 누구나 제안을 보낼 수 있으며 → 공개 URL로 공유할 수 있다."

각 기능 영역은 다음 4개 필드로 구성됩니다.
- **User Story** — 사용자 관점의 흐름
- **Acceptance Criteria** — 완료 판정 기준
- **관련 엔티티** — [data-model.md](../architecture/data-model.md)의 어디를 건드리는가
- **관련 결정** — 근거 ADR/가이드

---

## 1. 인증 (GitHub OAuth)

**User Story** — 사용자는 "GitHub으로 로그인" 버튼으로 계정을 만들고 로그인한다. 제안·편집은 로그인 후에만 가능하다. 읽기는 익명 허용.

**Acceptance Criteria**
- [ ] GitHub OAuth 2.0 flow로 로그인/가입이 한 번의 동의로 처리됨.
- [ ] 첫 로그인 시 `User` row 생성(`email`, `display_name`, `github_handle`).
- [ ] 세션은 secure, httpOnly 쿠키.
- [ ] 로그아웃 시 서버 세션 무효화 + 쿠키 제거.
- [ ] CSRF 방어(state param + SameSite=Lax 이상).

**관련 엔티티** — `User` ([data-model.md#user](../architecture/data-model.md#user))
**관련 결정** — [ADR-0005 GitHub OAuth + 세션](../architecture/decisions/0005-github-oauth-session.md), [policy/licensing.md §10.5 개인정보](../policy/licensing.md)

---

## 2. 원문 Import (arXiv URL/DOI)

**User Story** — 리드 후보 사용자가 헤더 검색창에 `2301.12345` 또는 arXiv URL을 붙여넣으면, 플랫폼이 라이선스를 자동 검증하고 등록 가능 여부를 즉시 알려준다.

**Acceptance Criteria**
- [ ] arXiv ID / arXiv URL / DOI 3가지 입력 형태 지원.
- [ ] **라이선스 자동 조회**: arXiv API / Crossref / DOAJ.
- [ ] **허용 라이선스만 등록 성공**: CC BY, CC BY-SA, 퍼블릭 도메인. CC BY-ND / CC BY-NC-ND는 등록 차단 + 안내.
- [ ] CC BY-SA 원문은 번역본 라이선스를 **CC BY-SA로 자동 고정**.
- [ ] 같은 `(attribution_source, source_version)`은 중복 등록 불가.
- [ ] 등록 성공 시 `Source` + `Segment[]` 생성 (세그먼트 분할은 #3에서).

**관련 엔티티** — `Source`, `Segment`
**관련 결정** — [policy/licensing.md](../policy/licensing.md), [ADR-0004 원문 파서](../architecture/decisions/0004-source-parser.md), [guides/source-import.md](../guides/source-import.md)

---

## 3. 세그먼트 분할 (ar5iv HTML)

**User Story** — 원문 import 시점에 본문이 문장 단위로 자동 분할되어 `Segment` row들이 생성된다. 사용자에게는 "분할 완료, 총 N개 문장"으로 표시.

**Acceptance Criteria**
- [ ] ar5iv HTML을 fetch하여 파싱.
- [ ] 본문 문단 → 문장 단위 분할. `Segment.kind='body'`.
- [ ] 인라인 수식 `$...$`은 문장 경계로 오인하지 않음(전처리).
- [ ] 블록 수식 `\begin{equation}...`은 별개 세그먼트(원문 그대로, 번역 안 함). 캡션만 추가 세그먼트.
- [ ] 그림/표 이미지는 번역 대상 아님. 캡션·표 내 텍스트만 세그먼트화.
- [ ] 참고문헌은 `kind='reference'`로 분류, 번역 진행도 계산에서 제외.
- [ ] 각주는 `kind='footnote'`, 본문과 별도 레인.
- [ ] **import 시점 1회 불변** — `Segment.original_text` 수정 API 없음.

**관련 엔티티** — `Segment` ([data-model.md#segment](../architecture/data-model.md#segment))
**관련 결정** — [ADR-0004](../architecture/decisions/0004-source-parser.md), [guides/source-import.md](../guides/source-import.md)

---

## 4. AI 초벌 번역

**User Story** — 리드가 "AI 초벌 생성" 버튼을 누르면 세그먼트별로 LLM 번역이 생성된다. 각 세그먼트에는 "AI draft" 라벨이 표시된다.

**Acceptance Criteria**
- [ ] 단일 LLM 모델(M0 메인 경로)로 세그먼트별 번역 생성. 모델은 [guides/llm-integration.md](../guides/llm-integration.md)의 Free tier 기본값.
- [ ] 단일 고정 프롬프트 사용: [prompts/translate.en-ko.v1.md](../../prompts/translate.en-ko.v1.md).
- [ ] 결과는 `TranslationSegment.ai_draft_text` + `ai_draft_source` (`{model, prompt_hash, version}`)에 보존.
- [ ] 초벌은 `TranslationSegment.text`에도 복사되고 `status='unreviewed'`.
- [ ] 실패 시 폴백 모델 자동 시도 ([ADR-0002 Cascade](../architecture/decisions/0002-llm-provider-abstraction.md)).
- [ ] 배치 토큰·비용·지연 시간 로그가 남음.
- [ ] 무료 tier 데이터 범주 제한(기여자 편집 내용 전송 금지) 준수 ([policy/licensing.md](../policy/licensing.md)).

**관련 엔티티** — `TranslationSegment`
**관련 결정** — [ADR-0002](../architecture/decisions/0002-llm-provider-abstraction.md), [guides/llm-integration.md](../guides/llm-integration.md)

---

## 5. 세그먼트 단위 웹 에디터

**User Story** — 리드 메인테이너는 원문·번역 병렬 뷰에서 키보드 단축키로 빠르게 편집한다. 저장은 세그먼트 단위, 히스토리가 남는다.

**Acceptance Criteria**
- [ ] 원문 좌/번역 우 병렬 뷰.
- [ ] 세그먼트 선택·편집·저장이 모두 키보드 단축키로 가능.
- [ ] 저장 시 **Optimistic Locking** 체크 ([ADR-0003](../architecture/decisions/0003-optimistic-locking.md)). 실패 시 현재 버전 표시 + 재작성 유도.
- [ ] `TranslationRevision` 자동 생성. `commit_message`는 선택.
- [ ] AI draft 대비 변경 여부가 시각적으로 표시됨 ("AI draft" → "Human edited" 라벨).
- [ ] 수식·코드 블록은 편집 UI에서 **잠금** 표시(원문 그대로 보존 확인).

**관련 엔티티** — `TranslationSegment`, `TranslationRevision`
**관련 결정** — [ADR-0003](../architecture/decisions/0003-optimistic-locking.md), [guides/korean-style-guide.md](../guides/korean-style-guide.md)

---

## 6. Proposal 워크플로우

**User Story** — 로그인 사용자는 번역 세그먼트 옆 "제안하기" 버튼으로 수정안을 보낸다. 리드는 제안을 승인/거절/댓글한다. 승인 시 세그먼트가 자동 업데이트되고 attribution은 proposer에게 유지된다.

**Acceptance Criteria**
- [ ] `POST /proposals` — `{translation_id, segment_id, base_segment_version, proposed_text, reason?}`.
- [ ] 같은 사용자·같은 세그먼트에 동시 `open` 제안 1개 제한.
- [ ] 리드 액션: `Approve` / `Reject` / `Approve with edits`는 M0에서 (reject → 직접 편집) 2단계로.
- [ ] Approve 시 optimistic locking 체크. 불일치 시 409 + 리베이스 유도.
- [ ] Proposal 댓글 스레드 (`ProposalComment`). inline 앵커는 M2.
- [ ] 30일 무응답 제안은 배치 작업으로 `stale` 자동 전환.
- [ ] 리드는 번역본 단위로 특정 사용자의 제안 차단 가능.
- [ ] 상태 머신·머지 절차 전체는 [workflow-proposal.md](../architecture/workflow-proposal.md).

**관련 엔티티** — `Proposal`, `ProposalComment`, `TranslationRevision`, `Contribution`
**관련 결정** — [workflow-proposal.md](../architecture/workflow-proposal.md), [ADR-0003](../architecture/decisions/0003-optimistic-locking.md)

---

## 7. Attribution 블록 자동 생성

**User Story** — 번역본 페이지 상단/하단에 출처·라이선스·기여자 블록이 자동 생성되어 표시된다. 독자는 이 블록으로 원저자·라이선스·수정 여부를 확인할 수 있다.

**Acceptance Criteria**
- [ ] 페이지 헤더/푸터에 attribution 블록.
- [ ] 포함 정보: 원저자, 원문 URL, 원문 라이선스 뱃지, 번역본 라이선스, 리드 메인테이너, 수정 여부(`Adapted from ...`).
- [ ] Proposal 머지가 반영된 revision마다 proposer 크레딧이 누적 집계(M0는 페이지 수준 리스트, 세그먼트별 블레임은 M2).
- [ ] CC BY-SA인 경우 ShareAlike 조건 명시.
- [ ] HTML·copy-paste 친화 형식(예: 인용 문자열을 한 번에 복사할 수 있는 버튼).

**관련 엔티티** — `Source`, `Translation`, `Contribution`
**관련 결정** — [policy/attribution.md](../policy/attribution.md), [policy/licensing.md](../policy/licensing.md)

---

## 8. 공개 URL

**User Story** — 리드가 번역본을 `draft` → `reviewed`로 변경하면 영구 URL로 공유 가능해진다. 독자는 로그인 없이 읽기 가능.

**Acceptance Criteria**
- [ ] URL: `poomgeul.org/source/{arxiv_id}/ko/{translation_slug}` ([guides/source-import.md](../guides/source-import.md) SEO 규약).
- [ ] `Translation.status` = `draft` / `reviewed` / `featured`. M0는 `featured`까지 수동 가능(큐레이터가 있을 경우).
- [ ] `reviewed`/`featured` 번역본은 **공개 색인 허용**; `draft`은 `noindex`.
- [ ] Schema.org `ScholarlyArticle` + `TranslationOfWork` 구조화 데이터.
- [ ] `rel=canonical`이 Featured 번역본을 가리킴(M0는 번역본 1개/원문이므로 자기 자신).

**관련 엔티티** — `Translation`
**관련 결정** — 기획서 §9.5 발견성·SEO

---

## M0에서 의도적으로 제외된 것 (다시 확인)

| 기능 | 상태 | 대체 |
|---|---|---|
| 다중 번역본 공존 | M1 | 원문 1개당 번역본 1개만 |
| 공동 메인테이너 활성화 | M1 | 스키마는 pre-design. `TranslationCollaborator`에 `role='lead'` 1 row만 |
| 다중 LLM·BYO key | M2 | 단일 LLM + 폴백 |
| 용어집 / TM | M2 | 프롬프트 고정 |
| 평판 자동 승급 | M2 | 모두 `tier='new'` |
| 라인 단위 inline 댓글 | M2 | Proposal 전체 ProposalComment |
| 모바일 편집 UX | Phase 3+ | 데스크톱 우선. 모바일 "읽기+코멘트"는 M1 |
| 번역본 간 fork | M2+ | `forked_from_id`는 항상 null |

## M0 수락 지표 (완료 판정)

- [ ] 시드 번역 5편이 M0 기능만으로 end-to-end 통과.
- [ ] 외부 베타 테스터 10~20명이 로그인·읽기·제안을 막힘 없이 수행.
- [ ] 라이선스 위반 등록 시도가 100% 차단됨(수동 테스트 10건).
- [ ] LLM 호출 실패율 < 5%, 평균 초벌 생성 시간 < 세그먼트 30개당 60초.

자세한 KPI와 성공 지표는 기획서 §16 참조.
