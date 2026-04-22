# M2 기능 명세

![phase](https://img.shields.io/badge/phase-M2-lightgrey)

> M2는 "커뮤니티 성숙" 단계. 용어집·TM·평판·품질 메트릭·인라인 댓글을 활성화합니다. 기간 가정: +6~8주.

## 1. 프로젝트별 용어집 (Glossary)

**User Story** — 리드 메인테이너가 번역본 단위로 용어집을 관리한다. 번역 시점에 용어집이 프롬프트에 주입되어 일관된 번역을 돕는다.

**Acceptance Criteria**
- [ ] `GlossaryEntry` 활성화: `(source_id or project_id, term, translation, definition)`.
- [ ] 편집 UI에서 선택 텍스트 → 용어집 추가.
- [ ] AI 재생성 시 프롬프트에 용어집 주입.
- [ ] 번역본 간 공유/포크 옵션.

## 2. Translation Memory (TM)

**User Story** — 유사 세그먼트의 과거 승인 번역을 제안받는다.

**Acceptance Criteria**
- [ ] `TMUnit` 활성화 — 원문·번역본 쌍 + 임베딩(pgvector).
- [ ] 세그먼트 편집 시 유사도 상위 N개 TMUnit 표시.
- [ ] 재사용 시 attribution이 원 기여자에게 연결.

## 3. 4-tier 평판 자동 승급

기획서 §11.4. M1에서 계산·표시만 한 공식으로 자동 승급.

**Acceptance Criteria**
- [ ] `User.tier` 자동 업데이트: `new` → `verified` (score ≥ 50) → `maintainer` (score ≥ 500 + 커뮤니티 선출/코어팀 승인).
- [ ] 권한 분기: `verified`는 **해당 번역본에 한해** 제안 없이 직접 commit 가능.
- [ ] 승급 알림 + 커뮤니티 공지.
- [ ] 악용 탐지 휴리스틱 (대량 저품질 제안 차단).

## 4. 세그먼트 인라인 코멘트

**User Story** — 독자·기여자가 세그먼트 특정 부분에 앵커된 댓글을 남긴다.

**Acceptance Criteria**
- [ ] `ProposalComment` 또는 별도 `SegmentAnnotation`에 `anchor(start, end)` 필드 추가.
- [ ] 에디터 UI에서 드래그 → 댓글.
- [ ] 토론 스레드 (threaded replies).

## 5. 자동 품질 메트릭 (L1)

기획서 §19.3 L1 레이어.

**Acceptance Criteria**
- [ ] BLEU / COMET / chrF 계산 파이프라인.
- [ ] 번역본 대시보드에 "품질 지표 추세" 표시.
- [ ] 원문 대비 편집 거리(Edit Distance) 집계 → AI 초벌 품질 지속 모니터링.

## 6. BYO LLM API key

**User Story** — 기여자가 자신의 OpenAI/Anthropic/Google API 키를 등록해 사용한다.

**Acceptance Criteria**
- [ ] 설정 페이지에서 키 등록 (암호화 저장).
- [ ] 개인 키 사용 시 플랫폼은 요금을 부담하지 않음.
- [ ] 키 등록 사용자는 기본 Free tier 대신 본인 모델로 초벌 생성.
- [ ] 민감 데이터 범주([policy/licensing.md §10.5](../policy/licensing.md)) 송신 금지 정책은 동일 적용.

## 7. 번역본별 커스텀 프롬프트

**User Story** — 리드 메인테이너가 번역본의 system instruction을 커스터마이즈한다(기본은 `prompts/translate.en-ko.v1.md`).

**Acceptance Criteria**
- [ ] 기본 프롬프트 fork → 번역본 단위 저장.
- [ ] 프롬프트 diff 표시.
- [ ] 기여자에게 "이 번역본은 커스텀 프롬프트를 사용합니다" 고지.

---

## 그 외 개선 (M2 backlog 후보)

- 기여 증명서(PDF) 자동 발급 (기획서 §11.6)
- ORCID 푸시 연동
- 번역 진행도·활동 RSS 피드 개선
- 랜딩 페이지 발견 섹션 고도화 ("최근 번역된 논문" 등)

## Phase 3+ 트리거 ([scope_decisions.md](../research/links.md) 참조)

다음 지표에 도달하기 전까지는 풀타임 기능(엔터프라이즈, 네이티브 앱)을 추진하지 않습니다.

- MAU 2,000+
- 월 스폰서 $500+
