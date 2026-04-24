import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the project heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /함께 번역합니다/ })).toBeVisible();
  });

  test("links to the API docs", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("link", { name: /API 문서/ });
    // AppHeader(layout)·footer 양쪽 모두 Next rewrite 경유의 상대 URL을 사용한다.
    await expect(links.first()).toHaveAttribute("href", "/api/docs");
  });
});
