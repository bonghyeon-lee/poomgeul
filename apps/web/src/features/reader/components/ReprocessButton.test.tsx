import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReprocessButton } from "./ReprocessButton";

// Silence Next's navigation hooks under jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

describe("ReprocessButton — auth-required branch", () => {
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
    render(<ReprocessButton slug="some-slug" />);

    await userEvent.click(screen.getByRole("button", { name: /지금 재처리|재처리 중/ }));

    await waitFor(() => expect(screen.getByText(/재처리는 로그인한 사용자만/)).toBeInTheDocument());
    const loginLink = screen.getByRole("link", { name: /GitHub으로 로그인/ });
    expect(loginLink).toHaveAttribute("href", "/api/auth/github");

    // 실패 메시지(HTTP 401 …) 포맷으로는 내려가지 않아야 한다.
    expect(screen.queryByText(/재처리 실패:/)).toBeNull();
  });
});
