# 외부 문서 링크 허브

![phase](https://img.shields.io/badge/phase-all-blue)

저장소 외부에 있는 기획·의사결정·PoC 문서의 절대 경로입니다. **다른 docs 파일은 이 파일을 경유해 원본을 찾아야 합니다** (중복 링크를 피하고, 경로가 바뀌면 이 한 곳만 갱신).

## 기획 & 전략 (정본)

| 문서 | 경로 | 역할 |
|---|---|---|
| 제품 기획서 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/poomgeul_기획서.md` | 비전·전략의 single source of truth. v0.4 |
| 기획서 변경 이력 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/CHANGELOG.md` | 기획서 자체의 변경 추적 |
| 스코프 결정 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/scope_decisions.md` | M0/M1/M2 축소·연기 이력 |

## PoC 워크스페이스

| 문서 | 경로 | 역할 |
|---|---|---|
| PoC 계획 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/gemini_flash_poc_plan.md` | Gemini Flash 품질 검증 계획 |
| PoC 실행 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/poc_workspace/poc_execution.md` | Step 1~6 실측 실행 |
| PoC 워크스페이스 README | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/poc_workspace/README.md` | 워크스페이스 안내 |
| Blind key | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/poc_workspace/blind_key.txt` | 라벨-모델 매핑 (평가 후 공개) |
| 붙여넣기 블록 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/poc_workspace/paste_ready_blocks.md` | PoC 실행 편의용 |

## 사용자 조사

| 문서 | 경로 | 역할 |
|---|---|---|
| 인터뷰 아웃리치 1차 | `/Users/bonghyeon/Documents/Claude/Projects/poomgeul/interview_outreach_batch1.md` | 페르소나 ② 인터뷰 섭외 |

## 외부 API & 메타데이터

| 자원 | URL |
|---|---|
| arXiv API | https://info.arxiv.org/help/api/index.html |
| Crossref REST API | https://api.crossref.org/ |
| DOAJ | https://doaj.org/ |
| Creative Commons 라이선스 | https://creativecommons.org/licenses/ |

## 원문 처리

| 자원 | URL |
|---|---|
| ar5iv (arXiv HTML) | https://ar5iv.labs.arxiv.org/ |
| GROBID | https://github.com/kermitt2/grobid |

## 레퍼런스 플랫폼

| 자원 | URL | 본 프로젝트와의 관계 |
|---|---|---|
| Weblate | https://weblate.org/ | 오픈소스 i18n — 철학 참고 |
| Wikisource | https://wikisource.org/ | 퍼블릭 도메인 — Phase 2 경쟁 |
| Yeeyan (译言网) | http://www.yeeyan.org/ | 가장 닮은 선례 (중앙집중형) |
| Standard Ebooks | https://standardebooks.org/ | Phase 2 참조 |
| GitLocalize | https://gitlocalize.com/ | PR 워크플로우 UX |
| LibreTranslate | https://libretranslate.com/ | 초벌 엔진 후보 (플러그인 어댑터) |

## 보존·인용

| 자원 | URL |
|---|---|
| Software Heritage | https://www.softwareheritage.org/ |
| Zenodo | https://zenodo.org/ |
| ORCID | https://orcid.org/ |

---

## 동기화 상태

- **기획서 v0.4 기준 이 저장소 반영일:** 2026-04-22
- 기획서가 v0.5 이상으로 갱신되면 본 저장소의 아래 문서들을 함께 점검하고 이 날짜를 업데이트:
  - [overview/vision.md](../overview/vision.md) (§1·3·7)
  - [overview/roadmap.md](../overview/roadmap.md) (§8.3·12)
  - [architecture/system-overview.md](../architecture/system-overview.md) (§9.1·9.3)
  - [architecture/data-model.md](../architecture/data-model.md) (§9.2)
  - [policy/licensing.md](../policy/licensing.md) (§10)
  - [policy/governance.md](../policy/governance.md) (§11)
  - [guides/korean-style-guide.md](../guides/korean-style-guide.md) (§9.6 정본)
