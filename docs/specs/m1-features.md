# M1 기능 명세

![phase](https://img.shields.io/badge/phase-M1-yellow)

> M1은 "MVP 보강" 단계입니다. M0의 단일 메인테이너 구조를 풀어 **다중 번역본 공존·공동 메인테이너**를 활성화합니다. 기간 가정: +5~7주.

## 1. 다중 번역본 공존

**User Story** — 같은 arXiv 원문에 누구나 "새 번역본 만들기"로 자신의 번역본을 만들 수 있다. 독자는 원문 페이지에서 번역본 리스트를 보고 선택한다.

**Acceptance Criteria**
- [ ] `Translation` UNIQUE 제약 완화: `(source_id, target_lang)`당 여러 row 허용 (단, `slug`는 여전히 UNIQUE).
- [ ] 원문 페이지에 번역본 리스트 섹션. `featured` → 최근 `reviewed` → `draft` 순 정렬.
- [ ] "새 번역본 만들기" 플로우. 생성자가 자동 리드.
- [ ] 중복 번역 UX 게이트 (기획서 §9.5): 같은 원문에 진행 중인 번역본이 있으면 "이미 @maintainer가 번역 중입니다 — 제안으로 참여하시겠어요?" 안내.

**관련 엔티티** — `Translation` ([data-model.md#translation](../architecture/data-model.md#translation))

## 2. Featured 번역 지정

**User Story** — 큐레이터/어드민이 번역본 중 하나를 "featured"로 지정한다. 독자의 기본 진입점이 된다.

**Acceptance Criteria**
- [ ] 큐레이터 권한(코어팀 임명)만 `Translation.status = 'featured'` 전환 가능.
- [ ] 한 원문에 `featured`는 동시 1개까지(제약은 DB 트리거 또는 애플리케이션 레벨).
- [ ] 검색 결과·구조화 데이터(`rel=canonical`)가 featured를 가리킴.

## 3. 공동 메인테이너 초대

**User Story** — 리드 메인테이너는 `@username` 또는 이메일로 다른 기여자를 공동 메인테이너로 초대한다. 수락하면 직접 편집 권한이 부여된다.

**Acceptance Criteria**
- [ ] `TranslationInvitation` 활성화 — 토큰·만료 시간 발급.
- [ ] 수락 시 `TranslationCollaborator(role='collaborator')` row 생성.
- [ ] Collaborator는 직접 편집 가능, Proposal 승인 권한은 **리드만** 유지(M1).
- [ ] 공동 편집 시 optimistic locking 적용 (M0와 동일 메커니즘).
- [ ] 초대 revoke/만료 처리.

**관련 엔티티** — `TranslationCollaborator`, `TranslationInvitation`

## 4. 프로필·기여 이력

**User Story** — 사용자는 `/@username`에서 자신의 기여 이력을 본다. 외부(이력서·LinkedIn)에서 링크 가능한 영구 URL.

**Acceptance Criteria**
- [ ] 기여 통계: 번역 세그먼트 수, 승인률, 리뷰한 세그먼트 수, 메인테이너로 참여한 번역본 수.
- [ ] 최근 기여 타임라인 (`Contribution` 조회).
- [ ] featured 번역본 하이라이트.
- [ ] 전문 분야 태그: arXiv 분류 자동 + 수동.
- [ ] 공개 범위 설정: 이름 공개 / 이메일 비공개 / 기여 이력 공개 토글.

## 5. 모바일 읽기 뷰

**User Story** — 모바일 사용자가 번역본 페이지를 편하게 읽는다. 편집은 데스크톱 우선 유지.

**Acceptance Criteria**
- [ ] 반응형 레이아웃. 세그먼트·각주·참고문헌이 모바일에서 가독성 유지.
- [ ] 읽기 + 코멘트 경로는 동작.
- [ ] 편집·제안 UX는 "데스크톱에서 열어주세요" 안내.

## 6. Attribution 정교화

**User Story** — Attribution 블록이 리드/협력자/제안자를 분리해 표시한다.

**Acceptance Criteria**
- [ ] 페이지 블록 3개 섹션: 리드 1명, 공동 메인테이너 N명, 주요 제안자 N명(머지 수 기준).
- [ ] 크레딧 자동 업데이트(revision 머지 시점).

## 7. 평판 공식 계산 시작 (표시만)

M2 자동 승급을 위한 **데이터 수집** 목적. 사용자 티어는 여전히 `new`로 고정.

**Acceptance Criteria**
- [ ] 기획서 §11.6 공식으로 사용자별 `score` 계산·캐시.
- [ ] 프로필에 점수 노출 여부는 설정 가능(기본 off).

---

## Pre-design 덕에 간단해지는 부분

- `TranslationCollaborator` 테이블이 M0에 이미 존재 → **컬럼 추가 없이 row 삽입**만으로 활성화.
- `User.tier` 컬럼이 존재 → M1에서는 계산만 하고 `new` 유지.
- `Translation.forked_from_id` 존재 → M1에서는 여전히 null, M2+ fork 시 연결.

## 의도적으로 M1에 포함하지 않는 것

- 용어집/TM (M2)
- 인라인 댓글 (M2)
- BYO LLM key (M2)
- 자동 품질 메트릭 (M2)
