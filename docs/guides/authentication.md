# 인증 (GitHub OAuth) — 로컬/운영 가이드

![phase](https://img.shields.io/badge/phase-M0-green)

> **근거 결정:** [ADR-0005 GitHub OAuth + DB 세션](../architecture/decisions/0005-github-oauth-session.md)

이 문서는 개발자가 로컬에서 GitHub OAuth 로그인을 사용하고, 환경 변수를 세팅하고, 향후 운영에 반영하기 위해 알아야 할 것을 다룬다. 설계 근거·대안·결과는 ADR-0005에, 구현 디렉터리 구조는 `apps/api/src/modules/auth/`에 있다.

## 라우트 요약

| 메서드·경로 | 목적 | 가드 |
| --- | --- | --- |
| `GET /api/auth/github` | GitHub 동의 페이지로 리다이렉트. `oauth_state` HMAC 쿠키 발급. | 없음 |
| `GET /api/auth/github/callback` | state 검증 → code 교환 → user upsert → `sid` 세션 쿠키 발급 → 303 `/` | 없음 |
| `GET /api/auth/me` | 현재 로그인 사용자(공개 필드). 미로그인은 401. | `SessionGuard` |
| `POST /api/auth/logout` | 세션 DB 무효화 + 쿠키 제거. 204. | `SessionGuard` |

모든 경로는 `apps/api`의 `setGlobalPrefix("api")` 아래에 있다.

## 쓰기 엔드포인트에 가드 붙이기

`SessionGuard`는 기본 적용이 아니라 **옵트-인**이다. 공개 GET(`/api/translations*`)은 익명 허용(M0 §1)이라 전역 가드를 두지 않는다. 쓰기 엔드포인트에는 다음처럼 붙인다:

```ts
import { UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "@poomgeul/db";

@Post(":slug/proposals")
@UseGuards(SessionGuard)
async createProposal(@Param("slug") slug: string, @CurrentUser() user: User) { ... }
```

`req.user`·`req.session`은 가드가 통과한 뒤에만 채워진다. 가드 없이 `@CurrentUser()`만 쓰면 런타임 에러가 난다.

## 환경 변수

모두 **루트 `.env`**에 둔다 (`apps/api`는 `apps/api/.env`와 루트 `.env`를 모두 읽고 먼저 발견된 쪽을 사용한다; `apps/api/src/app.module.ts` 상단 주석 참조).

| 키 | 용도 | 기본값 |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | OAuth 앱의 Client ID. **필수**. | — |
| `GITHUB_CLIENT_SECRET` | OAuth 앱의 Client Secret. **필수**. | — |
| `SESSION_SECRET` | `oauth_state` 쿠키 HMAC에 사용. 16자 이상. **필수**. | — |
| `GITHUB_OAUTH_CALLBACK_URL` | GitHub이 콜백할 절대 URL. 생략 시 `http://localhost:${PORT ?? 3000}/api/auth/github/callback`. | (생략) |
| `WEB_BASE_URL` | 로그인 성공 후 리다이렉트 대상. 생략 시 `http://localhost:3001`. | `http://localhost:3001` |
| `NODE_ENV` | `production`일 때 쿠키 `Secure` 플래그가 켜짐. | (unset) |

## 로컬 GitHub OAuth 앱 등록

1. <https://github.com/settings/developers> → **New OAuth App**.
2. 다음 값 입력:
   - **Application name**: 자유(예: `poomgeul-dev`).
   - **Homepage URL**: `http://localhost:3001`.
   - **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`.
3. 발급된 Client ID와 Client Secret을 루트 `.env`에 붙여넣는다.
4. `SESSION_SECRET`은 16자 이상 랜덤 문자열로 (예: `openssl rand -base64 32`).
5. API를 재시작: `pnpm --filter @poomgeul/api dev`.
6. 브라우저에서 `http://localhost:3000/api/auth/github`에 접근 → GitHub 동의 → 성공 시 `http://localhost:3001`로 돌아오고 `sid` 쿠키가 발급된다.
7. 확인: `curl -b "sid=$(...)" http://localhost:3000/api/auth/me`.

## CSRF state (HMAC 쿠키)

ADR-0005는 추가 DB 테이블 없이 **HMAC-서명된 단기 쿠키**로 `state`를 운반한다. 쿠키는 `oauth_state`, 수명은 10분, 서명 키는 `SESSION_SECRET`이다. 구현은 `apps/api/src/modules/auth/oauth-state.ts`.

콜백에서 (a) 쿠키 값과 query의 `state`가 같은지, (b) HMAC이 일치하는지, (c) 만료되지 않았는지 세 가지를 검증한다. 어느 하나라도 실패하면 400을 반환하며 state 쿠키를 즉시 제거해 다음 시도가 깨끗하게 시작된다.

## 세션 쿠키

`sid` 쿠키는 `session_id`만 담는다(DB 조회로 검증). 속성:

- `HttpOnly` — JS 접근 불가
- `SameSite=Lax` — 크로스 사이트 POST 차단
- `Secure` — `NODE_ENV=production`일 때만 true(dev는 http라 false)
- `Path=/`
- `Expires` — 세션 row의 `expires_at`과 동기화(기본 30일, `DEFAULT_SESSION_TTL_MS`)

로그아웃은 DB 세션을 `revoked_at = NOW()`로 만들고 쿠키에 `Expires=epoch`를 덮어쓴다. 다음 요청에서 `findActive`가 null을 반환해 즉시 401.

## Next.js (`apps/web`)에서 세션 읽기

`apps/web`과 `apps/api`는 dev에서 같은 호스트(`localhost`)라 SameSite=Lax로 쿠키가 공유된다. 서버 컴포넌트에서:

```ts
const res = await fetch("http://localhost:3000/api/auth/me", {
  cache: "no-store",
  credentials: "include",
});
const me = res.ok ? await res.json() : null;
```

> prod 쿠키 도메인(서브도메인 전략)은 별도 ADR에서 확정할 예정이다.

## 테스트

- Unit: `apps/api/src/modules/auth/oauth-state.spec.ts` — HMAC/만료/개조 케이스.
- Integration: `apps/api/test/integration/auth-service.int-spec.ts` — upsert 3경로, `auth-session-store.int-spec.ts` — 세션 create/find/revoke.
- E2E: `apps/api/test/integration/auth-session-guard.e2e-spec.ts` — 미인증/유효/로그아웃/리보크드 5케이스.

GitHub 실제 호출이 필요한 콜백 happy path는 strategy가 외부에 의존하므로 로컬·CI에서는 **수동 검증**(위 "로컬 GitHub OAuth 앱 등록" 절)으로만 덮는다. 향후 Playwright에서 GitHub 서버를 모킹하는 e2e가 붙을 수 있다.

## 운영 메모 (M0 이후)

- **쿠키 도메인 공유**: prod는 `api.poomgeul.org` ↔ `poomgeul.org`처럼 서브도메인이 갈릴 예정. `Set-Cookie`에 `Domain=.poomgeul.org`를 줘야 하며, 이는 별도 ADR로 확정한다.
- **세션 만료 연장(rolling)**: 현 구현은 `expires_at` 고정. "활성 사용자는 자동 연장"이 필요하면 `findActive`에서 `UPDATE sessions SET expires_at = ...`를 체크-인 로직으로 추가할 수 있다.
- **다중 provider**: Google/ORCID 확대 시 `accounts(user_id, provider, provider_user_id)` 테이블로 분리(ADR-0005 §뒤집기 비용 참조). 기존 `users.github_id`/`users.orcid`는 드롭하지 않고 NULL 전환 마이그레이션.
