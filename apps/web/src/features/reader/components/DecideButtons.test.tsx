import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DecideButtons } from "./DecideButtons";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("DecideButtons", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    refresh.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("승인 200: router.refresh() 호출, 버튼은 정상 노출", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ proposalId: "p", status: "merged" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    render(<DecideButtons slug="s" proposalId="p" />);
    await userEvent.click(screen.getByRole("button", { name: /^승인$/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("승인 409 rebase_required: 현재 본문·버전 안내 표시", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "rebase_required",
          currentVersion: 7,
          currentText: "새 번역 본문",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    ) as typeof globalThis.fetch;

    render(<DecideButtons slug="s" proposalId="p" />);
    await userEvent.click(screen.getByRole("button", { name: /^승인$/ }));
    await waitFor(() =>
      expect(screen.getByText(/그 사이 수정되어 버전이 어긋났습니다/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/현재 v7/)).toBeInTheDocument();
    expect(screen.getByText(/새 번역 본문/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("거절 200: 에러 메시지 없이 refresh", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ proposalId: "p", status: "rejected", resolvedAt: "now" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    render(<DecideButtons slug="s" proposalId="p" />);
    await userEvent.click(screen.getByRole("button", { name: /^거절$/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/처리 실패/)).toBeNull();
  });
});
