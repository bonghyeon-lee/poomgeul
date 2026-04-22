# PoC: Gemini 2.5 Flash 한국어 번역 품질 검증

![phase](https://img.shields.io/badge/phase-Phase%200-blue)

> M0 메인 LLM을 확정하기 위한 품질 검증 PoC. 상세 실행 절차는 별도 워크스페이스에 있으며, 본 문서는 **요약 + 결과 반영 지점**을 기록합니다. 원본 경로는 [links.md](links.md).

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

## 진행 상태 (2026-04-22 기준)

| Step | 상태 |
|---|---|
| Step 1: 원문 3섹션 확보 | ✅ 완료 |
| Step 2: 번역 9종 생성 (3 섹션 × 3 모델) | ⬜ 대기 |
| Step 3: 블라인드 라벨링 (셔플 + `blind_key.txt`) | ⬜ |
| Step 4: 3축 평가 (L1/L2/L3) | ⬜ |
| Step 5: 라벨 공개 & 결단 | ⬜ |
| Step 6: 기획서 / 본 저장소 반영 | ⬜ |

## 결단 분기 (Step 5 템플릿)

| 분기 | 조건 | 반영 |
|---|---|---|
| **A — Flash 단독 허용** | α ≥ β 수준, L2 평균 ≥ 4.0, L3 ≤ 6 min/100w | `guides/llm-integration.md` 기본 모델을 Flash 단독으로 |
| **B — Flash → Haiku Cascade** | α가 β보다 열등하지만 γ의 70% 이상 | 기본 Flash + 자동 cascade를 Haiku로 |
| **C — Flash 실격** | L2 평균 < 3.0 또는 L3 > 10 min/100w | 메인 경로를 Haiku Batch로 전환 |
| **D — PoC 2차 필요** | 3 섹션만으로 판정 불가 (분산 大) | 추가 5~10 섹션 블라인드 평가 |

## 사전 가설

> "Gemini 2.5 Flash는 Claude Haiku와 거의 동급이거나 약간 우수하고, Sonnet보다는 명확히 열등할 것이다. 용어 일관성에서 Flash가 약할 가능성이 있으며, 자연스러움은 한국어 training 비중에 따라 달라질 것이다."

Step 5에서 이 가설의 일치 여부 기록.

## 결과가 나오면 갱신할 문서

- [guides/llm-integration.md §PoC 현황](../guides/llm-integration.md) — 기본 모델 확정
- [architecture/decisions/0002-llm-provider-abstraction.md](../architecture/decisions/0002-llm-provider-abstraction.md) — Status를 `Accepted`로 유지하며 본 PoC 링크 추가
- [prompts/translate.en-ko.v1.md](../../prompts/translate.en-ko.v1.md) — 프롬프트 regression 발견 시 v2 승격
- [../../CHANGELOG.md](../../CHANGELOG.md) — "Gemini Flash PoC 결과 (YYYY-MM-DD)" 블록

## 관련 파일 (외부 워크스페이스)

본 PoC의 실측 실행 파일·blind_key·중간 결과는 이 저장소가 아닌 별도 경로에서 관리됩니다. 정확한 위치는 [links.md](links.md).
