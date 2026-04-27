# Architecture Decision Records (ADR)

![phase](https://img.shields.io/badge/phase-all-blue)

아키텍처·기술 선택의 근거를 남기는 ADR 인덱스입니다. 포맷은 [Michael Nygard 템플릿](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)을 차용합니다.

## 작성 규칙

- 파일명: `NNNN-kebab-title.md` (NNNN은 0001부터 순차).
- 한 결정 = 한 파일. 기존 결정을 뒤집을 때는 새 ADR을 만들고 이전 ADR의 Status를 `Superseded by NNNN`으로 업데이트.
- Status는 `Proposed` / `Accepted` / `Deprecated` / `Superseded by NNNN` 중 하나.

## 템플릿

```markdown
# NNNN. 결정 제목

- **Status:** Proposed | Accepted | Deprecated | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** @핸들

## Context
무엇을 해결해야 하는가? 무엇이 주어졌는가?

## Decision
선택한 것.

## Alternatives considered
각 대안과 탈락 이유.

## Consequences
긍정·부정 결과. 뒤집기 비용.
```

## 인덱스

| # | 제목 | Status |
|---|---|---|
| [0001](0001-backend-framework.md) | 백엔드 프레임워크: NestJS + Drizzle (Node 24 LTS) | Accepted |
| [0002](0002-llm-provider-abstraction.md) | LLM 프로바이더 추상화 — OpenRouter + 4-tier Cascade | Accepted |
| [0003](0003-optimistic-locking.md) | 동시 편집 충돌 방어 — `segment.version` Optimistic Locking | Accepted |
| [0004](0004-source-parser.md) | 원문 파싱 소스: ar5iv HTML 1차 경로 | Accepted |
| [0005](0005-github-oauth-session.md) | GitHub OAuth + DB 세션 | Accepted |
| [0006](0006-proposal-crud-api.md) | Proposal CRUD API — 경로·페이로드·PR 분해 전략 | Accepted |
| [0007](0007-proposal-blocklist.md) | Proposal Blocklist — 번역본 단위 사용자 차단 모델 | Accepted |
| [0008](0008-segment-direct-edit.md) | Segment 직접 편집 — HTTP 계약·이중 기록 모델 | Accepted |
