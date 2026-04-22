# 로드맵

![phase](https://img.shields.io/badge/phase-all-blue)

기획서 §8.3·§12 기반. 빌드 순서와 각 Phase의 수락 기준을 체크리스트로 정리합니다.

## 큰 그림

| Phase | 기간 (계획) | 목표 | 총 공수 |
|---|---|---|---|
| **Phase 0** | 2026 Q2 | 기획·PoC·시드 번역 5편 | 주 15h × 12주 ≈ 180h |
| **Phase 1 — M0** | 2026 Q3 초 | 진짜 MVP. 단일 메인테이너 + 제안/리뷰/머지 | 7~9주 (140~180h) |
| **Phase 1 — M1** | 2026 Q3~Q4 | 다중 번역본·공동 메인테이너 | +5~7주 |
| **Phase 1 — M2** | 2026 Q4 | 용어집·TM·평판 티어·품질 메트릭 | +6~8주 |
| **Phase 2** | 2027 H1 | 문학 베타(퍼블릭 도메인) + 두 번째 언어 페어 실험 | — |

> 페르소나 ③ 검증 게이트 통과해야 Phase 2 문학 진입 (기획서 §5.3).

---

## Phase 0 체크리스트

- [ ] 제품 기획서 v0.4 이상 확정
- [ ] Gemini Flash LLM PoC ([research/poc-gemini-flash.md](../research/poc-gemini-flash.md)) 완료
- [ ] 시드 번역 5편 작성 (CC BY arXiv 논문)
- [ ] 페르소나 ② 인터뷰 5명
- [ ] 스타일 가이드 v0.1 공개 ([guides/korean-style-guide.md](../guides/korean-style-guide.md))
- [ ] 저장소 docs 스켈레톤 (이 디렉토리)

## M0 체크리스트 (진짜 MVP)

> **한 문장 정의:** "CC BY arXiv 논문 URL을 붙여넣으면 → AI 초벌이 생성되고 → 리드 메인테이너가 세그먼트 단위로 교정하고, 로그인한 누구나 제안을 보낼 수 있으며 → 공개 URL로 공유할 수 있다."

상세 수락 기준은 [specs/m0-mvp.md](../specs/m0-mvp.md) 참조.

- [ ] GitHub OAuth 로그인
- [ ] arXiv URL/DOI 입력 → 라이선스 자동 검증 (arXiv API, Crossref, DOAJ)
- [ ] CC BY-ND / CC BY-NC-ND 등록 차단
- [ ] 세그먼트 분할 (ar5iv HTML 1차 경로, import 시점 1회 불변)
- [ ] AI 초벌 번역 (단일 LLM, 단일 프롬프트)
- [ ] 세그먼트 단위 웹 에디터 (optimistic locking)
- [ ] 단일 메인테이너 권한 (번역본 1개당 리드 1인 직접 편집)
- [ ] Proposal 워크플로우 (누구나 제안 → 리드가 승인/거절)
- [ ] Attribution 블록 자동 생성 (proposer/committer 분리)
- [ ] 공개 URL `poomgeul.org/source/{arxiv_id}/ko/{slug}`
- [ ] Schema pre-design: `TranslationCollaborator`, `Translation.forked_from_id`, `User.tier` 컬럼만 존재

### M0에서 의도적으로 제외한 것
- 다중 번역본 공존 → M1
- 공동 메인테이너 활성화 → M1 (스키마만 pre-design)
- 용어집·TM → M2
- 평판 자동 승급 → M2
- 인라인 댓글 → M2

## M1 체크리스트

상세는 [specs/m1-features.md](../specs/m1-features.md).

- [ ] 같은 원문에 여러 번역본 공존 ("새 번역본 만들기")
- [ ] `featured` 번역본 지정 (큐레이터 수동)
- [ ] 공동 메인테이너 초대 플로우 + `TranslationInvitation`
- [ ] `TranslationCollaborator.role` 분기 (lead / collaborator)
- [ ] 프로필·기여 이력 페이지 (`poomgeul.org/@username`)
- [ ] 모바일 읽기 뷰 (반응형 필수, 편집은 데스크톱 우선 유지)
- [ ] Attribution 정교화 (리드/협력자/제안자 구분)
- [ ] 평판 공식 계산 시작 (표시만, 자동 승급은 M2)

## M2 체크리스트

상세는 [specs/m2-features.md](../specs/m2-features.md).

- [ ] 프로젝트별 용어집 + 번역 시 자동 제안
- [ ] TM(Translation Memory) — pgvector 유사 세그먼트 재활용
- [ ] 4-tier 평판 자동 승급 (new → verified → maintainer → curator/admin)
- [ ] 세그먼트 인라인 코멘트, 토론 스레드
- [ ] BLEU/COMET/chrF 자동 품질 메트릭 (L1·L2 레이어)
- [ ] BYO LLM API key 옵션
- [ ] 번역본별 커스텀 프롬프트 허용

## Could Have / Won't Have

**Could Have (이후 여지):** 병렬 읽기 학습 모드, 공개 API, 묶음 제안(PR) 승인, 번역본 간 fork.

**Won't Have (이번 Phase 1):** 소프트웨어 i18n, 음성·영상, 현대 문학 팬번역, 데스크톱/네이티브 앱.

## 범위 결정 이력

Phase별 축소/연기 결정의 근거는 별도 `scope_decisions.md`([research/links.md](../research/links.md) 참조)에 추적됩니다. 변경이 생기면 이 로드맵과 `scope_decisions.md`를 함께 갱신합니다.
