import { createState, OAUTH_STATE_TTL_MS, verifyState } from "./oauth-state.js";

const SECRET = "test-secret-at-least-16-chars";

describe("oauth-state HMAC cookie", () => {
  it("round-trips a freshly created state", () => {
    const { state, cookieValue } = createState(SECRET);
    expect(verifyState(state, cookieValue, SECRET)).toEqual({ ok: true });
  });

  it("rejects when the cookie value differs from the query state", () => {
    const a = createState(SECRET);
    const b = createState(SECRET);
    const result = verifyState(a.state, b.cookieValue, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const { state, cookieValue } = createState(SECRET);
    const tampered = `${state.slice(0, -4)}AAAA`;
    const result = verifyState(tampered, tampered, SECRET);
    expect(result).toEqual({ ok: false, reason: "bad signature" });
    // cookie-vs-query still needs to match regardless of signature state.
    expect(verifyState(tampered, cookieValue, SECRET).ok).toBe(false);
  });

  it("rejects a state signed with a different secret", () => {
    const { state, cookieValue } = createState(SECRET);
    expect(verifyState(state, cookieValue, "other-secret-at-least-16-ch").ok).toBe(false);
  });

  it("rejects an expired state", () => {
    const realNow = Date.now;
    const fixed = realNow();
    Date.now = () => fixed;
    const { state, cookieValue } = createState(SECRET);
    Date.now = () => fixed + OAUTH_STATE_TTL_MS + 1_000;
    try {
      expect(verifyState(state, cookieValue, SECRET)).toEqual({
        ok: false,
        reason: "expired state",
      });
    } finally {
      Date.now = realNow;
    }
  });

  it.each(["", "a.b", "not.three.parts.at.all", "foo.bar.baz"])(
    "rejects malformed input: %s",
    (bad) => {
      expect(verifyState(bad, bad, SECRET).ok).toBe(false);
    },
  );

  it("rejects when either side is missing", () => {
    expect(verifyState(undefined, "anything", SECRET).ok).toBe(false);
    expect(verifyState("anything", undefined, SECRET).ok).toBe(false);
  });
});
