# 0002. LLM 프로바이더 추상화 — OpenRouter + 4-tier Cascade

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** @bonghyeon

## Context

AI 초벌 번역이 M0의 핵심 기능이고, 운영 비용의 대부분을 차지한다. 사이드 프로젝트 자립 가능성을 위해 **월 LLM 비용 $2~5 목표**가 있고(CHANGELOG v0.4), 동시에 품질 하한선은 유지되어야 한다.

요구사항:
- 프로바이더 교체/폴백을 코드 한 곳에서 제어.
- 무료 tier(Gemini Flash)에 개인정보·미공개 원문이 전송되지 않도록 정책 반영([policy/licensing.md §데이터 보호](../../policy/licensing.md)).
- 토큰·비용·지연 시간 관측 가능.
- BYO(Bring Your Own) API key는 M2에서 도입.

## Decision

**OpenRouter를 1차 추상화 레이어로 채택**하고, 아래 4-tier cascade 전략을 구현한다.

| Tier | 용도 | 기본 모델 (후보) | 비용 목표 |
|---|---|---|---|
| Free | M0 메인 경로, 표준 산문 | Gemini 2.5 Flash (Google AI Studio 또는 OpenRouter free) | $0 |
| Budget | Free에서 품질 미달 신호 | Claude Haiku 4.5 / GPT-4o-mini (Batch API) | ~$0.5/1M tokens |
| Mid | 고난이도 세그먼트(수식·테크니컬) | Claude Sonnet 4.6 / GPT-4o | 필요 시 |
| Premium | 크리티컬 (featured 번역 검수) | Claude Opus / GPT-4-turbo | M2+ 검토 |

Cascade 트리거(예): 자동 지표(COMET-QE, perplexity proxy) 또는 리드 메인테이너의 "이 세그먼트 다시 생성(better model)" 액션.

## Alternatives considered

| 옵션 | 탈락 이유 |
|---|---|
| **각 프로바이더 SDK 직접 사용** | 공급자 fallback·통합 계측이 분산. 장기 유지보수 비용↑. |
| **LangChain** | 과도한 추상화. 디버깅 표면적 큼. 1~2인 팀에 부적합. |
| **LiteLLM self-hosted** | 직접 운영 비용이 사이드 프로젝트 규모에 과함. OpenRouter가 동일 효용 제공. |
| **로컬/셀프호스팅 모델 (Ollama·vLLM)** | 기획서 §15.2에서 Phase 1 범위 밖으로 명시. |

## Consequences

### 긍정
- 프로바이더 교체가 한 줄(model id 변경). Gemini Free tier 축소 리스크(기획서 §17)에 저항력.
- 토큰·비용·지연 로그가 한 곳에 집계.
- BYO Key(M2)는 프로바이더별 endpoint를 대신 주입하는 형태로 확장 가능.

### 부정
- OpenRouter 자체가 단일 장애점. 완화책: 플래그로 직접 SDK 폴백 경로 유지(관제 수준).
- Gemini Free tier의 **학습 opt-out 정책**은 OpenRouter 경유 시에도 확인 필요. 무료 경로 사용 시엔 아래 데이터 범주를 **절대 전송 금지**:
  - 기여자가 쓴 교정·코멘트·제안 본문
  - 아직 공개되지 않은 저자 직접 등록 원문 (유형 A)
  - 계정 식별자·이메일 포함 프롬프트
- 위 범주는 유료 tier(ZDR 적용) 또는 BYO Key 경로로만.

### 뒤집기 비용
LLM 어댑터 인터페이스를 좁게 유지하면 낮음(1~2일 수준). 운영 로그·비용 대시보드 포팅 공수는 별도.

## 관련

- [guides/llm-integration.md](../../guides/llm-integration.md) — 구현 가이드
- [research/poc-gemini-flash.md](../../research/poc-gemini-flash.md) — 메인 모델 선택의 근거 PoC
