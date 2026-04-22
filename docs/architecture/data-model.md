# 데이터 모델

![phase](https://img.shields.io/badge/phase-M0%2B-green)

기획서 §9.2를 구현 수준으로 확장. 엔티티별 컬럼·FK·인덱스·활성화 태그를 표로 정리합니다.

## 설계 원칙

1. **3개 객체 분리** — 원문(Source) / 번역본(Translation) / 메타데이터(Metadata)를 독립 엔티티로.
2. **Schema Pre-design** — 미래 기능의 테이블·컬럼을 M0에 만들어두고, 행만 최소화. 활성화 시 마이그레이션 비용이 0에 수렴.
3. **Immutable 원칙** — Source/Segment는 import 후 변경 불가(판본 업데이트는 새 `source_version` row).
4. **Optimistic Locking** — 모든 편집 가능한 세그먼트에 `version` 컬럼.
5. **Attribution 이중 기록** — `proposer_id`(author)와 `resolved_by`(committer) 둘 다 보존.

## ERD (M0 활성 기준)

```
User ───────┬──── 1:N ────→ Source.imported_by
            │
            ├──── 1:N ────→ Translation.lead_id
            │
            ├──── 1:N ────→ TranslationCollaborator.user_id   [pre-design / M1]
            │
            ├──── 1:N ────→ Proposal.proposer_id / resolved_by
            │
            └──── 1:N ────→ Contribution.user_id

Source ────┬──── 1:N ────→ Segment
           │
           └──── 1:N ────→ Translation

Translation ─┬── 1:N ────→ TranslationSegment
             │
             ├── 1:N ────→ TranslationRevision
             │
             ├── 1:N ────→ TranslationCollaborator  [pre-design / M1]
             │
             ├── 1:N ────→ TranslationInvitation    [M1]
             │
             └── 1:N ────→ Proposal

Segment ─────────── 1:N ────→ TranslationSegment
                 └── 1:N ────→ Proposal (via segment_id)

Proposal ──── 1:N ────→ ProposalComment
```

---

## Source (원문)

활성화: `[M0]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `source_id` | UUID | PK | |
| `title` | text | NOT NULL | |
| `author` | text[] | | 여러 저자 |
| `original_lang` | varchar(8) | NOT NULL | ISO 639-1 |
| `license` | enum | NOT NULL | `CC-BY`, `CC-BY-SA`, `PD`, ... ([policy/licensing.md](../policy/licensing.md)) |
| `attribution_source` | text | NOT NULL | arXiv URL 또는 DOI |
| `source_version` | text | NOT NULL | arXiv v1/v2 등 판본 식별자 |
| `imported_at` | timestamptz | NOT NULL | immutable |
| `imported_by` | UUID | FK → User.id | immutable |
| `maintainer_policy` | enum | | `author-registered` / `community-curated` |

**인덱스:** `(attribution_source, source_version)` UNIQUE, `(original_lang)`.

## Segment (세그먼트)

활성화: `[M0]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `segment_id` | UUID | PK | |
| `source_id` | UUID | FK → Source.source_id, NOT NULL | |
| `order` | int | NOT NULL | 본문 내 순서 |
| `original_text` | text | NOT NULL | import 시점 1회 불변 |
| `kind` | enum | | `body` / `caption` / `footnote` / `reference` (9.4) |

**인덱스:** `(source_id, order)` UNIQUE.

## Translation (번역본 루트)

활성화: `[M0]` — 단, `forked_from_id`는 M2+에만 non-null 허용.

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `translation_id` | UUID | PK | |
| `source_id` | UUID | FK → Source, NOT NULL | |
| `target_lang` | varchar(8) | NOT NULL | M0는 `ko` 고정 |
| `lead_id` | UUID | FK → User, NOT NULL | 리드 메인테이너. M0는 생성자=리드 |
| `status` | enum | NOT NULL | `draft` / `reviewed` / `featured` |
| `license` | enum | NOT NULL | 원문에서 자동 파생 또는 허용 범위 내 선택 |
| `current_revision_id` | UUID | FK → TranslationRevision, NULLABLE | 최신 revision 포인터 |
| `forked_from_id` | UUID | FK → Translation, NULLABLE | **M0/M1는 항상 null**. M2+ fork 시 사용 |
| `slug` | text | | 공개 URL 용 |

**인덱스:** `(source_id, target_lang, slug)` UNIQUE, `(lead_id)`, `(status)`.

**M0 제약:** 동일 `(source_id, target_lang)`에 대해 Translation row 1개만 허용(다중 번역본은 M1).

## TranslationCollaborator

활성화: `pre-design [M0] / active [M1]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `translation_id` | UUID | FK, NOT NULL | |
| `user_id` | UUID | FK, NOT NULL | |
| `role` | enum | NOT NULL | `lead` / `collaborator`. **M0는 `lead` row 1개만** |
| `invited_by` | UUID | FK → User, NULLABLE | |
| `joined_at` | timestamptz | NOT NULL | |

**인덱스:** `(translation_id, user_id)` UNIQUE, `(user_id)`.

## TranslationInvitation

활성화: `[M1]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `invitation_id` | UUID | PK | |
| `translation_id` | UUID | FK, NOT NULL | |
| `invited_email` | text | NOT NULL | |
| `invited_by` | UUID | FK → User | |
| `token` | text | NOT NULL, UNIQUE | |
| `expires_at` | timestamptz | NOT NULL | |
| `status` | enum | NOT NULL | `pending` / `accepted` / `revoked` / `expired` |

## TranslationSegment

활성화: `[M0]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `translation_id` | UUID | FK → Translation, NOT NULL | |
| `segment_id` | UUID | FK → Segment, NOT NULL | |
| `text` | text | NOT NULL | 현재 승인 본문 |
| `ai_draft_text` | text | | 초벌 원본 보존 |
| `ai_draft_source` | jsonb | | `{ model, prompt_hash, version }` |
| `version` | int | NOT NULL, DEFAULT 0 | **optimistic locking** (monotonic) |
| `last_editor_id` | UUID | FK → User | |
| `last_edited_at` | timestamptz | NOT NULL | |
| `status` | enum | NOT NULL | `unreviewed` / `approved` |

**PK:** `(translation_id, segment_id)`.
**인덱스:** `(translation_id, status)`, `(last_editor_id)`.

## TranslationRevision

활성화: `[M0]` (ID-정밀 블레임은 M2)

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `revision_id` | UUID | PK | |
| `translation_id` | UUID | FK, NOT NULL | |
| `author_id` | UUID | FK → User, NOT NULL | |
| `created_at` | timestamptz | NOT NULL | |
| `commit_message` | text | | |
| `merged_proposal_id` | UUID | FK → Proposal, NULLABLE | 머지 유래 revision일 때 채워짐 |
| `snapshot` | jsonb | NOT NULL | 번역본 단위 스냅샷 |

## Proposal

활성화: `[M0]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `proposal_id` | UUID | PK | |
| `translation_id` | UUID | FK, NOT NULL | |
| `segment_id` | UUID | FK → Segment, NOT NULL | 원문 세그먼트 기준 |
| `base_segment_version` | int | NOT NULL | 제안 시점의 `TranslationSegment.version` |
| `proposed_text` | text | NOT NULL | |
| `reason` | text | | |
| `proposer_id` | UUID | FK → User, NOT NULL | |
| `status` | enum | NOT NULL | `open` / `merged` / `rejected` / `withdrawn` / `stale` |
| `resolved_by` | UUID | FK → User, NULLABLE | 머지·거절·철회자 |
| `created_at` | timestamptz | NOT NULL | |
| `resolved_at` | timestamptz | NULLABLE | |

**제약:** 같은 사용자가 같은 `(translation_id, segment_id)`에 동시에 `open` 제안 1개만(§11.3 스팸 방어).
**인덱스:** `(translation_id, status)`, `(proposer_id)`, `(status, created_at)` — stale 전환 배치 용.

## ProposalComment

활성화: `[M0]` — inline 앵커는 M2

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `comment_id` | UUID | PK | |
| `proposal_id` | UUID | FK, NOT NULL | |
| `author_id` | UUID | FK → User, NOT NULL | |
| `body` | text | NOT NULL | |
| `created_at` | timestamptz | NOT NULL | |

## Metadata (용어집 / TM / Note / Alignment)

활성화: `[M2]`

- **GlossaryEntry** — `(source_id or project_id, term, translation, definition)`
- **TMUnit** — `(source_text, target_text, embedding vector)` (pgvector)
- **Note** — 세그먼트 레벨 주석 (역주). Note 테이블은 M0에 존재하되 UI는 기본 표시만.
- **Alignment** — `source_segment_id ↔ translation_segment_id` (문장 단위 정렬)

M0는 Note 테이블만 존재하며 나머지는 스키마만 선정의.

## Contribution

활성화: `[M0]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `user_id` | UUID | FK, NOT NULL | |
| `event_type` | enum | NOT NULL | `segment_edit` / `proposal_submit` / `proposal_merge` / `review_comment` |
| `entity_ref` | jsonb | NOT NULL | `{ translation_id, segment_id, ... }` |
| `timestamp` | timestamptz | NOT NULL | |

**인덱스:** `(user_id, timestamp DESC)`, `(event_type, timestamp)`.

## User

활성화: `[M0]`

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `id` | UUID | PK | |
| `email` | citext | UNIQUE, NOT NULL | |
| `display_name` | text | | |
| `github_handle` | text | | OAuth 주 경로 |
| `orcid` | text | NULLABLE | M1+ 연동 |
| `tier` | enum | NOT NULL, DEFAULT `new` | **M0는 모두 `new` 고정**. M2에서 평판 계산 연결 |

## Pre-design이 주는 것

- `TranslationCollaborator`를 M0에 만들어두면 M1 활성화 시 **컬럼 추가 없이 row 삽입만**으로 전환.
- `Translation.forked_from_id` nullable 유지 → M2 fork 허용 시 스키마 수정 불필요.
- `User.tier` 컬럼 존재하되 M0는 값 `new` 고정 → M2 평판 로직 연결 시 즉시 활성.

## 마이그레이션 규약

- 도구: **Drizzle Kit** (`drizzle-kit generate` + `drizzle-kit migrate`). [ADR-0001](decisions/0001-backend-framework.md).
- 스키마 정본: `packages/db/schema.ts` (TypeScript). 생성된 SQL은 `packages/db/migrations/`에 커밋.
- 모든 마이그레이션은 **일방향**(up-only). 데이터 이관이 필요한 수정은 생성 SQL을 **수작업 편집**하여 DML 포함. PR 리뷰에서 수작업 편집 여부 필수 확인.
- `enum` 추가는 호환, 제거·변경은 major migration으로 표기.
- pgvector 컬럼은 `vector` 타입으로 선언하되 M2 활성화 전까지 인덱스·KNN 쿼리는 도입하지 않음.
