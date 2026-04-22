# 개발 환경 셋업

![phase](https://img.shields.io/badge/phase-Pre--M0-lightgrey)

> **현재 상태: Pre-M0.** 실행 가능한 코드는 아직 저장소에 포함되어 있지 않습니다. 이 문서는 코드가 유입될 때 **가장 먼저 업데이트되는** 지점이며, 당분간은 **의도된 구조**만 문서화합니다.

---

## 전제

- 언어·프레임워크 미확정 — [ADR-0001 백엔드 프레임워크](../architecture/decisions/0001-backend-framework.md) 참조.
- 프론트엔드는 Next.js 14 + TypeScript 고정.
- DB는 PostgreSQL 15+ + pgvector.
- 로컬 실행은 Docker Compose.

## 예상 디렉토리 (향후)

```
poomgeul/
├── apps/
│   ├── web/                  # Next.js 14 + TypeScript
│   └── api/                  # FastAPI 또는 NestJS (TBD)
├── packages/                 # 공유 타입·유틸 (monorepo 진입 시)
├── prompts/                  # 이미 존재 (버전관리되는 프롬프트)
├── docs/                     # 이미 존재
├── docker-compose.yml        # postgres + api + web
├── .env.example
└── Makefile                  # 자주 쓰는 명령
```

## 환경 변수 (예상)

`.env.example`에 정의될 변수 목록.

### 데이터베이스
- `DATABASE_URL` — 예: `postgres://poomgeul:poomgeul@localhost:5432/poomgeul`

### 인증
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

### LLM (OpenRouter + 직접 경로)
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY` (Google AI Studio; OpenRouter 우회 경로)
- `ANTHROPIC_API_KEY` (직접 경로 폴백)
- `LLM_PRIMARY_MODEL` — 기본: `google/gemini-2.5-flash`
- `LLM_FALLBACK_MODEL` — 기본: `anthropic/claude-haiku-4-5-20251001`

### 외부 메타데이터
- `ARXIV_USER_AGENT` — arXiv API 요구
- `CROSSREF_MAILTO` — Crossref polite pool 등록용

### 관측
- `SENTRY_DSN` (선택)
- `LOG_LEVEL` — 기본 `info`

## 로컬 실행 (예상 명령)

```bash
# 1. 저장소 클론 & .env 준비
cp .env.example .env
# ... .env 값 채우기

# 2. Docker Compose 부팅
docker compose up -d postgres
docker compose up api web

# 3. 마이그레이션 & 시드
make migrate
make seed          # 시드 CC BY 논문 1편 import
```

> 실제 명령은 [ADR-0001](../architecture/decisions/0001-backend-framework.md) 확정 시점에 이 문서에 반영됩니다.

## 시드 데이터 규칙

- 시드는 **CC BY arXiv 논문 1~3편**만 포함.
- 시드 논문 목록은 `apps/api/seeds/sources.json` (예정).
- 시드 실행은 멱등(재실행 안전).

## 테스트

- 단위 테스트 — 백엔드 서비스 레이어 (Proposal 상태 머신, optimistic locking)에 우선.
- 통합 테스트 — 실제 PostgreSQL + pgvector를 요구. **mocks 금지**는 아니지만 DB는 진짜를 씀(기획서의 제안/머지 플로우는 DB 트랜잭션이 본질이기 때문).
- e2e — Playwright. M0 수락 흐름(로그인 → import → 초벌 → 제안 → 머지 → 공개 URL)을 커버.

## CI (예정)

- `.github/workflows/`에 GitHub Actions 워크플로우가 코드 유입 시 추가.
- 필수 체크: 타입, 린트, 단위 테스트, e2e 스모크.
- 시크릿은 GitHub repo secrets.

## 자주 찾게 될 참조

- [ADR-0001 백엔드 프레임워크](../architecture/decisions/0001-backend-framework.md)
- [ADR-0002 LLM 추상화](../architecture/decisions/0002-llm-provider-abstraction.md)
- [llm-integration.md](llm-integration.md)
- [source-import.md](source-import.md)
- [data-model.md](../architecture/data-model.md)
