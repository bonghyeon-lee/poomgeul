# PoC: Gemini 2.5 Flash 한국어 번역 품질 검증

![phase](https://img.shields.io/badge/phase-Phase%200-blue)
![status](https://img.shields.io/badge/status-completed-brightgreen)

> M0 메인 LLM을 확정하기 위한 품질 검증 PoC. **2026-04-23 완료.** 상세 실행 절차와 원본 번역 결과는 별도 워크스페이스에, **요약본은 `poc_results_gemini_flash.md`** 에 있습니다. 원본 경로는 [links.md](links.md).

## 결론 요약

- **채택 모델:** Gemini 2.5 Flash (Free tier 메인).
- **분기 판정:** A′ = Flash 메인 + Budget(Haiku) 폴백은 **가용성·비용 근거**로만 유지. 품질 기준으로는 Flash > Haiku.
- **Escalation 기본 타깃:** Sonnet (Haiku 아님).

반영 문서:
- [guides/llm-integration.md](../guides/llm-integration.md)
- [decisions/0002-llm-provider-abstraction.md](../architecture/decisions/0002-llm-provider-abstraction.md)
- [../../CHANGELOG.md](../../CHANGELOG.md)

## 목적

기획서 §15.2 cascade 임계치(Free → Budget) 결정을 위해, **Gemini 2.5 Flash가 Claude Haiku 4.5 대비 충분한 품질을 내는가**를 실측으로 확인합니다.

## 원문 (CC BY 4.0)

- arXiv:2504.20451 — "Team ACK at SemEval-2025 Task 2: Beyond Word-for-Word Machine Translation for English-Korean Pairs"
- 라이선스: CC BY 4.0 (ACL Anthology 하단 재확인 2026-04-22)

## 섹션 커버리지 (Step 1 완료)

3개 섹션으로 난이도 스펙트럼 커버.

| 슬롯 | 유형 | 검증 포인트 | 핵심 용어 수 |
|---|---|---|---|
| S1 | 압축 산문 (Abstract, ~100w) | 전체 요약 유창성 | 6~7 |
| S2 | 서술 + bullet list (Intro, ~236w) | 서식 보존 + 학술 유창성 | 8~9 |
| S3 | 테크니컬 + citation + 모델명 다수 (§3 Experimental Setup, ~260w) | 서식·citation·entity 보존 | 15+ |

## 평가 모델

| 코드 | 모델 | 역할 |
|---|---|---|
| α | `gemini-2.5-flash` | **검증 대상 (Free tier 메인 후보)** |
| β | `claude-haiku-4-5-20251001` | 폴백 후보 baseline |
| γ | `claude-sonnet-4-6` | 상한 비교용 reference |

공통 프롬프트는 [prompts/translate.en-ko.v1.md](../../prompts/translate.en-ko.v1.md)의 초안과 정합하도록 유지. Temperature 0.2 고정.

## 평가 축

| 레이어 | 지표 | 구현 |
|---|---|---|
| L1 자동 | COMET-QE, 용어 일관성 표 | `unbabel-comet` + 수기 체크 |
| L2 정성 | 정확/유창/용어/서식 1~5 scale | 블라인드 라벨 A/B/C로 |
| L3 수정 공수 | `min/100w` 교정 시간 | A는 5분 실 교정, B·C는 2분 스캔 |

## 진행 상태 (2026-04-23 완료)

| Step | 상태 |
|---|---|
| Step 1: 원문 3섹션 확보 | ✅ |
| Step 2: 번역 9종 생성 (α SDK · β·γ Workbench 수동) | ✅ |
| Step 3: 블라인드 셔플 · `blind_key.txt` | ✅ |
| Step 4: L1-a 스킵 (Python 3.14 비호환) · L1-b 자동 추출 · L2 완료 · L3 스킵(운영 결정) | ✅ |
| Step 5: 라벨 공개 · 재매핑 · 분기 A′ 판정 | ✅ |
| Step 6: 본 저장소 문서 반영 | ✅ |

## 결단 분기 (실측 결과)

| 분기 | 조건 | 판정 |
|---|---|---|
| A — Flash 단독 허용 | α ≥ β, L2 ≥ 4.0, L3 ≤ 6 | ❌ (L2 3.92 < 4.0) |
| B — Flash → Haiku Cascade | α < β이지만 γ의 70% 이상 | ❌ (전제 불성립 — 실제로 α > β) |
| C — Flash 실격 | L2 < 3.0 또는 L3 > 10 | ❌ |
| D — 2차 PoC 필요 | 분산 大 | ❌ (max-min 1.00으로 판정 가능) |
| **A′ — 운영 변형 (선택)** | α > β + α ≥ 70%γ + S1 약점은 Sonnet escalation으로 대응 | ✅ |

**측정치:** L2 평균 — α Flash 3.92, β Haiku 3.25, γ Sonnet 4.75.

## 사전 가설 검증 (Step 5 결과)

> "Gemini 2.5 Flash는 Claude Haiku와 거의 동급이거나 약간 우수하고, Sonnet보다는 명확히 열등할 것이다. 용어 일관성에서 Flash가 약할 가능성이 있으며, 자연스러움은 한국어 training 비중에 따라 달라질 것이다."

- **Flash ≈ Haiku 또는 약간 우수** → 확정, 실제로는 약간 **우수** (+0.67).
- **Sonnet보다 명확히 열등** → 확정 (−0.83).
- **Flash 용어 일관성 약할 가능성** → Sonnet 대비 약함, **Haiku 대비는 오히려 나음**. 가설보다 덜 비관적.
- **한국어 유창성 training 비중 의존** → Sonnet에서 효과 가장 큼 (유창 5.00).

예상 못한 관찰:
1. Haiku가 bottom. 원 cascade "Flash → Haiku" 가정이 흔들림.
2. Flash가 서식(4.00)에서 Haiku(3.00)를 크게 앞섬.
3. S1(Abstract) 유독 어려움 — Flash·Sonnet 모두 다른 섹션 대비 낮음.

## 갱신된 문서 (2026-04-23)

- [guides/llm-integration.md](../guides/llm-integration.md) — cascade 표·결정 규칙을 PoC 결과로 확정. Escalation 기본 타깃을 Sonnet으로 변경.
- [architecture/decisions/0002-llm-provider-abstraction.md](../architecture/decisions/0002-llm-provider-abstraction.md) — "2026-04-23 개정" 섹션 추가. Budget 역할을 품질 폴백 → 가용성 폴백으로 재정의.
- [../../CHANGELOG.md](../../CHANGELOG.md) — "Gemini Flash PoC 결과 (2026-04-23)" 블록 추가.
- [prompts/translate.en-ko.v1.md](../../prompts/translate.en-ko.v1.md) — 현재 v1 유지. regression 발견 안 됨.

## 관련 파일 (외부 워크스페이스)

본 PoC의 실측 실행 파일·blind_key·중간 결과는 이 저장소가 아닌 별도 경로에서 관리됩니다. 정확한 위치는 [links.md](links.md).
