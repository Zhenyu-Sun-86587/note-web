import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect } from "@playwright/test";

const fixturePath = path.resolve(process.cwd(), "test-vault/inbox/welcome.md");
let originalContent: string | null = null;

test.beforeAll(() => {
  if (fs.existsSync(fixturePath)) {
    originalContent = fs.readFileSync(fixturePath, "utf8");
  }
});

test.afterEach(() => {
  if (originalContent !== null && fs.existsSync(fixturePath)) {
    fs.writeFileSync(fixturePath, originalContent, "utf8");
  }
});

test.describe("Note Web E2E Edit & Persist Flow", () => {
  test("loads welcome.md, edits content, autosaves, and persists after reload", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for the main shell and editor to be ready
    await expect(page).toHaveTitle(/Note Web/);

    // Wait for note content to be loaded in editor
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    // Status bar should indicate Saved or Clean
    const statusBar = page.locator(".statusbar");
    await expect(statusBar).toBeVisible();

    // Verify initial note heading is visible
    await expect(editorContainer).toContainText("Welcome");

    // Type unique text into the editor
    const uniqueText = `Test-E2E-Token-${Date.now()}`;
    await editorContainer.click();
    await page.keyboard.type(`\n\n${uniqueText}\n`);

    // Wait for autosave debouncer and API save to complete (status goes dirty -> saving -> 已保存)
    await expect(statusBar).toContainText("已保存", { timeout: 8000 });

    // Reload page
    await page.reload();

    // Verify the unique text persisted in the reloaded editor
    const reloadedEditor = page.locator(".vditor-ir .vditor-reset");
    await expect(reloadedEditor).toBeVisible({ timeout: 10000 });
    await expect(reloadedEditor).toContainText(uniqueText, { timeout: 10000 });
  });
});
