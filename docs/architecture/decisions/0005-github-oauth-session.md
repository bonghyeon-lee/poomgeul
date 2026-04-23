# 0005. GitHub OAuth + DB 세션

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** @bonghyeon

## Context

M0 §1 인증의 수락 기준(Acceptance Criteria):

1. GitHub OAuth 2.0 flow로 로그인/가입이 한 번의 동의로 처리됨.
2. 첫 로그인 시 `User` row 생성(`email`, `display_name`, `github_handle`).
3. 세션은 secure, httpOnly 쿠키.
4. 로그아웃 시 서버 세션 무효화 + 쿠키 제거.
5. CSRF 방어(state param + SameSite=Lax 이상).

지금까지는 `dev-seed@poomgeul.invalid` 단일 사용자로 모든 Import·번역 소유권이 귀속된 상태라 attribution이 사실상 작동하지 않는다(`apps/api/src/modules/source/source.service.ts`의 `ensureSeedUser`). 앞으로의 §5 에디터·§6 Proposal 흐름은 기여자 구분을 전제하므로 이 결정이 뒤따르는 스펙의 병목이다.

앱 구조는 NestJS API(`:3000`) + Next.js 웹(`:3001`) 분리다. 같은 호스트의 다른 포트를 쓰므로 dev에서는 쿠키 공유가 가능, prod에서는 서브도메인 전략이 필요(M0 배포 스펙에서 후속).

## Decision

세 가지를 한 ADR에 묶는다.

1. **OAuth 콜백은 API(NestJS) 가 수신**한다. `/api/auth/github` → GitHub 동의 → `/api/auth/github/callback` 에서 code↔token 교환, user upsert, session row 생성, `sid` 쿠키 설정, `303 See Other` 로 Next(`/`)로 리다이렉트. Next는 서버 컴포넌트에서 `fetch('/api/auth/me', { credentials: 'include' })`로 현재 사용자 확인.
2. **세션은 Postgres `sessions` 테이블**에 저장한다. 쿠키에는 랜덤 128bit `sid`만 담고 서버 조회로 검증. 로그아웃은 `UPDATE sessions SET revoked_at = NOW()`. JWT 미사용.
3. **`users.github_id text UNIQUE NULLABLE` 컬럼을 추가**한다. OAuth upsert는 `github_id`를 키로 한다. 기존 `dev-seed` row는 NULL 유지(→ 재로그인 없이도 기존 데이터 유지). `email`·`github_handle` 변경에 견고.

라이브러리는 `@nestjs/passport` + `passport-github2`. 추가 런타임 의존은 이 둘과 `@types/passport-github2`만.

## Alternatives considered

| 옵션 | 장점 | 단점 |
|---|---|---|
| **Passport (채택)** | NestJS 공식 문서 경로. 전역 가드·body-parser 같은 side effect 없음. 세션 저장소를 우리가 정확히 원하는 모양으로(60줄 내외) 구현 가능. | 세션 저장·CSRF state 저장·로그아웃 로직을 직접 작성해야 함. |
| **Better Auth + `@thallesp/nestjs-better-auth`** | 세션/CSRF/provider upsert가 내장. 2FA·passkey·magic link·RBAC·org가 plugin으로. | NestJS 어댑터는 커뮤니티. Nest body-parser 비활성화를 강제 — 기존 Import 컨트롤러와 충돌 위험. 전역 `AuthGuard` 기본 → 공개 GET(`/api/translations*`)에 `@AllowAnonymous()`를 대량 붙여야 함. 어댑터가 `session / account / verification` 테이블을 자기 스키마로 들고 와 `users.tier` 같은 프로젝트 고유 컬럼과 ownership이 분산됨. M0가 요구하지 않는 기능까지 끌고 들어오는 규모. |
| **Next가 콜백 수신(NextAuth 스타일)** | Next 측 SSR 세션 접근 간편. | Next가 세션 소유 시 API 가드에 별도 검증 계층(Bearer 또는 동일 도메인 쿠키 파싱) 필요. 진실 원천이 둘로 쪼개짐. |
| **JWT stateless** | 서버 상태 없음. | AC §1.4(로그아웃 즉시 무효화)를 충족하려면 blacklist 필요. DB 세션이 오히려 단순하고 회전·동시 로그인 관리가 쉬움. |
| **`users.email` UNIQUE만으로 upsert** | 컬럼 추가 없음. | 사용자가 GitHub에서 primary email을 바꾸면 같은 사람에게 두 row가 생기는 위험. |

예외 시나리오: 향후 3개월 안에 2FA·passkey·magic link 중 하나를 필수로 해야 한다면 Better Auth가 유리하다. M0 스펙에는 그 요구가 없고, M2 평판 단계에 가서야 등장 가능성이 있으므로 지금은 Passport가 비용 대비 적절.

## Consequences

### 긍정

- **API가 auth 단일 진실 원천**. 모든 가드·CSRF·세션 회전이 한 모듈에 모이고, Next는 쿠키만 포워딩한다.
- ADR-0004(ar5iv 파서)·기존 Import 컨트롤러와 **side effect 없음**. body-parser, 전역 가드 설정을 건드리지 않는다.
- 로그아웃이 **쿠키 제거 + sessions row revoke 동시**로 즉시 일관 상태. JWT blacklist 운용 부담 없음.
- `github_id` 기준 upsert로 **핸들·이메일 변경에 견고**. 기존 `dev-seed` row는 NULL이라 영향 없음.
- `SessionStore` 인터페이스로 저장소를 추상화하면 향후 Redis·분산 세션 전환 비용이 낮다.

### 부정

- 세션·CSRF state·로그아웃 로직을 **직접 작성**한다(예상 60–90줄 + 테스트).
- **쿠키 도메인 공유 필요**. dev는 `localhost:3000` ↔ `localhost:3001`로 동일 호스트라 SameSite=Lax에서 문제 없음. **prod는 별도 ADR에서 서브도메인 전략 확정** 필요.
- DB 세션은 요청마다 1회 SELECT 비용이 있다. 현 규모에서 문제없지만 `sessions(session_id) WHERE revoked_at IS NULL` 인덱스 필요.
- `passport-github2`는 오래된 패키지이나 GitHub OAuth 프로토콜이 안정적이라 실질 위험은 낮음. 교체 필요 시 자체 OAuth 클라이언트로 드롭-인 가능.

### 뒤집기 비용

- **세션 저장소 교체**: `SessionStore` 인터페이스를 두면 Redis/Memcached 도입 시 AuthModule 내부만 변경.
- **provider 추가(Google/ORCID 등)**: `users.github_id`와 대칭으로 `users.orcid`(이미 스키마에 NULLABLE 존재) 또는 별도 `accounts(user_id, provider, provider_user_id)` 테이블로 확장. 기존 row는 그대로.
- **Better Auth로 교체**: sessions/users 스키마는 Better Auth가 요구하는 형태로 마이그레이션 필요. 데이터 보존은 가능하나 M0 시점보다 M1+ 재검토 지점을 잡는 편이 비용 적음.

## 구현 가이드

라이브러리·라우트 스펙과 테스트 전략만 적는다. 환경변수 체크리스트와 로컬 GitHub OAuth 앱 등록 절차는 구현 커밋에서 `guides/authentication.md`에 함께 둔다.

- **라이브러리**: `@nestjs/passport`, `passport`, `passport-github2`(+ `@types/passport-github2`).
- **스키마 변경** (구현 커밋에서 drizzle 마이그레이션 1건):
  - `users`에 `github_id text UNIQUE NULLABLE` 추가.
  - `sessions` 테이블 신설: `session_id uuid PK`, `user_id uuid FK NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `expires_at timestamptz NOT NULL`, `revoked_at timestamptz NULLABLE`. 인덱스 `(session_id) WHERE revoked_at IS NULL`.
- **라우트**:
  - `GET /api/auth/github` — `state` 생성·저장 후 GitHub 동의 URL로 302.
  - `GET /api/auth/github/callback` — `state` 대조(불일치면 400), code↔token 교환, GitHub profile fetch, user upsert(`github_id`), session row 생성, `Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax; Path=/`, `303` 로 `/` 리다이렉트.
  - `GET /api/auth/me` — 현재 세션 → 사용자(공개 필드). 미로그인이면 401.
  - `POST /api/auth/logout` — sessions revoke + 쿠키 제거.
- **Guard**: `SessionGuard` + `@CurrentUser()` 데코레이터. 가드는 **옵트-인**(쓰기 엔드포인트에만 붙임). 공개 GET(`/api/translations*`)은 기본 허용을 유지해 M0 §1의 "읽기는 익명 허용"을 지킨다.
- **`source.service.ts`의 `ensureSeedUser` 제거**: `createFromArxiv`·`reprocess` 등에 `importerId: string` 파라미터를 받게 변경. 컨트롤러에서 `req.user.id` 전달. 기존 `dev-seed` row는 데이터 호환을 위해 **DB에 남겨둔다**(ORPHAN 소유권 유지).
- **CSRF**: OAuth `state`는 32바이트 랜덤을 base64url로 생성, `pre_auth_states(state PK, created_at, expires_at)` 같은 짧은 수명(예: 5분) 테이블에 저장하거나 HMAC-서명된 단기 쿠키로 처리(후자를 선호 — 테이블 추가 없음). 쿠키는 SameSite=Lax.
- **테스트**:
  - Unit: `SessionService`(생성/조회/revoke), `AuthService.upsertGitHubUser`.
  - Integration(`poomgeul_test` DB): 콜백 happy path, `state` 불일치, revoke된 세션 접근.
  - 기존 `source.controller.spec`은 `importerId` 주입 방식 변경에 맞춰 수정.

신규 환경변수: 없음. `.env.example`에 이미 `GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SESSION_SECRET`이 나열되어 있다.

## 관련

- [specs/m0-mvp.md §1 인증](../../specs/m0-mvp.md)
- [policy/licensing.md §10.5 기여자 개인정보](../../policy/licensing.md) — 수집 최소 원칙: `email`, `display_name`, `github_handle`, `github_id`까지. GitHub 프로필의 추가 스코프는 요청하지 않는다.
- [architecture/data-model.md User](../data-model.md) — `github_id` 컬럼·`sessions` 엔티티 반영은 구현 커밋에서.
- [guides/dev-setup.md 환경 변수](../../guides/dev-setup.md)
