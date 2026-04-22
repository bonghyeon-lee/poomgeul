# 시스템 개요

![phase](https://img.shields.io/badge/phase-M0%2B-green)

기획서 §9.1을 구현 관점에서 확장. 구성 요소의 책임 경계, 외부 의존성, 호출 경로를 정리합니다.

## 구성 요소 다이어그램

```
┌────────────────────────────────────────────────────────────┐
│                    사용자 (브라우저)                        │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│  Web App (Next.js 14)                                      │
│   · 원문·번역 병렬 에디터                                  │
│   · Proposal 패널 (열림/머지 리스트)                       │
│   · 프로필·기여 이력 (M1)                                  │
│   · 번역본 비교 뷰 (M1)                                    │
└───────────────────────────┬────────────────────────────────┘
                            │  REST / WebSocket
┌───────────────────────────▼────────────────────────────────┐
│  API Gateway (FastAPI or NestJS — ADR-0001)                │
│   · 인증·권한·티어                                         │
│   · Source / Translation / Metadata CRUD (별도 권한)       │
│   · Proposal 상태 머신                                     │
└───┬─────────────┬─────────────┬──────────────┬─────────────┘
    │             │             │              │
    ▼             ▼             ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│ LLM    │  │ 원문/    │  │ 라이선스 │  │ 외부 메타     │
│ 어댑터 │  │ 번역본   │  │ 검증     │  │ 데이터 조회   │
│ (OR)   │  │ 스토어   │  │ 엔진     │  │ (arXiv,      │
│        │  │ (PG +    │  │          │  │  Crossref,   │
│        │  │  pgvec)  │  │          │  │  DOAJ, ar5iv)│
└────────┘  └──────────┘  └──────────┘  └──────────────┘
    │
    ▼
 Google Gemini / Anthropic Claude / OpenAI
 (cloud-only · OpenRouter 추상화 · 4-tier cascade)
```

## 구성 요소 책임

| 컴포넌트 | 책임 | 주요 기술 |
|---|---|---|
| **Web App** | 사용자 인터페이스, 세션 관리, 낙관적 UI | Next.js 14, TypeScript, shadcn/ui, TanStack Query |
| **API Gateway** | 인증·권한, CRUD, Proposal 상태 머신, 이벤트 발행 | FastAPI(Python) or NestJS(Node.js) — [ADR-0001](decisions/0001-backend-framework.md) |
| **LLM 어댑터** | 프로바이더 추상화, cascade, 토큰/비용 관측, Zero Data Retention 정책 | OpenRouter — [ADR-0002](decisions/0002-llm-provider-abstraction.md) |
| **원문/번역본 스토어** | 영속화, optimistic locking, 임베딩(M2) | PostgreSQL 15+ + pgvector |
| **라이선스 검증 엔진** | import 시점에 외부 메타데이터 질의, CC BY-ND/NC-ND 차단, CC BY-SA 자동 상속 | 내부 서비스, 외부 API 클라이언트 |
| **외부 메타데이터** | 원문 메타데이터·라이선스 진위 확인, HTML 파싱 소스 | arXiv API, Crossref, DOAJ, [ar5iv](https://ar5iv.labs.arxiv.org/) |

## 외부 의존성 요약

| 종류 | 서비스 | 쓰임새 | Phase |
|---|---|---|---|
| 원문 메타데이터 | [arXiv API](https://info.arxiv.org/help/api/index.html) | arXiv ID로 논문 메타/라이선스 조회 | M0 |
| 원문 메타데이터 | [Crossref REST API](https://api.crossref.org/) | DOI 기반 메타/라이선스 | M0 |
| 원문 메타데이터 | [DOAJ](https://doaj.org/) | 오픈 액세스 저널 검증 | M0 |
| 원문 본문 파싱 | [ar5iv](https://ar5iv.labs.arxiv.org/) | arXiv HTML (세그먼트 소스) | M0 |
| 원문 본문 파싱 | [GROBID](https://github.com/kermitt2/grobid) | PDF 폴백 | M1 |
| LLM (Free) | Gemini 2.5 Flash (Google AI Studio) | AI 초벌 메인 경로 | M0 (PoC 확정 후) |
| LLM (Budget 폴백) | Claude Haiku 4.5 (Anthropic / OpenRouter) | 품질 미달 시 폴백 | M0 |
| LLM (Mid) | Claude Sonnet 4.6 | 고난이도 세그먼트 | M2 |
| 인증 | GitHub OAuth | 로그인 | M0 |
| 인증 | ORCID | 연구자 연동 | M1+ |

## 데이터 흐름 (M0 주요 시나리오)

### 1. 원문 import
```
User → Web → API /sources
         → License Engine.validate(arxiv_id)
              → arXiv API / Crossref / DOAJ
         ← license_ok + metadata
         → Source Store.save(Source + Segments)
              → ar5iv HTML fetch & 파싱
         ← source_id
```

### 2. AI 초벌 생성
```
Lead → Web → API /translations/{id}/draft
         → LLM Adapter.translate(segments, prompt="prompts/translate.en-ko.v1.md")
              → Cascade: Gemini Flash → Haiku → Sonnet
         ← draft_segments
         → Store.save(TranslationSegment.ai_draft_*)
```

### 3. Proposal → 머지
```
User  → Web → API /proposals  { translation_id, segment_id, base_segment_version, proposed_text }
Lead  → Web → API /proposals/{id}/approve
         → optimistic locking check (base_version == current?)
         → on success:
             create TranslationRevision
             update TranslationSegment.text, version += 1
             proposal.status = 'merged'
             Contribution events 발행
```

자세한 상태 전이는 [workflow-proposal.md](workflow-proposal.md) 참조.

## 배포 구조

- **로컬/셀프호스팅:** Docker Compose (web + api + postgres). LLM은 클라우드 프로바이더로 outbound.
- **공식 호스팅:** 동일 컴포넌트를 매니지드 환경에 배포. 비용 전략은 [guides/llm-integration.md](../guides/llm-integration.md).

> **cloud-only 경계:** 로컬·셀프호스팅 LLM(Ollama, vLLM 등)은 Phase 1 범위 밖입니다(기획서 §15.2). 향후 BYO key(M2)로 간접 지원.

## 논문 특화 처리 원칙 (기획서 §9.4 요약)

| 요소 | 처리 |
|---|---|
| 본문 문단 | 문장 단위 세그먼트 분할 → AI 초벌 → 편집 |
| 인라인 수식 `$...$` | 원문 그대로 보존, 세그먼트 경계로 오인 안 되게 전처리 |
| 블록 수식 `\begin{equation}` | 원문 그대로, 캡션만 별도 세그먼트 |
| 그림·표 | 이미지는 번역 안 함(원문 링크). 캡션·표 내 텍스트는 세그먼트화 |
| 참고문헌 | 저자·제목 번역 안 함. 저널명은 선택. 번역 진행도 계산에서 제외 |
| 각주·방주 | 세그먼트화, 본문과 별도 레인 |

## 관련 문서

- [data-model.md](data-model.md) — 엔티티 상세
- [workflow-proposal.md](workflow-proposal.md) — Proposal 상태 머신
- [decisions/](decisions/) — 개별 기술 결정 근거
- [guides/source-import.md](../guides/source-import.md) — 원문 파이프라인 세부
