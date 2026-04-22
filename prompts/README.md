# Prompts

poomgeul이 LLM에 보내는 **시스템 프롬프트의 정본 저장소**입니다. 애플리케이션 코드는 이 디렉토리의 파일을 직접 로드합니다. 데이터베이스 설정이나 관리자 UI 경유가 아닙니다.

## 파일명 규약

```
<purpose>.<lang-pair>.v<N>.md
```

- `purpose` — `translate` / `review-suggest` / `terminology-extract` / 등.
- `lang-pair` — `en-ko` / `ko-en` / `en-ja` 등. Phase 1은 `en-ko` 고정.
- `vN` — 정수 버전. 변경 시 파일명을 올림(**기존 파일을 수정하지 말 것**).

## 파일 포맷

각 프롬프트 파일은 YAML front-matter + 마크다운 본문입니다.

```markdown
---
name: translate.en-ko
version: 1
model_hint: google/gemini-2.5-flash
temperature: 0.2
max_output_tokens: 8192
status: active | deprecated | superseded
supersedes: null
changelog:
  - 2026-04-22: initial version
---

# System prompt

(여기에 system instruction)
```

- `version` — 정수. 파일명 `vN`과 일치.
- `model_hint` — 권장 모델. 실제 호출은 tier에 따라 덮어써질 수 있음.
- `status` — `active` / `deprecated` / `superseded`.
- `supersedes` — 대체하는 이전 파일명. 같은 purpose 내에서 유일한 `active`만 허용.

## 애플리케이션 연동

LLM 어댑터는 다음을 수행:
1. 호출 시점에 `prompts/<name>.v<N>.md` 파일을 로드.
2. front-matter를 파싱해 `model_hint`·`temperature`를 기본값으로 채택(`tier` 파라미터가 덮어쓰기 가능).
3. 본문을 system instruction으로 송신.
4. 응답 로그에 `prompt_hash = sha256(본문)`을 저장해 regression 추적.

## 현재 프롬프트 목록

| 파일 | 용도 | Phase |
|---|---|---|
| [translate.en-ko.v1.md](translate.en-ko.v1.md) | 영→한 초벌 번역 (M0 메인) | M0 |
| [review-suggest.v1.md](review-suggest.v1.md) | AI 리뷰 제안 (M2 placeholder) | M2 |
| [terminology-extract.v1.md](terminology-extract.v1.md) | 용어 자동 추출 (M2 placeholder) | M2 |

## 변경 관리

- **마이너 수정 (오타, 주석)**: 같은 버전 내 수정 허용. `changelog` 라인만 추가.
- **의미 있는 변경** (어투, 규칙 추가/삭제): 반드시 새 `vN+1` 파일 생성. 이전 버전은 `status: superseded` 처리.
- 한국어 스타일 규정이 바뀌면 [docs/guides/korean-style-guide.md](../docs/guides/korean-style-guide.md) → 본 프롬프트로 순서대로 반영.
