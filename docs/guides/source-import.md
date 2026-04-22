# 원문 Import 파이프라인

![phase](https://img.shields.io/badge/phase-M0%2B-green)

[ADR-0004 ar5iv HTML 1차 경로](../architecture/decisions/0004-source-parser.md) + 기획서 §9.4·§9.5를 구현 가이드로 정리합니다.

## 입력 형태

다음 3가지 입력을 모두 받아 동일 파이프라인으로 정규화합니다.

| 입력 | 예 | 정규화 |
|---|---|---|
| arXiv ID | `2504.20451` | arXiv API |
| arXiv URL | `https://arxiv.org/abs/2504.20451` | URL 파싱 → arXiv ID |
| DOI | `10.xxxx/yyyy` | Crossref API |

## 파이프라인 단계

```
[입력]
   │
   ▼
[1] 정규화 (arXiv ID / DOI 추출)
   │
   ▼
[2] 메타데이터 조회 (arXiv API → Crossref → DOAJ)
   │    · title, author, license, source_version
   │
   ▼
[3] 라이선스 검증
   │    · 허용: CC BY / CC BY-SA / PD
   │    · 차단: CC BY-ND / CC BY-NC-ND / 독점
   │
   ▼
[4] 본문 fetch (ar5iv HTML)
   │    · fallback M1: arXiv PDF + GROBID
   │
   ▼
[5] 세그먼트 분할 & kind 분류
   │    · body / caption / footnote / reference
   │    · 수식·코드 보존
   │
   ▼
[6] Source + Segment[] 저장 (immutable)
   │
   ▼
[7] Translation 생성 (M0: target_lang='ko', lead=importer)
```

## 단계 상세

### 2. 메타데이터 조회

- **arXiv API** — primary. arXiv ID가 있으면 바로.
- **Crossref REST** — DOI 기반. `mailto` 파라미터로 polite pool 사용.
- **DOAJ** — 저널이 오픈 액세스인지 재확인.
- 세 결과가 충돌하면(드물지만) **arXiv > Crossref > DOAJ** 우선순위.

### 3. 라이선스 검증

- 허용 라이선스 표는 [policy/licensing.md](../policy/licensing.md) 참조.
- `CC BY-SA` 원문 → `Translation.license = 'CC-BY-SA'` 자동 고정.
- **저자 웹사이트의 라이선스 표기는 신뢰하지 않음.** arXiv API / 저널 메타데이터만 기준.
- arXiv 프리프린트 vs 저널판: **프리프린트만** 허용.

### 4. 본문 fetch (ar5iv)

- URL: `https://ar5iv.labs.arxiv.org/html/{arxiv_id}`
- 응답 캐시: `source_id` 기준 S3 또는 로컬 파일 캐시 (재import·디버그용).
- 네트워크 실패 시 3회 재시도 → 최종 실패 시 사용자에게 "잠시 후 다시 시도" 안내.

### 5. 세그먼트 분할 규칙

| 원문 요소 | Segment `kind` | 처리 |
|---|---|---|
| 본문 문단 | `body` | 문장 단위 분할 (SpaCy/stanza 혹은 규칙 기반). 인라인 수식 `$...$` 내부 공백을 경계로 오인 금지 |
| 블록 수식 | `body` (잠금) | 원문 그대로 보존, 번역 안 함. 에디터에서 편집 불가 잠금 |
| 수식 캡션 | `caption` | 별도 세그먼트 |
| 그림 캡션 | `caption` | 별도 세그먼트. 이미지 자체는 원문 링크 유지 |
| 표 텍스트 | `caption` | 표 내 한 셀 = 한 세그먼트 |
| 각주 | `footnote` | 본문과 별도 레인 |
| 참고문헌 | `reference` | 저자·제목 번역 안 함(aside 처리), 번역 진행도 계산에서 제외 |
| LaTeX 명령 | - | ar5iv가 이미 HTML 렌더링. MathJax/KaTeX 마크업 유지 |

### 6. 저장

- `Source`, `Segment`는 **import 이후 불변**. 수정 API 없음.
- arXiv v2가 나오면 **새 `Source` row** (다른 `source_version`).

### 7. Translation 자동 생성

M0는 번역본 1개/원문 가정이므로, import 완료 시점에 `Translation(target_lang='ko', lead=importer)` row 자동 생성. 초벌은 별도 버튼(비동기 Batch).

## 공개 URL 규약

기획서 §9.5.

- 패턴: `poomgeul.org/source/{arxiv_id}/ko/{translation_slug}`
- `{translation_slug}`는 리드가 지정(없으면 `main`).
- Schema.org 구조화 데이터:
  - `ScholarlyArticle` — 원문 참조
  - `TranslationOfWork` — 번역본
- `rel=canonical`은 Featured(M1) 또는 자기 자신(M0).

## 중복 방지

- `(attribution_source, source_version)` UNIQUE.
- 같은 논문 재import 시도 시: "이 원문은 이미 등록되어 있습니다 → [링크]"
- 다중 번역본(M1): 같은 원문에 새 번역본 생성은 가능. UI가 "이미 @maintainer가 번역 중입니다" 안내.

## 내부 검색 (발견성)

기획서 §9.5 "내부 검색 & 발견 UX":

- 헤더 검색 박스가 arXiv ID 직접 입력을 지원.
- 검색 결과에 "번역본 있음 / 없음 (초벌 생성 요청)" 분기.
- 검색은 Postgres full-text(tsvector + pg_trgm) — M0에 충분. ElasticSearch는 Phase 2.

## 관련

- [ADR-0004](../architecture/decisions/0004-source-parser.md)
- [policy/licensing.md](../policy/licensing.md)
- [data-model.md #Source / #Segment](../architecture/data-model.md#source-원문)
