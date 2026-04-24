import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppHeaderView, type Me } from "./AppHeader";

function me(overrides: Partial<Me> = {}): Me {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "u@example.invalid",
    displayName: "Sample User",
    githubHandle: "sampleuser",
    tier: "new",
    ...overrides,
  };
}

describe("AppHeaderView", () => {
  it("shows a login link when not authenticated", () => {
    render(<AppHeaderView me={null} />);
    const login = screen.getByRole("link", { name: /GitHub으로 로그인/ });
    expect(login).toBeInTheDocument();
    expect(login).toHaveAttribute("href", "/api/auth/github");
    expect(screen.queryByRole("button", { name: /로그아웃/ })).toBeNull();
  });

  it("shows the display name and a logout button when authenticated", () => {
    render(<AppHeaderView me={me({ displayName: "Jane" })} />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /로그아웃/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /GitHub으로 로그인/ })).toBeNull();
  });

  it("falls back to github handle when displayName is null", () => {
    render(<AppHeaderView me={me({ displayName: null, githubHandle: "bhlee" })} />);
    expect(screen.getByText("bhlee")).toBeInTheDocument();
  });

  it("falls back to email when both displayName and githubHandle are null", () => {
    render(<AppHeaderView me={me({ displayName: null, githubHandle: null })} />);
    expect(screen.getByText("u@example.invalid")).toBeInTheDocument();
  });

  it("always renders the primary navigation links", () => {
    render(<AppHeaderView me={null} />);
    expect(screen.getByRole("link", { name: "번역본" })).toHaveAttribute("href", "/translations");
    expect(screen.getByRole("link", { name: "원문 가져오기" })).toHaveAttribute("href", "/import");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/bonghyeon-lee/poomgeul",
    );
    expect(screen.getByRole("link", { name: /API 문서/i })).toHaveAttribute("href", "/api/docs");
  });
});
