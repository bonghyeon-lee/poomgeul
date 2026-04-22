# Attribution 정책

![phase](https://img.shields.io/badge/phase-M0%2B-green)

CC BY 계열 라이선스의 핵심 요구사항인 **출처 표시(attribution)** 를 어떻게 자동 생성할지 정리합니다. 동시에 기여자 크레딧도 함께 보존합니다.

## 기본 원칙

1. **이중 기록** — Git의 author/committer 분리를 번역 워크플로우에 적용.
   - **Proposer** = 제안을 작성한 사용자 → `Proposal.proposer_id`, `TranslationRevision.author_id`
   - **Committer** = 머지를 결정한 리드 메인테이너 → `Proposal.resolved_by`
   - 둘 다 attribution에 보존되며, 공개 페이지에서 구분 가능.
2. **모든 번역본 페이지에 자동 블록 삽입** — 수동 작성 금지. 법적 컴플라이언스는 자동화로만 보장.
3. **Attribution은 ShareAlike·derivative 조건과 독립** — CC BY-SA든 CC BY든 출처 표시는 동일 수준으로.

## 페이지 Attribution 블록 (M0 표준)

모든 번역본 페이지 상단 또는 하단에 아래 블록을 자동 렌더링합니다.

```
본 번역본은 다음 원문의 2차적 저작물입니다.
─────────────────────────────────────────
원문: {source.title}
저자: {source.author[0]} 외 {N-1}명
원문 라이선스: {source.license}  [뱃지]
원문 URL: {source.attribution_source}
판본: {source.source_version}

번역본 라이선스: {translation.license}  [뱃지]
리드 메인테이너: @{translation.lead.github_handle}
공동 기여자: @alice, @bob, ... (최근 승인 5인)

이 번역본은 원문에서 한국어로 번역되었으며, 일부 수정되었습니다 (Adapted from original).
```

### 포함 필드

- 원문: 제목·저자·라이선스·URL·판본.
- 번역본: 라이선스·리드·주요 기여자(M0는 단순 리스트, M1에서 정교화).
- 수정 여부 명시 ("Adapted from original") — CC BY 필수.
- CC BY-SA 시 ShareAlike 고지.

### 복사 가능한 인용 문자열

사용자가 "인용 복사" 버튼으로 아래 문자열을 한 번에 복사할 수 있어야 합니다(학술 인용·블로그 공유용).

```
{lead.display_name} et al. (2026). "{translation.title}" (Korean translation of
"{source.title}" by {source.author}). poomgeul. {translation.url}. CC BY 4.0.
```

## 세그먼트 레벨 크레딧 (M0 최소 / M1 정교화)

- **M0:** 페이지 수준에서 "최근 머지된 proposer N명"을 리스트업. 세그먼트별 "누가 썼나" UI는 없음.
- **M1:** Attribution 정교화 — 리드/협력자/제안자 분리 블록.
- **M2:** 세그먼트 레벨 블레임(`TranslationRevision` 단위 추적, `snapshot`에 세그먼트별 author 메타 추가).

## 이벤트 모델

`Contribution` 테이블은 다음 이벤트를 기록합니다. 이 이벤트 집계가 Attribution과 프로필 기여 이력의 원천입니다.

| 이벤트 | 주체 | attribution 효과 |
|---|---|---|
| `proposal_submit` | proposer | "제안자" 크레딧 적립 |
| `proposal_merge` | proposer (author) | "저자" 크레딧 (리드는 committer로 별도 기록) |
| `segment_edit` | 리드/협력자 | "편집자" 크레딧 |
| `review_comment` | 작성자 | 프로필 활동에 표시 (공개 페이지 attribution 블록엔 미노출) |

## 유지 원칙

- **계정 삭제 시 이메일·식별자만 제거, 기여 자체는 유지** (기획서 §10.5 / [licensing.md](licensing.md)). 삭제된 사용자는 `@deleted`로 표시.
- **사용자 차단 시에도 이미 머지된 기여는 유지.** attribution은 기여 시점의 신뢰 관계.
- **Revert된 제안은 attribution에서 제거되지 않음** — 기여 시도 자체는 역사에 남음. 다만 공개 블록에서는 제외.

## 구현 체크 (M0)

- [ ] `Translation` 페이지 SSR 시 Attribution 블록을 HTML로 렌더.
- [ ] 외부 크롤러(검색엔진)에게도 동일하게 노출 (SEO / meta tags 포함).
- [ ] 기여자가 5명 미만이면 전원 표시, 5명 이상이면 "외 N명".
- [ ] CC BY-SA 원문일 경우 ShareAlike 고지 문구 포함.
- [ ] "인용 복사" 버튼.
- [ ] 구조화 데이터(Schema.org `ScholarlyArticle` + `TranslationOfWork`)에 attribution 필드 매핑.

## 관련

- [licensing.md](licensing.md) — 어떤 라이선스에서 attribution이 필수인가
- [architecture/workflow-proposal.md](../architecture/workflow-proposal.md) — proposer/committer 분리가 발생하는 지점
- [specs/m0-mvp.md §7 Attribution](../specs/m0-mvp.md)
