import { test, expect } from "@playwright/test";

test.describe("Note Web E2E", () => {
  test("smoke: page loads and displays title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Note Web/);
  });
});
