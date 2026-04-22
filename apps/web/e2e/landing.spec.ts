import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the project name heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "poomgeul" })).toBeVisible();
  });

  test("links to the API docs", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /API 문서/ });
    await expect(link).toHaveAttribute("href", "http://localhost:3000/api/docs");
  });
});
