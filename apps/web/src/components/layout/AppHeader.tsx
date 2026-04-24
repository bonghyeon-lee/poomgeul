import { headers } from "next/headers";

import { Logo } from "@/components/ui";

import styles from "./AppHeader.module.css";
import { logoutAction } from "./logout-action";

export type Me = {
  id: string;
  email: string;
  displayName: string | null;
  githubHandle: string | null;
  tier: "new" | "verified" | "maintainer" | "curator";
};

/**
 * Global app header. Server component so it can read the session cookie at
 * render time and short-circuit to a logged-out variant without client-side
 * hydration flicker.
 *
 * Cookie forwarding: Next server-side fetches don't inherit the browser's
 * cookie jar, so we pull the incoming `Cookie` header off `headers()` and
 * replay it against the API. Same-origin via the `/api/*` rewrite in
 * next.config.ts.
 */
export async function AppHeader() {
  const me = await fetchMe();
  return <AppHeaderView me={me} />;
}

/**
 * Rendering half of the header, separated so it can be unit-tested without
 * standing up the server-side cookie/fetch pipeline. Exported for tests only.
 */
export function AppHeaderView({ me }: { me: Me | null }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Logo variant="wordmark-ko" priority />
        <nav className={styles.nav} aria-label="주요 링크">
          <a href="/translations">번역본</a>
          <a href="/import">원문 가져오기</a>
          <a href="https://github.com/bonghyeon-lee/poomgeul" rel="noreferrer">
            GitHub
          </a>
          <a href="/api/docs" rel="noreferrer">
            API 문서
          </a>
          {me ? <AuthedControls me={me} /> : <LoginLink />}
        </nav>
      </div>
    </header>
  );
}

function LoginLink() {
  // Kept as a plain <a> — the API handles the full OAuth redirect chain and
  // ends on WEB_BASE_URL with the session cookie set. No client state needed.
  return <a href="/api/auth/github">GitHub으로 로그인</a>;
}

function AuthedControls({ me }: { me: Me }) {
  const label = me.displayName ?? me.githubHandle ?? me.email;
  return (
    <span className={styles.me}>
      <span className={styles.userLabel}>{label}</span>
      <form className={styles.logoutForm} action={logoutAction}>
        <button type="submit" className={styles.logoutButton}>
          로그아웃
        </button>
      </form>
    </span>
  );
}

async function fetchMe(): Promise<Me | null> {
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie) return null;

  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
  try {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}
