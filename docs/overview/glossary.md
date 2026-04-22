# 용어 사전

![phase](https://img.shields.io/badge/phase-all-blue)

기획서 §19.1 + 구현 레벨 용어 보강. 코드·DB·UI에서 일관되게 사용합니다.

## 라이선스·권리

- **CC BY / CC BY-SA / CC BY-NC / CC BY-ND** — Creative Commons 라이선스 조건 조합. BY=attribution, SA=ShareAlike, NC=NonCommercial, ND=NoDerivatives.
- **퍼블릭 도메인 (Public Domain, PD)** — 저작권이 만료·포기되어 자유 사용 가능한 상태.
- **Adaptation / Derivative Work (2차적 저작물)** — 원작을 바꿔 만든 것. 번역은 법적으로 adaptation.
- **Attribution** — 출처 표시. CC BY 사용의 필수 조건.
- **CLA / DCO** — Contributor License Agreement / Developer Certificate of Origin. poomgeul MVP는 둘 다 운영하지 않음.

## 원문·번역 단위

- **Source (원문)** — 위키처럼 수렴하는 단일 객체. arXiv 논문 1편이 1 Source.
- **Source Version (판본)** — arXiv v1·v2는 별도 Source row로 관리.
- **Segment (세그먼트)** — 번역 관리의 최소 단위(보통 문장). `import_at` 시점 1회 불변.
- **Translation (번역본)** — 같은 Source에 대한 번역 루트. 여러 Translation이 공존 가능(M1+).
- **TranslationSegment** — `Translation × Segment` 교차 엔티티. `version` 컬럼으로 optimistic locking.
- **TranslationRevision** — 승인된 변경 1건. 번역본 히스토리의 최소 단위. 번역본 단위 스냅샷(JSONB). ID-정밀 블레임은 M2.
- **Fork** — 기존을 복제해 독립적으로 발전시키는 행위. poomgeul에서는 **번역본에만** 허용(M1+). 원문 fork는 정책적으로 제한.
- **Featured 번역** — 같은 원문의 여러 번역본 중 큐레이터가 "기본 추천"으로 지정(M1).

## 워크플로우

- **Proposal (제안)** — M0 기여의 기본 단위. 세그먼트 단위로 로그인 사용자가 제출하는 수정안. Git PR의 세그먼트 스케일 축소판.
- **Proposal Status** — `open` / `merged` / `rejected` / `withdrawn` / `stale`. 상세는 [architecture/workflow-proposal.md](../architecture/workflow-proposal.md).
- **Stale Proposal** — 30일 이상 응답이 없어 자동 `stale` 전환된 제안. 재제출 가능.
- **Commit / Revision** — 세그먼트에 대한 승인된 변경 1건. 번역본 히스토리 구성 단위.
- **Approve / Revert** — 제안을 메인테이너가 수락/되돌리기. 평판 계산의 기본 이벤트.
- **Optimistic Locking** — `TranslationSegment.version` 컬럼으로 동시 편집 충돌 감지. `base_segment_version` ≠ 현재 버전이면 "리베이스" 프롬프트. 자동 리베이스는 안 함.
- **Proposer / Committer** — Git의 author/committer 관행 차용. Proposer=제안 작성자, Committer=머지 결정한 리드. 두 필드 모두 attribution에 보존.

## 권한·역할

- **Lead Maintainer (리드 메인테이너)** — 번역본당 최종 머지 권한 1인. M0는 번역본 생성자가 자동 리드. 사임·양도·계승으로 이전 가능.
- **Collaborator (공동 메인테이너)** — 리드가 초대한 추가 편집자. `TranslationCollaborator.role='collaborator'`. M1 활성화.
- **Curator / Admin** — 라이선스 분쟁·악용 대응·원문 제거 권한. 코어팀 임명.
- **Tier (평판 티어)** — `new` → `verified` → `maintainer` → `curator/admin` 4단. M0는 컬럼만 존재(모두 `new`). M2 자동 승급.

## 데이터·AI

- **Schema Pre-design** — 테이블·컬럼은 M0에 포함하되 기능 자체는 M1+에 활성화하는 설계 패턴. 대표 사례: `TranslationCollaborator`.
- **TM (Translation Memory)** — 과거 번역을 세그먼트 단위로 저장해 재활용(M2, pgvector 임베딩).
- **Glossary (용어집)** — 프로젝트에서 일관되게 사용할 용어 목록. M2에 글로벌 용어집, M0는 프롬프트 고정.
- **AI Draft** — LLM이 생성한 초벌. `TranslationSegment.ai_draft_text` 및 `ai_draft_source(model, prompt_hash)`로 원본 보존.
- **Cascade (4-tier LLM)** — Free(Gemini Flash) → Budget(Haiku·GPT-4o-mini) → Mid(Sonnet·GPT-4o) → Premium(Opus·GPT-4-turbo). 상세: [guides/llm-integration.md](../guides/llm-integration.md).

## 논문 처리

- **ar5iv** — arXiv 논문을 HTML로 자동 변환해 제공하는 프로젝트. MVP 1차 파싱 소스.
- **GROBID** — 학술 PDF에서 메타데이터·참고문헌 추출하는 오픈소스. M1 PDF 폴백 후보.
- **Canonical URL** — 중복 콘텐츠 중 "정본" URL. SEO 표준 주소.

## 품질 평가 (M2)

- **BLEU** — n-gram 일치 기반. 업계 표준이지만 사람 판단과 상관관계 약함.
- **COMET** — 딥러닝 기반 의미 근접도.
- **chrF** — 문자 단위 metric.
- **Edit Distance** — AI 초벌 대비 최종 승인본의 토큰 단위 변경 비율. L2 품질 레이어의 핵심 지표.
- **M-ETA** — 엔티티 레벨 번역 품질 지표 (Conia et al., 2024).
