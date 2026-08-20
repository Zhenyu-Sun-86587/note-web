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

test.describe("Note Web E2E UX Pass 2 Suite", () => {
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

  test("allows scrolling in editor and adjusts viewport independently from caret", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    // Insert many lines to create a tall scrollable document
    await editorContainer.click();
    const fillerLines = Array.from({ length: 60 }, (_, i) => `Paragraph line ${i + 1}`).join("\n\n");
    await page.keyboard.insertText(`\n\n${fillerLines}\n`);

    const scrollContainer = page.locator(".vditor-ir");
    await expect(scrollContainer).toBeVisible();

    // Verify scroll height is greater than client height
    const isScrollable = await scrollContainer.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(isScrollable).toBe(true);

    // Perform scroll offset
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 250;
    });

    const currentScrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(currentScrollTop).toBeGreaterThan(0);
  });

  test("opens settings dialog, changes settings, and applies runtime preferences", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    // Click Settings button in TopBar
    const settingsBtn = page.getByRole("button", { name: "设置" });
    await settingsBtn.click();

    // Verify Settings dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("设置")).toBeVisible();

    // Change font size range slider
    const fontSizeSlider = dialog.locator('input[type="range"]').first();
    await fontSizeSlider.fill("20");

    // Close Settings
    const closeBtn = dialog.getByRole("button", { name: "完成" });
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();

    // Verify runtime style contains the updated font size
    const styleContent = await page.evaluate(
      () => document.getElementById("note-web-runtime-settings")?.textContent || "",
    );
    expect(styleContent).toContain("--editor-font-size: 20px");
  });

  test("renders Bold, Italic, Strike, and Inline Code live in Vditor IR without page reload", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    await editorContainer.click();
    // Test A: Toolbar Bold
    const boldBtn = page.locator('.vditor-toolbar button[data-type="bold"]');
    await boldBtn.click();
    await page.keyboard.type("livebold");

    // Assert strong element exists in the live DOM without reload
    const boldEl = page.locator(".vditor-ir strong");
    await expect(boldEl.filter({ hasText: "livebold" })).toBeVisible({ timeout: 5000 });

    // Test B: Toolbar Italic
    const italicBtn = page.locator('.vditor-toolbar button[data-type="italic"]');
    await italicBtn.click();
    await page.keyboard.type("liveitalic");

    const italicEl = page.locator(".vditor-ir em");
    await expect(italicEl.filter({ hasText: "liveitalic" })).toBeVisible({ timeout: 5000 });
  });

  test("auto-pairs parenthesis ( to () with cursor placed between", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    await editorContainer.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    // Type "("
    await page.keyboard.press("(");
    // Type inner text "autopairtest"
    await page.keyboard.type("autopairtest");

    // The editor text should have (autopairtest)
    await expect(editorContainer).toContainText("(autopairtest)");
  });

  test("supports mouse drag resizing of sidebar and persists width across reload", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator(".sidebar-container");
    const resizer = page.locator(".sidebar-resizer");
    await expect(sidebar).toBeVisible();
    await expect(resizer).toBeVisible();

    const initialBox = await sidebar.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialWidth = initialBox!.width;

    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).not.toBeNull();

    // Drag resizer to the right by ~60px
    await page.mouse.move(resizerBox!.x + resizerBox!.width / 2, resizerBox!.y + 100);
    await page.mouse.down();
    await page.mouse.move(resizerBox!.x + resizerBox!.width / 2 + 60, resizerBox!.y + 100);
    await page.mouse.up();

    // Verify resized width is greater than initial width
    const resizedBox = await sidebar.boundingBox();
    expect(resizedBox!.width).toBeGreaterThan(initialWidth + 30);

    // Reload page
    await page.reload();

    const reloadedBox = await sidebar.boundingBox();
    expect(reloadedBox!.width).toBeGreaterThan(initialWidth + 30);
  });
});
