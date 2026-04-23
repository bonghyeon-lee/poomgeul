# poomgeul 문서 인덱스

이 디렉토리는 개발·운영·거버넌스 관련 **구현 지향 문서**를 담습니다. 제품 비전·전략의 정본은 별도 저장소의 기획서이며, 그 위치는 [research/links.md](research/links.md)에 있습니다.

## 역할별 진입 경로

### 🆕 처음 왔어요
1. [overview/vision.md](overview/vision.md) — 제품 본질 1페이지
2. [overview/roadmap.md](overview/roadmap.md) — 어느 Phase에 뭐가 들어오는가
3. [overview/glossary.md](overview/glossary.md) — 용어 사전

### 💻 코드 기여자
1. [architecture/system-overview.md](architecture/system-overview.md) — 구성 요소
2. [architecture/data-model.md](architecture/data-model.md) — 엔티티 전체
3. [specs/m0-mvp.md](specs/m0-mvp.md) — 지금 만들 기능
4. [guides/dev-setup.md](guides/dev-setup.md) — 로컬 실행
5. [guides/testing.md](guides/testing.md) — TDD 레이어·DB 격리 전략
6. [design/README.md](design/README.md) — 디자인 시스템 원칙·토큰·컴포넌트 키트 규범
7. [architecture/decisions/](architecture/decisions/) — ADR: "왜 이렇게 설계했나"

### ✍️ 번역 기여자 / 리드 메인테이너
1. [architecture/workflow-proposal.md](architecture/workflow-proposal.md) — Proposal → 머지 흐름
2. [guides/korean-style-guide.md](guides/korean-style-guide.md) — 영→한 규범
3. [policy/governance.md](policy/governance.md) — 권한·소유권

### 📜 정책·법무 확인
1. [policy/licensing.md](policy/licensing.md) — 허용 라이선스
2. [policy/attribution.md](policy/attribution.md) — Attribution 규칙
3. [policy/governance.md](policy/governance.md) — 거버넌스

## 전체 트리

```
docs/
├── overview/      비전·로드맵·용어
├── architecture/  시스템·데이터 모델·워크플로우·ADR
├── specs/         Phase별 기능 명세
├── guides/        개발·LLM·원문 임포트·스타일 가이드
├── design/        디자인 시스템 — 토큰·타이포·컴포넌트 규범
├── policy/        라이선스·거버넌스·Attribution
└── research/      PoC·외부 문서 링크 허브
```

## Phase 표기 규약

각 문서 상단에 현재 적용 Phase 배지(`M0` / `M1` / `M2` / `all`)를 둡니다. 섹션 헤딩 내 Phase 한정 항목은 접두로 표기합니다. 예: `### [M1] 공동 메인테이너 초대`.

데이터 모델 엔티티 표는 `활성화` 컬럼으로 다음 3단계를 구분합니다.
- `[M0]` — M0에서 실제 데이터가 쌓이고 로직이 동작
- `pre-design [M0] / active [Mx]` — 스키마는 M0에 두되 Mx에서 활성화
- `[Mx]` — Mx에서 도입
