import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page.js";

describe("Home (landing)", () => {
  it("shows the project name in an h1", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: /poomgeul/i })).toBeInTheDocument();
  });

  it("links to the API docs", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: /API 문서/i });
    expect(link).toHaveAttribute("href", "http://localhost:3000/api/docs");
  });
});
