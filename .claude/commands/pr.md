---
description: 현재 브랜치의 커밋 히스토리와 diff를 분석해 한국어 PR 제목·본문을 생성합니다. 사용법 `/pr [target-branch]` (미지정 시 main).
---

현재 브랜치를 기준으로 PR 메시지를 작성합니다. 대상 브랜치: **$ARGUMENTS** (미지정 시 `main`).

## 실행 순서

**1단계 — 상태 수집**

```bash
TARGET="${ARGUMENTS:-main}"
CURRENT=$(git branch --show-current)
echo "[$CURRENT] → [$TARGET]"

# 원격 동기화 (PR 베이스가 최신이어야 diff가 정확)
git fetch origin "$TARGET" --quiet || true

RANGE="origin/$TARGET...$CURRENT"

echo -e "\n### Commits (newest first) ###"
git log --oneline "$RANGE"
echo "Total: $(git log --oneline "$RANGE" | wc -l | tr -d ' ') commits"

echo -e "\n### Changed files by area ###"
CHANGED=$(git diff --name-only "$RANGE")

group() { label="$1"; pattern="$2"; echo "--- $label ---"; echo "$CHANGED" | grep -E "$pattern" || echo "(none)"; echo; }

group "apps/api (NestJS)"           '^apps/api/'
group "apps/web (Next.js)"          '^apps/web/'
group "packages/db (Drizzle)"       '^packages/db/'
group "packages/types (OpenAPI types)" '^packages/types/'
group "Tests (api: *.spec.ts / int-spec / e2e · web: *.test.tsx · playwright)" '(\.(spec|test|int-spec|e2e-spec)\.(ts|tsx|js|mjs)$|^apps/web/e2e/|^apps/api/test/)'
group "CI & hooks (.github, husky)"  '^(\.github/|\.husky/)'
group "Docs & ADR"                   '^(docs/|README\.md|.*\.md$)'
group "Root config (package.json · tsconfig · lockfile · prettier · eslint · .nvmrc · pnpm-workspace)" '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig.*\.json|prettier.*|eslint.*|\.nvmrc|\.gitignore)$'

echo "Total changed files: $(echo "$CHANGED" | wc -l | tr -d ' ')"
```

**2단계 — 판단**

- 현재 브랜치가 `main`이면 중단하고 "브랜치를 먼저 만들어야 한다"고 알림(poomgeul은 main 직접 push 레포지만 PR 워크플로우로 전환할 때 쓰는 커맨드).
- 아무 커밋도 없으면 중단.
- 커밋이 1개면 본문 자동화 가치 낮음 — 제목은 그 커밋 subject를 그대로 쓰고, 본문은 최소 형태(요약 1줄 + 테스트 체크리스트)로 제안.

**3단계 — 메시지 규칙**

### 제목

- 레포의 **Conventional Commit subject 스타일**을 제목에도 그대로 적용합니다. `<type>(<scope>): <한국어 요약>` 형태. 예:
  - `feat(web): 번역본 목록에 미지원 섹션 분리`
  - `fix(ci): main CI 복구 — postinstall 빌드 + compiled start 전환`
- 여러 커밋을 한 PR로 묶을 때 **최상위 의도**를 뽑습니다. "여러 잔변경을 모은 잡탕"이면 제목을 짓기 어렵다는 신호 → 분할 PR을 권합니다.
- 70자 내외, em dash(`—`)로 "무엇 — 왜" 분할 허용.

### 본문 템플릿

```markdown
## 배경

왜 이 PR이 필요한지 1~3줄. 인시던트/이슈/요구사항 링크가 있다면 포함.

## 변경 사항

- `apps/api` — ...
- `apps/web` — ...
- `packages/db` — ...
- `.github/workflows/ci.yml` — ...
  (수정 파일이 없는 섹션은 삭제)

## 검증 플랜

- [ ] `pnpm -r typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] `pnpm --filter @poomgeul/api run test:unit` / `test:integration` / `test:e2e`
- [ ] `pnpm --filter @poomgeul/web run test` / `test:e2e` (Playwright)
- [ ] (필요 시) `pnpm --filter @poomgeul/api run build && pnpm --filter @poomgeul/api start` 후 `/healthz`, `/api/docs-json` 스모크
- [ ] (DB 변경) `pnpm --filter @poomgeul/db migrate` — 로컬 DB에서 마이그레이션 적용 확인

## 메모 (선택)

- 팔로업 TODO
- 관련 ADR: `docs/architecture/ADR-XXXX-*.md`
- 알려진 한계
```

**작성 원칙**

- 자명한 잔변경(포맷 정리, 오타 등)은 나열하지 않음. 예외: 포맷 전용 커밋이 있으면 본문에 "의도 없이 Prettier 재적용된 파일이 섞여 있음"을 명시해 리뷰어가 낭비하지 않도록.
- DB 스키마 변경이 있으면 **마이그레이션 파일명**을 본문에 적고, 롤백 가능 여부를 명시.
- API 스키마가 바뀌면 `/api/docs-json` 검증 체크를 포함.
- ADR이 함께 올라가면 ADR 번호와 제목을 본문 상단에 링크.
- CI 워크플로우 변경이면 "어떤 annotation이 사라지는지" 또는 "어떤 실패 모드를 막는지"를 한 줄로 적음.

**4단계 — PR 생성 (선택)**

사용자 승인 후 `gh pr create`를 실행합니다. HEREDOC으로 본문을 전달해 포맷을 보존:

```bash
gh pr create --base "${ARGUMENTS:-main}" --title "<제목>" --body "$(cat <<'EOF'
<본문>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- 드래프트 필요 시 `--draft` 추가 여부를 확인.
- PR URL을 출력하고 종료.
