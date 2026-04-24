import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RetryFailedButton } from "./RetryFailedButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

describe("RetryFailedButton — auth-required branch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 401, statusText: "Unauthorized" }),
      ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("401 응답을 받으면 로그인 유도 메시지와 링크를 보여준다", async () => {
    render(<RetryFailedButton slug="some-slug" failedCount={3} />);

    await userEvent.click(screen.getByRole("button", { name: /실패분 3개 재시도/ }));

    await waitFor(() =>
      expect(screen.getByText(/실패분 재시도는 로그인한 사용자만/)).toBeInTheDocument(),
    );
    const loginLink = screen.getByRole("link", { name: /GitHub으로 로그인/ });
    expect(loginLink).toHaveAttribute("href", "/api/auth/github");

    expect(screen.queryByText(/재시도 실패:/)).toBeNull();
  });
});
