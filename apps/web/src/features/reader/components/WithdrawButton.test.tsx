import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WithdrawButton } from "./WithdrawButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("WithdrawButton", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    refresh.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("200이면 refresh", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ proposalId: "p", status: "withdrawn", resolvedAt: "now" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    render(<WithdrawButton slug="s" proposalId="p" />);
    await userEvent.click(screen.getByRole("button", { name: /^철회$/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("409 not_open은 에러 메시지 없이 refresh (다른 곳에서 이미 terminal 처리됨)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "not_open" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    render(<WithdrawButton slug="s" proposalId="p" />);
    await userEvent.click(screen.getByRole("button", { name: /^철회$/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/철회 실패/)).toBeNull();
  });
});
