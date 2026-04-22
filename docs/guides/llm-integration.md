# LLM 통합 가이드

![phase](https://img.shields.io/badge/phase-M0%2B-green)

[ADR-0002 LLM 프로바이더 추상화](../architecture/decisions/0002-llm-provider-abstraction.md)를 구현 수준에서 풀어쓴 가이드입니다.

## 비용 목표

- **M0 메인 경로: 월 $2~5** (기획서 §15.2·CHANGELOG v0.4).
- 달성 전략: Gemini 2.5 Flash 무료 tier + Batch 할인 + 공격적 캐시.

## 4-tier Cascade

PoC 결과(2026-04-23)로 기본 모델 확정. 상세: [research/poc-gemini-flash.md](../research/poc-gemini-flash.md).

| Tier | 용도 | 기본 모델 | 비고 |
|---|---|---|---|
| **Free** | M0 메인 경로, 표준 산문 | `google/gemini-2.5-flash` | **PoC 확정.** L2 3.92, Haiku보다 우수. 학습 opt-out 정책 확인 필수 |
| **Budget** | Free 장애·rate limit 폴백 | `anthropic/claude-haiku-4-5-20251001` (Batch API) | ZDR 적용. 품질이 아닌 **가용성 근거**로만 사용 (PoC에서 Flash < Haiku 아님) |
| **Mid** | 고난이도(수식·테크니컬) 세그먼트, "better model" escalation의 기본 타깃 | `anthropic/claude-sonnet-4-6` / `openai/gpt-4o` | PoC에서 L2 4.75로 최상위. M1에서 사용 시작 |
| **Premium** | Featured 검수 (M2) | `anthropic/claude-opus-*` / `openai/gpt-4-turbo` | 선택적 |

## 어댑터 인터페이스 (목표 형태)

```python
class LLMAdapter(Protocol):
    async def translate(
        self,
        segments: list[SegmentInput],
        *,
        tier: Tier = Tier.FREE,
        prompt_version: str = "translate.en-ko.v1",
        glossary: list[GlossaryEntry] | None = None,   # M2부터 non-None
    ) -> list[TranslationOutput]: ...
```

- 호출자는 `tier`만 바꿔 상향 재시도 가능.
- `prompt_version`은 `prompts/` 파일명 규약과 1:1 매핑.
- 응답에는 `{text, model, prompt_hash, input_tokens, output_tokens, cost_usd, latency_ms}` 포함.

## Cascade 결정 규칙 (M0)

```
1. Tier.FREE로 초벌 생성.
2. 자동 지표 실패 시 Tier.BUDGET으로 재생성:
   - 출력 길이 < 입력의 20% (잘린 추정)
   - 감지 패턴: 원문을 영어 그대로 출력
   - 세그먼트별 perplexity proxy 임계 초과
3. Lead가 "다시 생성(better model)" 클릭 시 즉시 FREE → MID (Sonnet) 업그레이드.
   Budget(Haiku)은 건너뜀 — PoC에서 Haiku가 Flash보다 낮았기 때문.
```

M1 이후 지표 보강 전까지는 **자동 cascade는 Free → Budget 한 단계만**.

### PoC에서 드러난 약점 대응

- **S1(Abstract) 유형 — 압축 산문에서 Flash L2 3.25.** 초벌 자동 지표가 임계 미달일 확률이 상대적으로 높음. UI가 "이 세그먼트 Sonnet으로 다시 생성" 액션을 눈에 띄게 둘 것.
- Flash의 서식 점수(4.00)는 Haiku(3.00)를 앞섬 → **citation·수식·bullet 보존은 Flash가 Haiku보다 신뢰할 만함**.

## 데이터 경계 (중요)

기획서 §10.5 준수. 무료 tier 경로로 **절대 전송 금지**인 데이터:

- 기여자가 작성한 교정·코멘트·제안 본문.
- 아직 공개되지 않은 저자 직접 등록 원문(유형 A).
- 계정 식별자·이메일을 포함한 프롬프트.

**구현 체크:**
- [ ] LLM 어댑터 진입 시 페이로드 validator가 위 범주를 검사.
- [ ] 위반 시 자동 Budget tier(ZDR) 경로로 전환.
- [ ] 위반 로그는 내부 모니터링 (사용자 알림 없음).

## Batch vs Realtime

- **초기 import + 전체 세그먼트 초벌** → Batch API 경로 (비용 절감).
- **리드가 "이 세그먼트 다시 생성"** → Realtime 경로 (응답 지연 최소).

Batch 응답 도착 전까지 UI는 `ai_draft_text`가 비어 있는 상태를 "생성 중" 표시.

## 토큰·비용 관측

모든 호출에 대해 아래 메트릭 수집:

| 필드 | 사용처 |
|---|---|
| `model`, `tier` | 비용 breakdown |
| `input_tokens`, `output_tokens` | 월 예산 alert |
| `latency_ms` | UX 모니터링 |
| `prompt_hash` | 프롬프트 회귀 비교 |
| `failure_reason` | Cascade 분석 |

월 $5 초과 예상 시 자동 알림 + Admin 대시보드 배지.

## 실패·재시도

- **Transient (5xx, rate limit):** exponential backoff, 최대 3회.
- **Permanent (권한, 형식 오류):** 즉시 실패 + 다음 tier 폴백.
- **세그먼트 개별 실패:** 나머지는 진행, 실패 세그먼트는 "재시도" 버튼 노출.

## 프롬프트 버저닝

- 프롬프트 파일명 = 버전 (예: `prompts/translate.en-ko.v1.md`).
- LLM 어댑터는 **파일 경로로 직접 로드**(DB·설정 서버 경유 안 함).
- 새 프롬프트 → 파일명에 `v2` 부여, M2 "번역본별 커스텀 프롬프트"에서 분기.

## PoC 결과 (2026-04-23 반영)

- Gemini 2.5 Flash 품질 검증 PoC 완료. 상세: [research/poc-gemini-flash.md](../research/poc-gemini-flash.md).
- **분기 판정: 분기 A′ (Flash 메인 + Budget 폴백 유지, 단 escalation 타깃은 Sonnet).**
- L2 평균: α Flash **3.92** · β Haiku 3.25 · γ Sonnet **4.75**.
- 위 cascade 표·결정 규칙은 본 PoC 결과를 반영한 상태.

## 관련

- [ADR-0002](../architecture/decisions/0002-llm-provider-abstraction.md)
- [prompts/README.md](../../prompts/README.md)
- [policy/licensing.md §10.5](../policy/licensing.md)
