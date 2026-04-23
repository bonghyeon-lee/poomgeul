import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the project heading", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /함께 번역한다/ }),
    ).toBeVisible();
  });

  test("links to the API docs", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("link", { name: /API 문서/ });
    await expect(links.first()).toHaveAttribute(
      "href",
      "http://localhost:3000/api/docs",
    );
  });
});
