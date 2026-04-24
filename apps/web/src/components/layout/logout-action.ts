"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Logout server action.
 *
 * Flow:
 *   1) Replay the browser's cookie against the API so the server can
 *      authenticate and mark the sessions row revoked.
 *   2) Also drop our own `sid` cookie client-side. We don't trust the
 *      Set-Cookie from fetch() to propagate through the action response
 *      uniformly, so we clear it explicitly via cookies().set.
 *   3) Redirect home.
 *
 * Runs server-side → no client JS required to call POST /api/auth/logout.
 */
export async function logoutAction(): Promise<void> {
  const cookie = (await headers()).get("cookie") ?? "";
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
  try {
    await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { cookie },
      cache: "no-store",
    });
  } catch {
    // Even if the API call errors, we still clear the local cookie and
    // bounce home — the worst case is a stale server session that will
    // expire on its own.
  }

  const jar = await cookies();
  jar.set({
    name: "sid",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  redirect("/");
}
