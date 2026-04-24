import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlocklistEntryItem } from "../api";
import { BlocklistManager } from "./BlocklistManager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const active: BlocklistEntryItem = {
  userId: "u-alice",
  userDisplayName: "Alice",
  userGithubHandle: "alice",
  reason: "스팸 반복",
  createdAt: "2026-04-20T10:00:00.000Z",
  revokedAt: null,
};
const revoked: BlocklistEntryItem = {
  userId: "u-bob",
  userDisplayName: "Bob",
  userGithubHandle: null,
  reason: null,
  createdAt: "2026-04-10T10:00:00.000Z",
  revokedAt: "2026-04-18T10:00:00.000Z",
};

describe("BlocklistManager", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    refresh.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("비어 있을 때 안내 문구만 표시", () => {
    render(<BlocklistManager slug="s" entries={[]} />);
    expect(screen.getByText("활성 차단 (0)")).toBeInTheDocument();
    expect(screen.getByText("현재 활성 차단이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/해제된 이력/)).toBeNull();
  });

  it("active + revoked 섹션 분리, reason/handle 렌더", () => {
    render(<BlocklistManager slug="s" entries={[active, revoked]} />);
    expect(screen.getByText("활성 차단 (1)")).toBeInTheDocument();
    expect(screen.getByText("해제된 이력 (1)")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText(/스팸 반복/)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("해제 204: DELETE 호출 + router.refresh()", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    render(<BlocklistManager slug="my-slug" entries={[active]} />);
    await userEvent.click(screen.getByRole("button", { name: "해제" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/translations/my-slug/blocklist/u-alice",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("해제 403: 에러 문구 표시, refresh 안 함", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;

    render(<BlocklistManager slug="s" entries={[active]} />);
    await userEvent.click(screen.getByRole("button", { name: "해제" }));

    await waitFor(() => expect(screen.getByText(/해제 실패/)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("revoked 행에는 해제 버튼이 없다", () => {
    render(<BlocklistManager slug="s" entries={[revoked]} />);
    expect(screen.queryByRole("button", { name: "해제" })).toBeNull();
  });
});
