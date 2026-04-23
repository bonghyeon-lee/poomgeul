---
description: 실패한 GitHub Actions run을 받아 실제 실패 지점과 원인을 뽑아냅니다. 사용법 `/ci-diag <run-id | run-url | "latest">`.
---

GitHub Actions의 실패한 run을 진단합니다. 인자 **$ARGUMENTS**:

- 숫자만 → run id로 간주 (`gh run view <id>`)
- `https://github.com/.../actions/runs/<id>` 형식의 URL → id 추출
- 생략 또는 `latest` → `main` 브랜치의 가장 최근 실패 run 자동 선택

## 실행 순서

**1단계 — run 식별**

```bash
ARG="${ARGUMENTS:-latest}"

if [[ "$ARG" == "latest" || -z "$ARG" ]]; then
  RUN_ID=$(gh run list --branch main --status failure --limit 1 --json databaseId --jq '.[0].databaseId')
  [[ -z "$RUN_ID" ]] && { echo "최근 실패 run이 없음 — 성공만 있습니다."; exit 0; }
elif [[ "$ARG" =~ /runs/([0-9]+) ]]; then
  RUN_ID="${BASH_REMATCH[1]}"
elif [[ "$ARG" =~ ^[0-9]+$ ]]; then
  RUN_ID="$ARG"
else
  echo "인자를 이해할 수 없음: $ARG"; exit 1
fi

echo "diagnosing run $RUN_ID"
gh run view "$RUN_ID" 2>&1 | sed -n '1,80p'
```

**2단계 — 실패한 job 목록과 첫 실패 스텝**

```bash
gh run view "$RUN_ID" --json jobs --jq '
  .jobs[]
  | select(.conclusion == "failure")
  | {name: .name, id: .databaseId,
     first_failed_step: ([.steps[] | select(.conclusion=="failure")][0].name)}
'
```

이 레포의 3개 job 이름과 전형적 실패 지점:

- `typecheck · lint · test` — `Typecheck`, `Format check`, `Lint`, `Unit tests — api/web` 중 하나
- `db migrate · api smoke` — `Integration tests`, `E2E tests`, `Smoke — /api/docs-json ...`
- `web e2e (Playwright · chromium)` — `Run Playwright tests`

**3단계 — 각 실패 job의 로그에서 신호만 뽑기**

`--log-failed`는 크기가 커서 전부 읽지 않습니다. 대신 **에러 시그니처 grep**으로 요약:

```bash
for JOB in $(gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .databaseId'); do
  echo "==================== job $JOB ===================="
  gh run view --job "$JOB" --log-failed 2>&1 \
    | grep -iE 'error TS[0-9]+|##\[error\]|FAIL |Test suite failed|ERR_PNPM|TypeError|ReferenceError|EADDRINUSE|expect\(.*\)\.|toBeVisible|Cannot find module|http_code=|http=[0-9]+|Timed out|Process completed with exit code' \
    | head -60
done
```

**4단계 — 원인 분류 (이 레포의 재발 패턴)**

수집한 신호를 아래 버킷으로 묶어 보고합니다. 각 버킷은 **즉시 수정안**까지 포함:

| 시그니처 패턴 | 원인 | 즉시 수정안 |
| --- | --- | --- |
| `Cannot find module '@poomgeul/db'` + `Parameter ... implicitly has an 'any' type` 연쇄 | CI에서 `packages/db/dist`가 비어 있음 (원칙적으로 해결됨 — `postinstall`). 재발 시 postinstall 작동 여부/install 단계 로그 확인. | root `package.json#scripts.postinstall` 존재 확인, `pnpm install --frozen-lockfile` 로그에서 postinstall 출력 확인 |
| `Code style issues found in N files` (prettier) | format 이탈. | 로컬 `pnpm format` 후 재커밋. |
| `Unable to find an accessible element with the role "heading" and name /.../` (RTL) 또는 `toBeVisible failed` ... `heading` (Playwright) | UI 카피 변경이 테스트 매처에 반영 안 됨. | `apps/web/src/app/page.test.tsx`, `apps/web/e2e/*.spec.ts`에서 해당 문구 매처 갱신. 주의: `apps/web/src/app/design-system/page.tsx`의 유사 문구는 타이포 샘플이라 건드리지 않음. |
| `Smoke — /api/docs-json ...` → `http=404` | Swagger 미등록. CI가 `pnpm dev`(tsx)로 API를 띄웠을 가능성. | 워크플로우가 `pnpm build` + `pnpm start`를 쓰는지 확인 (현재 그렇게 돼 있음 — 회귀한 경우 변경 이력 확인). |
| `EADDRINUSE`가 smoke 부팅 단계에서 | 같은 job 내 이전 API 프로세스가 안 죽음 또는 다른 서비스가 포트 점유. | Stop API 스텝 조건(`if: always()`) 확인. |
| Jest/Vitest에서 `Test suite failed to run` + TS 에러 | 테스트 컴파일 단계 실패 — typecheck 실패와 보통 같은 원인. | typecheck 버킷과 같이 처리. |
| `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` | 하위 패키지 중 하나가 실패. 바로 위 로그의 실제 에러를 찾음(이 줄 자체는 요약일 뿐). | 실제 에러 라인 확인 후 해당 패키지 기준으로 처리. |
| `Node.js 20 ... forced to run on Node.js 24` (annotation) | 정보성. 실패 아님. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 적용 후 정상 신호. | 조치 불필요. |

분류에 들어맞지 않는 신호가 남으면 **새 버킷**으로 보고하고, 해결 후엔 이 표에 추가할지 사용자에게 묻습니다.

**5단계 — 보고 형식**

```
run: <id>  (<title>) · <created>
failing jobs: <n>

[<job-name>] first failed step: <step-name>
  cause: <버킷명 또는 미분류>
  key lines:
    <grep에서 뽑힌 결정적 라인 1–3개>
  fix:
    <즉시 수정안 / 추가 조사 필요 항목>
```

여러 job이 **같은 근본 원인**에서 연쇄로 터진 경우(예: typecheck 실패가 smoke까지 막음) 먼저 **루트 버킷 하나**로 묶어 보고한 뒤, "이걸 고치면 나머지도 같이 녹색일 가능성이 높다"고 명시.

**6단계 — 후속 액션 제안**

- 수정이 코드 한두 줄 또는 YAML 한 줄이면 해당 파일을 열어 **바로 수정 제안**(사용자 승인 후 진행).
- 로컬 재현이 필요하면 `/verify` 또는 `/verify full`을 권고.
- squash + force-with-lease로 정리가 필요하면 `/safe-squash-push` 제안.
- 트리거 정보(push vs. PR) · 가장 최근 성공 run과의 diff 범위를 링크로 제공.
