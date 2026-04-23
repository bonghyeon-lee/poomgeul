import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed OAuth `state` carried in a short-lived cookie (ADR-0005).
 *
 * Avoids adding a DB table just for CSRF. The cookie holds
 *   `<nonce>.<issuedAtMs>.<base64url(hmac)>`.
 * The callback re-signs `(nonce, issuedAtMs)` with SESSION_SECRET and
 * compares in constant time, plus a TTL check.
 */

export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createState(secret: string): { state: string; cookieValue: string } {
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = Date.now().toString();
  const payload = `${nonce}.${issuedAt}`;
  const mac = sign(payload, secret);
  const state = `${payload}.${mac}`;
  // The cookie value IS the state string — the callback reads the cookie,
  // compares against the `state` query param, then verifies the HMAC.
  return { state, cookieValue: state };
}

export function verifyState(
  received: string | undefined,
  cookieValue: string | undefined,
  secret: string,
): { ok: true } | { ok: false; reason: string } {
  if (!received || !cookieValue) return { ok: false, reason: "missing state" };
  if (received !== cookieValue) return { ok: false, reason: "state mismatch" };
  const parts = received.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed state" };
  const [nonce, issuedAtRaw, mac] = parts;
  if (!nonce || !issuedAtRaw || !mac) return { ok: false, reason: "malformed state" };

  const expected = sign(`${nonce}.${issuedAtRaw}`, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature" };
  }

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: "malformed state" };
  if (Date.now() - issuedAt > OAUTH_STATE_TTL_MS) return { ok: false, reason: "expired state" };

  return { ok: true };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
