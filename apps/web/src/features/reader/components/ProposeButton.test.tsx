import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProposeButton } from "./ProposeButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const COMMON = {
  slug: "paper",
  segmentId: "00000000-0000-0000-0000-000000000001",
  baseSegmentVersion: 2,
  initialText: "현재 번역",
};

describe("ProposeButton", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("미인증이면 로그인 유도를 보이고 버튼은 렌더되지 않는다", () => {
    render(<ProposeButton {...COMMON} isAuthed={false} />);
    expect(screen.getByText(/GitHub으로 로그인/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /제안하기/ })).toBeNull();
  });

  it("인증 상태면 버튼을 보이고 클릭 시 편집 패널로 진입한다", async () => {
    render(<ProposeButton {...COMMON} isAuthed={true} />);
    const btn = screen.getByRole("button", { name: /제안하기/ });
    await userEvent.click(btn);
    // 편집 패널: 제안 사유 라벨이 뜨는지로 상태 전환 확인.
    await waitFor(() => expect(screen.getByText(/제안 사유 \(선택\)/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /제안 보내기/ })).toBeInTheDocument();
  });

  it("409 rebase_required 응답은 리베이스 안내를 띄운다", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: "rebase_required", currentVersion: 7, currentText: "새 번역" }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ) as typeof globalThis.fetch;

    render(<ProposeButton {...COMMON} isAuthed={true} />);
    await userEvent.click(screen.getByRole("button", { name: /제안하기/ }));
    await userEvent.click(await screen.findByRole("button", { name: /제안 보내기/ }));
    await waitFor(() =>
      expect(screen.getByText(/그 사이 수정되어 버전이 어긋났습니다/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/현재 v7/)).toBeInTheDocument();
  });
});
