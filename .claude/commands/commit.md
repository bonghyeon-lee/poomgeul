---
description: Staged 변경을 분석해 poomgeul 컨벤션(한국어 subject + scope)에 맞는 Conventional Commit 메시지를 생성하고 커밋합니다. 힌트가 있으면 $ARGUMENTS로 전달.
---

현재 staged된 변경을 분석해 커밋 메시지를 생성합니다. 힌트: **$ARGUMENTS**

## 원칙

- **pre-push 훅**(`.husky/pre-push`)이 typecheck · format:check · lint · 유닛 테스트를 게이팅합니다. 커밋 시점이 아니라 push 시점에 실행되므로, 커밋 자체는 빠르게 진행하되 "push 가능한 상태"를 목표로 작성합니다.
- **하나의 목적에 하나의 커밋**. staged된 변경이 여러 주제에 걸쳐 있으면 커밋을 나누도록 안내합니다. 억지로 합친 메시지를 만들지 않습니다.
- Co-authored trailer는 항상 추가합니다.

## 실행 순서

**1단계 — 변경 범위 파악**

```bash
git diff --cached --stat
git diff --cached
```

- 변경이 논리적으로 분리 가능하다고 판단되면 먼저 이를 지적하고, 커밋을 나눌지 사용자에게 묻습니다. 합친 커밋을 만들 필요가 없다면 진행.
- 의도치 않은 파일(예: `.env`, secrets, 빌드 산출물)이 staged된 경우 사용자에게 알리고 제외 여부 확인.

**2단계 — 메시지 생성 규칙**

### 형식

```
<type>(<scope>): <subject>

<body — 선택>
```

### Type

| 타입       | 설명                                      |
| ---------- | ----------------------------------------- |
| `feat`     | 새 기능                                   |
| `fix`      | 버그 수정                                 |
| `refactor` | 기능 변화 없는 구조 개선                  |
| `perf`     | 성능 개선 (동작은 동일)                   |
| `test`     | 테스트 추가/수정만 있는 경우              |
| `docs`     | 문서 (`docs/**`, `*.md`, ADR 등)          |
| `style`    | 포맷/공백/세미콜론 등 (의미 변화 없음)    |
| `chore`    | 의존성·설정·스크립트 등 인프라 정리       |
| `ci`       | `.github/workflows/**` 및 CI 전용 스크립트 |
| `build`    | 빌드 시스템/번들러/tsconfig 빌드 설정     |

### Scope (선택이지만 **가능하면 붙임**)

현재 레포에서 관찰되는 주요 scope — 변경 파일 경로를 보고 결정:

| scope          | 기준                                                          |
| -------------- | ------------------------------------------------------------- |
| `api`          | `apps/api/**`                                                 |
| `web`          | `apps/web/**`                                                 |
| `db`           | `packages/db/**` (스키마, 마이그레이션, client)               |
| `types`        | `packages/types/**`                                           |
| `ci`           | `.github/workflows/**`, husky 훅, CI 관련 스크립트만 건드렸을 때 |
| `architecture` | `docs/architecture/**` (ADR 포함)                             |
| (생략)         | 루트 전반 또는 여러 scope에 걸쳐 있고 묶을 단어가 없을 때     |

여러 scope가 섞이면 **가장 무게 있는 한 개**를 고르거나, scope 없이 쓰고 본문에서 설명합니다. 억지로 `api,web` 같은 다중 scope는 쓰지 않습니다.

### Subject

- **한국어**가 기본. 단, 쉬운 외래어(import, ar5iv, Swagger 등 고유 용어)는 원어 그대로.
- 70자 내외를 권장하나 한글 특성상 넘을 수 있음. 의미가 명확하면 허용.
- 끝에 마침표 없음.
- 자주 쓰는 패턴: **`무엇을 했다 — 왜/효과`** (em dash `—` 사용). 예:
  - `feat(api): 묶음 번역(batch) 도입 — Gemini 호출 수 ~8배 감소`
  - `fix(web): dev를 turbopack으로 — next webpack의 ".next/server/NNN.js 없음" 부정합 회피`
- 명령조가 아닌 **완결형 서술**도 이 레포에선 자연스러움(한국어 관례): "~추가", "~ 수정", "~ 전환".

### Body (선택)

- 변경이 복잡하거나 판단 근거가 필요한 경우에만.
- "무엇"보다 "왜". 근거가 된 에러 메시지·실제 수치·인시던트를 구체적으로.
- 4개 이상의 원인이 한 커밋에 섞여 있다면 번호 리스트로 나누어도 무방 (예: `fix(ci): @poomgeul/db postinstall 빌드 + API 스모크용 compiled start 전환`의 본문 참고).

### 금지 사항

- `git commit --no-verify` 금지. pre-push 훅은 push 단계라 commit에는 영향 없지만, pre-commit 훅이 추가되더라도 우회하지 않음.
- secrets가 포함된 diff는 커밋하지 않고 즉시 보고.

**3단계 — 사용자 확인 후 커밋**

메시지를 제안하고, 사용자가 승인하면 아래 형식으로 커밋:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- 커밋 후 `git log --oneline -1`로 결과를 보여 줍니다.
- pre-commit 훅이 있으면 그 출력을 숨기지 말고 표시. 실패 시 **amend하지 말고** 원인을 수정해 새 커밋을 만듭니다.

**힌트 처리**

- `$ARGUMENTS`가 있으면 사용자가 의도한 핵심을 드러낸 것으로 간주하고 그 방향으로 subject를 쓰되, diff와 모순되면 모순을 지적합니다(사용자 의도 vs. 실제 변경).
