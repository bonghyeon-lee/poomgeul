---
description: 로컬의 최근 N개 커밋을 하나로 squash하고 `--force-with-lease`로 원격에 안전 푸시합니다. 사용법 `/safe-squash-push [N]` (기본 N=2).
---

오늘 흐름처럼 "원격에 올라간 fix 커밋 + 그 뒤 로컬 보완 커밋"을 하나의 깔끔한 메시지로 합치고 force push할 때 씁니다. 인자 **$ARGUMENTS**(없으면 `2`).

## 가드레일

이 커맨드는 **published history를 재작성**하므로 위험합니다. 아래 가드가 전부 통과하지 않으면 중단합니다.

1. 현재 브랜치가 **protected**라고 추정되는 경우(기본값: `main`) — 사용자에게 명시적 승인 2회(설명 + "force push 동의합니다" 확인) 받음.
2. 최근 `git fetch` 후 **원격 HEAD가 로컬과 동일한 tip 또는 로컬의 조상**이어야 함. 내 rewrite 대상이 "다른 사람 커밋"을 덮어쓰지 않음을 의미.
3. **force push는 `--force-with-lease=main:<현재-원격-SHA>` 형식**으로만 수행. 순수 `--force`는 절대 금지.

## 실행 순서

**1단계 — 상태 확인**

```bash
N="${ARGUMENTS:-2}"
BRANCH=$(git branch --show-current)
echo "branch: $BRANCH  squash depth: N=$N"

git fetch origin "$BRANCH" --quiet
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")
LOCAL_SHA=$(git rev-parse HEAD)
MERGE_BASE=$(git merge-base HEAD "origin/$BRANCH")

echo "remote origin/$BRANCH : $REMOTE_SHA"
echo "local  HEAD           : $LOCAL_SHA"
echo "merge base            : $MERGE_BASE"

# 원격 tip이 로컬의 조상이어야 안전 (로컬이 원격을 포함)
if [[ "$MERGE_BASE" != "$REMOTE_SHA" ]]; then
  echo "원격이 로컬의 조상이 아님. 먼저 rebase/pull로 정리 필요 — 중단."
  exit 1
fi

# 원격이 이미 로컬과 같으면 force push할 게 없음
if [[ "$REMOTE_SHA" == "$LOCAL_SHA" ]]; then
  echo "원격과 로컬이 동일 — squash할 커밋이 없음."
  exit 0
fi

echo -e "\n--- squash 대상 ($N개) ---"
git log --oneline -"$N"

echo -e "\n--- 합쳐질 diff (stat) ---"
git diff --stat "HEAD~$N"..HEAD
```

**2단계 — 브랜치·N 검증**

- `HEAD~$N`이 원격 tip보다 **과거**여야 함. 그렇지 않으면 이미 원격에 있는 다른 커밋까지 덮어쓰게 됨.

```bash
if ! git merge-base --is-ancestor "HEAD~$N" "$REMOTE_SHA"; then
  echo "HEAD~$N이 원격 tip의 조상이 아님. N 값을 줄이거나 원격 상태를 재확인 — 중단."
  exit 1
fi
```

- 브랜치가 `main`이면 사용자에게 "이 force push는 main을 덮어씁니다. 계속합니까?"를 **명시적으로 물어 승인을 받은 뒤에만** 진행.

**3단계 — 새 메시지 작성**

`git log -N --format='%B%n---'`로 기존 메시지를 모두 보여 주고, 이를 기반으로 단일 메시지 초안을 제시합니다. 형식은 `/commit` 커맨드와 동일(`<type>(<scope>): <subject>` + 한국어 본문 + Co-author trailer).

- 기존 커밋들의 요점을 **번호 리스트**로 병합하는 게 이번 세션 관례에 부합.
- 한 문장 제목으로 축약이 어려우면 "A + B" 또는 em dash로 연결: `fix(ci): @poomgeul/db postinstall 빌드 + API 스모크용 compiled start 전환`.

**4단계 — soft reset + 재커밋**

```bash
# 안전망: 되돌릴 때를 대비해 현재 tip을 백업 태그로 기록
BACKUP_TAG="backup/squash-$(date +%Y%m%d-%H%M%S)"
git tag "$BACKUP_TAG" HEAD
echo "백업 태그 생성: $BACKUP_TAG (문제 생기면 'git reset --hard $BACKUP_TAG'로 복구)"

git reset --soft "HEAD~$N"

git commit -m "$(cat <<'EOF'
<type>(<scope>): <새 제목>

<합친 본문>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
```

**5단계 — force-with-lease 푸시**

```bash
git push --force-with-lease="$BRANCH:$REMOTE_SHA" origin "$BRANCH"
```

- `stale info`로 거부되면 그 사이 원격이 또 바뀌었다는 뜻. **절대 `--force`로 바꿔 덮어쓰지 않음**. `git fetch` 후 다시 1단계부터 재검증.

**6단계 — CI 재실행 확인 (선택)**

새 커밋으로 CI가 자동 재트리거되므로 watch가 필요한 경우:

```bash
sleep 5
NEW_RUN_ID=$(gh run list --branch "$BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId')
echo "new run: $NEW_RUN_ID — https://github.com/<owner>/<repo>/actions/runs/$NEW_RUN_ID"
```

실패하면 `/ci-diag $NEW_RUN_ID`로 이어짐.

## 중단/복구

- 4단계 soft reset 이후에 "합치지 말걸"로 마음이 바뀐 경우: `git reset --hard <BACKUP_TAG>`.
- 5단계 force push 이후 복구 필요 시: 원격에 남아 있던 이전 SHA는 GitHub reflog(또는 `gh api /repos/:owner/:repo/actions/runs/...`의 head_sha)에서 찾을 수 있음. 로컬에는 BACKUP_TAG로 남아 있으니 그걸 기준으로 `git push --force-with-lease`로 되돌림.
- 백업 태그는 수동으로 삭제 전까지 남음. 정리하려면 `git tag -d backup/squash-...`.

## 금지 사항

- `git push --force`(무조건 force) 사용 금지 — 반드시 `--force-with-lease=<ref>:<expected-sha>` 형식.
- `--no-verify`로 훅 우회 금지 — pre-push 훅이 실패하면 원인을 수정해 새 커밋으로.
- squash 대상에 **원격에만 있는 다른 사람 커밋**이 포함되면 중단. 이 케이스는 rebase로 해결.
