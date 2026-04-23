import { parse, serialize, type SerializeOptions } from "cookie";

export const SESSION_COOKIE = "sid";

/**
 * ADR-0005 cookie policy: HttpOnly + SameSite=Lax + Secure in production.
 * Dev uses Secure=false so it works over http://localhost:3000.
 */
function baseOptions(): SerializeOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export function serializeSessionCookie(sessionId: string, expiresAt: Date): string {
  return serialize(SESSION_COOKIE, sessionId, {
    ...baseOptions(),
    expires: expiresAt,
  });
}

export function clearCookie(name: string): string {
  return serialize(name, "", {
    ...baseOptions(),
    expires: new Date(0),
  });
}

export function serializeOauthStateCookie(name: string, value: string, maxAgeMs: number): string {
  return serialize(name, value, {
    ...baseOptions(),
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const parsed = parse(header);
  // `cookie.parse` types the return as Record<string, string | undefined>.
  // Filter undefined so callers get a tight shape.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
