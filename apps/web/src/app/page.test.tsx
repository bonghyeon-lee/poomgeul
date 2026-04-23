import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page.js";

describe("Home (landing)", () => {
  it("shows the project name in an h1", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: /함께 번역합니다/ })).toBeInTheDocument();
  });

  it("links to the API docs", () => {
    render(<Home />);
    const links = screen.getAllByRole("link", { name: /API 문서/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "http://localhost:3000/api/docs");
    }
  });
});
