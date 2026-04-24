import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlockProposerButton } from "./BlockProposerButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("BlockProposerButton", () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;

  beforeEach(() => {
    refresh.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.prompt = originalPrompt;
  });

  it("confirm 취소: 아무 요청도 나가지 않는다", async () => {
    window.confirm = vi.fn().mockReturnValue(false);
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    render(<BlockProposerButton slug="s" proposerId="u-1" proposerDisplayName="Alice" />);
    await userEvent.click(screen.getByRole("button", { name: "차단" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("201 Created: reason 포함해 POST 후 router.refresh()", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    window.prompt = vi.fn().mockReturnValue("스팸");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId: "u-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    render(<BlockProposerButton slug="my-slug" proposerId="u-1" proposerDisplayName="Alice" />);
    await userEvent.click(screen.getByRole("button", { name: "차단" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/translations/my-slug/blocklist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "u-1", reason: "스팸" }),
      }),
    );
  });

  it("prompt 공백: body에 reason 미포함", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    window.prompt = vi.fn().mockReturnValue("   ");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 201, headers: { "content-type": "application/json" } }),
      );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    render(<BlockProposerButton slug="s" proposerId="u-1" proposerDisplayName={null} />);
    await userEvent.click(screen.getByRole("button", { name: "차단" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls[0]!;
    expect(JSON.parse(call[1].body)).toEqual({ userId: "u-1" });
  });

  it("403 forbidden: 에러 문구 표시 + refresh 안 함", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    window.prompt = vi.fn().mockReturnValue("");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    render(<BlockProposerButton slug="s" proposerId="u-1" proposerDisplayName="Alice" />);
    await userEvent.click(screen.getByRole("button", { name: "차단" }));

    await waitFor(() => expect(screen.getByText(/차단 실패/)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});
