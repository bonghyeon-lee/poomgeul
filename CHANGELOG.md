# Changelog

본 파일은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식을 따릅니다.
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 적용하되, MVP 단계에서는 Phase 마일스톤(M0/M1/M2)을 상위 섹션으로 사용합니다.

> 제품 기획서 자체의 변경 이력은 별도 저장소의 `CHANGELOG.md`에서 관리됩니다. 여기에는 **코드·저장소 문서**의 변경만 기록합니다. 기획서 위치는 [docs/research/links.md](docs/research/links.md) 참조.

## [Unreleased]

### Changed
- **apps/api TypeScript Project References (2026-04-23).** VS Code TS Server가 `*.spec.ts`에서 `Cannot find name 'describe'`로 보고하던 이슈 해결.
  - `apps/api/tsconfig.json`을 솔루션(루트)로 전환 — `references: [build, test]`만 가짐.
  - `tsconfig.build.json` 신설 — 프로덕션 빌드 (`*.spec.ts` exclude, `composite: true`).
  - `tsconfig.test.json` composite 대응 — base에서 직접 extends, jest 타입 포함, src/test 모두 include.
  - 스크립트: `build`는 `tsc -b tsconfig.build.json`, `typecheck`는 `tsc -b`(솔루션 모드).
  - `.gitignore`에 `.tsbuildinfo*`, `dist-test/` 추가.
  - VS Code는 솔루션 tsconfig를 따라 spec 파일을 test 프로젝트로 인식, IntelliSense·type-check 정상.

### Added
- **`source/input` 첫 도메인 함수 (2026-04-23, TDD).** `apps/api/src/modules/source/input.ts`에 `parseSourceInput`/`SourceInputError` 도입.
  - 지원 입력: 현대 arXiv ID(`2504.20451`, `2504.20451v2`), `arXiv:` 접두, arXiv URL(abs/pdf/html · arxiv.org · ar5iv.labs.arxiv.org · http/https · 쿼리·프래그먼트 무시), DOI(순수/`doi:` 접두/`doi.org` URL, 대소문자 정규화).
  - 거부: 빈/공백 입력(`empty`), 구형 arXiv(`cs.AI/0601001`), 임의 URL/문자열(`unsupported`).
  - 외부 의존 0, 단위 테스트 22건. Red-Green-Refactor 사이클 6회로 점진 작성 — 흐름은 [docs/guides/testing.md §실전 예시](docs/guides/testing.md) 참조.
- **Web 테스트 기반 (2026-04-23).** `apps/web`에 Vitest + React Testing Library + jsdom, Playwright(chromium) 도입.
  - Vitest: `src/**/*.test.{ts,tsx}` 컴포넌트/유닛 레이어. `vitest.config.ts` + `src/test/setup.ts`(`@testing-library/jest-dom/vitest` 로드). `test` / `test:watch` / `test:coverage` 스크립트.
  - Playwright: `e2e/**/*.spec.ts` 브라우저 레이어. `playwright.config.ts`의 `webServer`가 `pnpm dev`를 자동 기동. `test:e2e` / `test:e2e:ui` 스크립트.
  - tsconfig에 `vitest/globals` 타입, `e2e/**/*.ts` include. ESLint에 `.test.tsx`와 `apps/web/e2e/**` 테스트 규칙 완화 블록.
  - CI: `quality` 잡에 web Vitest 추가, 새 `web-e2e` 잡(`actions/cache`로 `~/.cache/ms-playwright` 캐시, 실패 시 report artifact 업로드).
  - `.gitignore`에 `playwright-report/`, `test-results/`, `.vitest-cache/`.
  - 규약 [docs/guides/testing.md](docs/guides/testing.md)에 Web/Playwright 섹션 추가.
- **TDD 기반 정비 (2026-04-23).** API 테스트 레이어 확립 + DB 통합 테스트 인프라.
  - `apps/api`에 Jest preset(ESM) 기반 unit/integration/e2e 3계층. `test:unit`·`test:integration`·`test:e2e`·`test:watch` 스크립트 추가.
  - `@nestjs/testing`로 `TestingModule` + `supertest` e2e 경로. HealthController 유닛 spec + `GET /healthz` e2e 샘플.
  - `apps/api/test/db/test-db.ts`: `withRollback`(공유 `poomgeul_test` DB + Drizzle 트랜잭션 롤백)과 `startIsolatedContainer`(Testcontainers `pgvector/pg16` per-suite) 두 전략.
  - `@poomgeul/db`에 `close()` 메서드 추가(커넥션 정리) + `drizzle-orm` query 헬퍼(`and/eq/or/...`) re-export로 duplicate-instance 타입 충돌 방지.
  - `apps/api` 프로덕션 tsconfig는 `src/**/*.spec.ts` 제외, 테스트 전용 `tsconfig.test.json`으로 typecheck.
  - CI: `quality` 잡에 `test:unit` 포함, `migrate-and-smoke` 잡이 `poomgeul_test` DB를 생성·migrate 후 `test:integration` + `test:e2e`를 먼저 돌리고 smoke curl로 마무리.
  - 규약 문서 [docs/guides/testing.md](docs/guides/testing.md) 추가.
- 초기 저장소 docs 스켈레톤 (`README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `docs/` 트리, `prompts/`, `.github/`).
- 기획서 v0.4 기반 M0/M1/M2 기능 명세, 아키텍처 문서, ADR 4건 초안.
- 한국어 번역 스타일 가이드(§9.6 전문 이관).
- **ESLint + Prettier 설정 (2026-04-23).** 루트 단일 flat config에서 전 워크스페이스 관리.
  - `eslint.config.mjs`: `@eslint/js` recommended + `typescript-eslint` v8 recommended + `@next/eslint-plugin-next` (recommended + core-web-vitals, `settings.next.rootDir="apps/web/"`) + `eslint-config-prettier` (포매팅은 Prettier에 위임).
  - `prettier.config.mjs`: printWidth 100, semi true, double quote, trailing comma all, LF.
  - 마크다운은 `.prettierignore`로 제외 (표·다이어그램 보존).
  - `.editorconfig` 추가 — LF·UTF-8·2-space.
  - 개별 워크스페이스의 `lint`/`web test` placeholder 제거, 루트 `pnpm lint` · `pnpm format:check`로 통합.
  - CI `quality` 잡의 placeholder를 실제 `pnpm lint` + `pnpm format:check`로 교체.
- **GitHub Actions CI 파이프라인 (2026-04-23).** `.github/workflows/ci.yml`에 두 잡 구성.
  - `quality`: checkout → pnpm/setup-node(v4/v6) + `.nvmrc` → `pnpm install --frozen-lockfile` → typecheck · lint(no-op) · test.
  - `migrate-and-smoke`: `pgvector/pgvector:pg16` service → `pnpm --filter @poomgeul/db migrate` → API 백그라운드 부팅 → `/healthz` + `/api/docs-json` 검증.
  - lint·web test는 placeholder로 두되 CI 체크 표면은 유지 (TODO는 ci.yml·dev-setup.md에 명시).
  - api jest config를 `jest.config.ts` → `jest.config.cjs`로 이동(`ts-node` 의존 회피).
- **monorepo 부트스트랩 (2026-04-23).** `apps/{api,web}` + `packages/{db,types}` + pnpm workspace.
  - 루트: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.mise.toml`, `.nvmrc`, `.env.example`, `docker-compose.yml` (pgvector/pgvector:pg16).
  - `packages/db`: Drizzle 스키마 15개 테이블 (users, sources, segments, translations, translationCollaborators, translationInvitations, translationSegments, translationRevisions, proposals, proposalComments, contributions, notes, glossaryEntries, tmUnits, alignments) + `drizzle.config.ts` + 첫 마이그레이션 SQL.
  - `apps/api`: NestJS 10 + `@nestjs/swagger` + `class-validator` + Jest. `healthz` 엔드포인트 + `/api/docs` OpenAPI UI 동작 확인.
  - `apps/web`: Next.js 15.5 LTS + React 19 App Router placeholder 페이지. `typedRoutes` stable, `reactStrictMode: true`.
  - 검증: `pnpm typecheck` 4개 워크스페이스 통과, `pnpm --filter @poomgeul/db migrate`로 실제 Postgres에 15개 테이블 생성 확인, `curl /healthz` 200 OK.

### Changed
- **Gemini Flash PoC 결과 반영 (2026-04-23).** L2 정성 평가(3섹션·3모델·블라인드)로 M0 메인 LLM을 Gemini 2.5 Flash로 확정.
  - L2 평균: α Flash **3.92** · β Haiku 3.25 · γ Sonnet **4.75**.
  - 분기 A′ 선택: Flash 메인 + Budget(Haiku)을 **가용성 폴백**으로만 유지, escalation 기본 타깃은 Sonnet.
  - 갱신 문서: `docs/guides/llm-integration.md`, `docs/architecture/decisions/0002-llm-provider-abstraction.md`, `docs/research/poc-gemini-flash.md`.
- **백엔드 스택 확정 (2026-04-23, ADR-0001).** NestJS + Drizzle ORM + pnpm + Node.js 24 LTS.
  - 프론트(Next.js + TS)와 언어 통일. Drizzle의 TS-first 스키마로 DTO/Entity 이중 정의 제거.
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
