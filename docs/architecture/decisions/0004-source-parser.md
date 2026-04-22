# 0004. 원문 파싱 소스: ar5iv HTML 1차 경로

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** @bonghyeon

## Context

M0의 원문 처리는 arXiv 논문 1편을 가져와 **세그먼트(문장) 단위로 분할**하는 단계에서 시작한다. 선택지는 세 가지다.

1. arXiv **PDF 파싱** (GROBID 등).
2. arXiv **.tex source** 파서.
3. **ar5iv HTML** (arXiv 공식 HTML 렌더링 프로젝트).

M0 제약: 7~9주, 1~2인. 수식·그림·표·참고문헌 구조를 잃지 않으면서 세그먼트 분할이 가능해야 한다.

## Decision

**M0는 ar5iv HTML을 1차 소스로 채택.** PDF(GROBID)는 M1 폴백.

## Alternatives considered

| 옵션 | 장점 | 단점 |
|---|---|---|
| **PDF + GROBID** | 모든 논문 커버 | 학습 곡선 큼(Docker 이미지, 튜닝). 레이아웃 복잡. 수식·표가 깨짐. |
| **arXiv .tex source** | 원본 정밀도 최고 | TeX 파서 직접 작성·통합 비용 과함. 패키지 의존성 지옥. |
| **ar5iv HTML (채택)** | 수식·참조·그림 링크가 이미 정규화, 파싱 난이도 낮음 | ar5iv가 처리하지 못하는 논문 존재 (구형/비정형) |

## Consequences

### 긍정
- 파싱 라이브러리는 단순한 HTML 파서(cheerio / BeautifulSoup) + 규칙 기반 세그먼트 분할.
- MathJax/KaTeX 렌더링을 프론트에서 그대로 재사용.
- §9.4 처리 원칙(인라인/블록 수식, 캡션, 참고문헌 aside 등)이 ar5iv 구조와 1:1 매칭.

### 부정
- ar5iv 미지원 논문 → M0는 "이 논문은 현재 지원되지 않습니다" 안내 후 등록 차단.
- ar5iv 서비스 의존. 장애 시 import 경로가 막힘. **완화책:** 응답을 S3/로컬 캐시에 저장(`source_id`별), 이후 재import 시 캐시 우선.

### 뒤집기 비용
세그먼트 분할 로직을 파서 레이어 뒤로 감추면 M1에서 PDF 폴백을 **추가**하는 형태로 확장 가능. 기존 데이터는 유지.

## 구현 가이드

- 세그먼트 분할 규칙과 요소별 처리는 [guides/source-import.md](../../guides/source-import.md) 참조.
- 캡션·참고문헌은 별도 `Segment.kind` 값으로 분류해, 번역 진행도 계산에서 참고문헌은 제외.
- import 시점에 ar5iv URL을 `Source.attribution_source`에 함께 저장(debug 용도).

## 관련

- 기획서 §9.4 — 논문 특화 처리
- [system-overview.md](../system-overview.md) — 외부 의존성 표
- [guides/source-import.md](../../guides/source-import.md)
