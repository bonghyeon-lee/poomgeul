# Changelog

본 파일은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식을 따릅니다.
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 적용하되, MVP 단계에서는 Phase 마일스톤(M0/M1/M2)을 상위 섹션으로 사용합니다.

> 제품 기획서 자체의 변경 이력은 별도 저장소의 `CHANGELOG.md`에서 관리됩니다. 여기에는 **코드·저장소 문서**의 변경만 기록합니다. 기획서 위치는 [docs/research/links.md](docs/research/links.md) 참조.

## [Unreleased]

### Added
- 초기 저장소 docs 스켈레톤 (`README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `docs/` 트리, `prompts/`, `.github/`).
- 기획서 v0.4 기반 M0/M1/M2 기능 명세, 아키텍처 문서, ADR 4건 초안.
- 한국어 번역 스타일 가이드(§9.6 전문 이관).

### Changed
- **Gemini Flash PoC 결과 반영 (2026-04-23).** L2 정성 평가(3섹션·3모델·블라인드)로 M0 메인 LLM을 Gemini 2.5 Flash로 확정.
  - L2 평균: α Flash **3.92** · β Haiku 3.25 · γ Sonnet **4.75**.
  - 분기 A′ 선택: Flash 메인 + Budget(Haiku)을 **가용성 폴백**으로만 유지, escalation 기본 타깃은 Sonnet.
  - 갱신 문서: `docs/guides/llm-integration.md`, `docs/architecture/decisions/0002-llm-provider-abstraction.md`, `docs/research/poc-gemini-flash.md`.
- **백엔드 스택 확정 (2026-04-23, ADR-0001).** NestJS + Drizzle ORM + pnpm + Node.js 24 LTS.
  - 프론트(Next.js 14·TS)와 언어 통일. Drizzle의 TS-first 스키마로 DTO/Entity 이중 정의 제거.
  - pgvector는 `drizzle-orm/pg` `vector` 타입 + raw SQL 혼용. Prisma 런타임 엔진 회피.
  - 타깃 디렉터리: `apps/{api,web}` + `packages/{db,types}` monorepo (pnpm workspace).
  - 갱신 문서: `docs/architecture/decisions/0001-backend-framework.md`, `docs/guides/dev-setup.md`, `docs/architecture/system-overview.md`, `docs/architecture/data-model.md`, `docs/architecture/decisions/0003-optimistic-locking.md`(의사코드), `docs/architecture/decisions/README.md`, `README.md`.

---

## [M0] — TBD (Phase 1 MVP)

> 단일 메인테이너 + 제안/리뷰/머지 워크플로우 + AI 초벌. 원문 1개 × 번역본 1개 구조.

### Planned
- GitHub OAuth 로그인
- arXiv URL/DOI 기반 CC BY 원문 임포트 + 라이선스 자동 검증
- 세그먼트 분할 (ar5iv HTML 1차 경로)
- AI 초벌 번역 (Gemini Flash 메인 / Claude Haiku 폴백 — PoC 결과에 따라 확정)
- 세그먼트 단위 웹 에디터 (optimistic locking)
- Proposal 워크플로우 (open → merged/rejected/withdrawn/stale)
- Attribution 블록 자동 생성
- 공개 URL: `poomgeul.org/source/{arxiv_id}/ko/{slug}`

---

## [M1] — TBD

> 다중 번역본 공존, 공동 메인테이너 활성화.

### Planned
- 같은 원문에 여러 번역본 공존 + `featured` 지정
- 공동 메인테이너 초대 플로우 (`TranslationCollaborator` 활성화)
- 프로필·기여 이력 페이지
- 모바일 읽기 뷰 (반응형)
- Attribution 정교화 (리드/협력자/제안자 구분)

---

## [M2] — TBD

> 용어집·TM·평판 티어·품질 메트릭.

### Planned
- 프로젝트별 용어집 + TM(pgvector 기반)
- 4-tier 평판 시스템 자동 승급
- 세그먼트 인라인 코멘트, 토론 스레드
- BLEU/COMET/chrF 자동 품질 메트릭
- BYO LLM API key 옵션

---

[Unreleased]: https://example.invalid/compare/v0.0.0...HEAD
