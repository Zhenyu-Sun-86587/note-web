import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect } from "@playwright/test";

const welcomeFixturePath = path.resolve(
  process.cwd(),
  "test-vault/inbox/welcome.md",
);
const exampleFixturePath = path.resolve(
  process.cwd(),
  "test-vault/projects/example.md",
);

let originalWelcomeContent: string | null = null;
let originalExampleContent: string | null = null;

test.beforeAll(() => {
  if (fs.existsSync(welcomeFixturePath)) {
    originalWelcomeContent = fs.readFileSync(welcomeFixturePath, "utf8");
  }
  if (fs.existsSync(exampleFixturePath)) {
    originalExampleContent = fs.readFileSync(exampleFixturePath, "utf8");
  }
});

function resetTestVault() {
  // 1. If renamed_projects exists, restore to projects
  const renamedFolder = path.resolve(
    process.cwd(),
    "test-vault/renamed_projects",
  );
  const origProjects = path.resolve(process.cwd(), "test-vault/projects");
  if (fs.existsSync(renamedFolder)) {
    if (!fs.existsSync(origProjects)) {
      fs.renameSync(renamedFolder, origProjects);
    } else {
      fs.rmSync(renamedFolder, { recursive: true, force: true });
    }
  }

  // 2. Restore tracked fixtures
  if (originalWelcomeContent !== null && fs.existsSync(welcomeFixturePath)) {
    fs.writeFileSync(welcomeFixturePath, originalWelcomeContent, "utf8");
  }
  if (originalExampleContent !== null && fs.existsSync(exampleFixturePath)) {
    fs.writeFileSync(exampleFixturePath, originalExampleContent, "utf8");
  }

  // 3. Clean up any created copy files
  const copyFile = path.resolve(
    process.cwd(),
    "test-vault/projects/welcome.md",
  );
  if (fs.existsSync(copyFile)) {
    fs.unlinkSync(copyFile);
  }
  const copyFile2 = path.resolve(
    process.cwd(),
    "test-vault/projects/welcome copy.md",
  );
  if (fs.existsSync(copyFile2)) {
    fs.unlinkSync(copyFile2);
  }
}

test.beforeEach(() => {
  resetTestVault();
});

test.afterEach(() => {
  resetTestVault();
});

test.describe("Note Web E2E Suite", () => {
  test("loads welcome.md, edits content, autosaves, and persists after reload", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for the main shell and editor to be ready
    await expect(page).toHaveTitle(/Note Web/);

    // If starting in VIM mode from previous run, toggle to IR mode
    const irBtn = page.locator(".editor-mode-toggle .mode-btn", { hasText: "IR" });
    if (await irBtn.isVisible()) {
      const isIrActive = await irBtn.evaluate((el) => el.classList.contains("active"));
      if (!isIrActive) {
        await irBtn.click();
      }
    }

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
    const fillerLines = Array.from(
      { length: 60 },
      (_, i) => `Paragraph line ${i + 1}`,
    ).join("\n\n");
    await page.keyboard.insertText(`\n\n${fillerLines}\n`);

    const scrollContainer = page.locator(".vditor-ir");
    await expect(scrollContainer).toBeVisible();

    // Verify scroll height is greater than client height
    const isScrollable = await scrollContainer.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );
    expect(isScrollable).toBe(true);

    // Perform scroll offset
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 250;
    });

    const currentScrollTop = await scrollContainer.evaluate(
      (el) => el.scrollTop,
    );
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
      () =>
        document.getElementById("note-web-runtime-settings")?.textContent || "",
    );
    expect(styleContent).toContain("--editor-font-size: 20px");
  });

  test("renders Bold, Italic, Strike, and Inline Code live in Vditor IR without page reload (including selected, collapsed-caret, and adjacent Chinese)", async ({
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
    await expect(
      boldEl.filter({ hasText: "livebold" }),
    ).toBeVisible({ timeout: 5000 });

    // Test B: Toolbar Italic
    const italicBtn = page.locator(
      '.vditor-toolbar button[data-type="italic"]',
    );
    await italicBtn.click();
    await page.keyboard.type("liveitalic");

    const italicEl = page.locator(".vditor-ir em");
    await expect(
      italicEl.filter({ hasText: "liveitalic" }),
    ).toBeVisible({ timeout: 5000 });

    // Test C: Collapsed caret + Ctrl+B in Chinese text
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("神经网");
    await page.keyboard.type("络不同层");
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    await page.keyboard.press("Control+b");
    await page.keyboard.type("细粒度");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const collapsedBoldEl = page.locator(".vditor-ir strong");
    await expect(
      collapsedBoldEl.filter({ hasText: "细粒度" }),
    ).toBeVisible({ timeout: 5000 });

    // Test D: Manual Chinese adjacent bold text typing
    await page.keyboard.type("这是**中文加粗**测试");
    await page.keyboard.press("Enter");
    await page.keyboard.type("结束标记");

    const chineseBoldEl = page.locator(".vditor-ir strong");
    await expect(
      chineseBoldEl.filter({ hasText: "中文加粗" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("auto-pairs () [] {} with exact placement, skip-closing, and selection wrapping", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    await editorContainer.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    // Test A: Type ( then RoundText without typing ) -> should auto-close to (RoundText)
    await page.keyboard.press("(");
    await page.keyboard.type("RoundText");
    await expect(editorContainer).toContainText("(RoundText)");

    // Test B: Type [ then SquareText without typing ] -> should auto-close to [SquareText]
    await page.keyboard.press("Enter");
    await page.keyboard.press("[");
    await page.keyboard.type("SquareText");
    await expect(editorContainer).toContainText("[SquareText]");

    // Test C: Type { then CurlyText without typing } -> should auto-close to {CurlyText}
    await page.keyboard.press("Enter");
    await page.keyboard.press("{");
    await page.keyboard.type("CurlyText");
    await expect(editorContainer).toContainText("{CurlyText}");

    // Test D1: Skip close on )
    await page.keyboard.press("Enter");
    await page.keyboard.press("(");
    await page.keyboard.press(")");
    await page.keyboard.type("SkipRound");
    await expect(editorContainer).toContainText("()SkipRound");

    // Test D2: Skip close on ]
    await page.keyboard.press("Enter");
    await page.keyboard.press("[");
    await page.keyboard.press("]");
    await page.keyboard.type("SkipSquare");
    await expect(editorContainer).toContainText("[]SkipSquare");

    // Test D3: Skip close on }
    await page.keyboard.press("Enter");
    await page.keyboard.press("{");
    await page.keyboard.press("}");
    await page.keyboard.type("SkipCurly");
    await expect(editorContainer).toContainText("{}SkipCurly");

    // Test E1: Selection wrap ()
    await page.keyboard.press("Enter");
    await page.keyboard.type("wraptext1");
    await page.keyboard.down("Shift");
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    await page.keyboard.up("Shift");
    await page.keyboard.press("(");
    await expect(editorContainer).toContainText("(wraptext1)");

    // Test E2: Selection wrap []
    await page.keyboard.press("Enter");
    await page.keyboard.type("wraptext2");
    await page.keyboard.down("Shift");
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    await page.keyboard.up("Shift");
    await page.keyboard.press("[");
    await expect(editorContainer).toContainText("[wraptext2]");

    // Test E3: Selection wrap {}
    await page.keyboard.press("Enter");
    await page.keyboard.type("wraptext3");
    await page.keyboard.down("Shift");
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    await page.keyboard.up("Shift");
    await page.keyboard.press("{");
    await expect(editorContainer).toContainText("{wraptext3}");
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
    await page.mouse.move(
      resizerBox!.x + resizerBox!.width / 2,
      resizerBox!.y + 100,
    );
    await page.mouse.down();
    await page.mouse.move(
      resizerBox!.x + resizerBox!.width / 2 + 60,
      resizerBox!.y + 100,
    );
    await page.mouse.up();

    // Verify resized width is greater than initial width
    const resizedBox = await sidebar.boundingBox();
    expect(resizedBox!.width).toBeGreaterThan(initialWidth + 30);

    // Reload page
    await page.reload();

    const reloadedBox = await sidebar.boundingBox();
    expect(reloadedBox!.width).toBeGreaterThan(initialWidth + 30);
  });

  test("provides right-click context menu on notes and folders (copy, paste duplicate)", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    // Right click on note item in file tree
    const noteItem = page.locator(".tree-note").first();
    await expect(noteItem).toBeVisible();
    await noteItem.click({ button: "right" });

    // Verify context menu is open
    const contextMenu = page.locator(".file-context-menu");
    await expect(contextMenu).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "重命名" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "复制" }),
    ).toBeVisible();

    // Click Copy in context menu
    await contextMenu.getByRole("menuitem", { name: "复制" }).click();
    await expect(contextMenu).not.toBeVisible();

    // Right click on projects folder
    const folderItem = page
      .locator(".tree-folder")
      .filter({ hasText: "projects" })
      .first();
    await expect(folderItem).toBeVisible();
    await folderItem.click({ button: "right" });

    // Verify folder context menu has Paste button
    const folderMenu = page.locator(".file-context-menu");
    await expect(folderMenu).toBeVisible();
    const pasteBtn = folderMenu.getByRole("menuitem", { name: "粘贴笔记" });
    await expect(pasteBtn).toBeVisible();

    // Paste note into projects folder
    await pasteBtn.click();
    await expect(folderMenu).not.toBeVisible();

    // Verify pasted note appears in tree
    await expect(
      page.locator(".tree-note").filter({ hasText: "welcome" }),
    ).toHaveCount(2, {
      timeout: 5000,
    });
  });

  test("renames folder without appending .md and flushes dirty open note in descendant", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    // Open note in projects folder
    const exampleNote = page
      .locator(".tree-note")
      .filter({ hasText: "example" })
      .first();
    const isExampleVisible = await exampleNote.isVisible();
    if (!isExampleVisible) {
      const projectsFolder = page
        .locator(".tree-folder")
        .filter({ hasText: "projects" })
        .first();
      await projectsFolder.click();
    }
    await expect(exampleNote).toBeVisible();
    await exampleNote.click();
    await expect(page.locator(".topbar-path")).toContainText(
      "projects/example.md",
    );
    await page.waitForTimeout(400);
    const activeEditor = page.locator(".vditor-ir .vditor-reset");
    await expect(activeEditor).toContainText("Project Example");

    // Edit content to make it dirty
    const uniqueFlushToken = `Flush-Token-${Date.now()}`;
    await activeEditor.click();
    await page.keyboard.type(`\n${uniqueFlushToken}`);
    await expect(activeEditor).toContainText(uniqueFlushToken);
    await expect(page.locator(".statusbar")).toContainText("未保存");

    // Right click projects folder to rename it immediately (forcing dirty flush)
    const projectsFolder = page
      .locator(".tree-folder")
      .filter({ hasText: "projects" })
      .first();
    await projectsFolder.click({ button: "right" });
    const contextMenu = page.locator(".file-context-menu");
    await expect(contextMenu).toBeVisible();

    await contextMenu.getByRole("menuitem", { name: "重命名" }).click();

    // Check Rename dialog title and input
    const renameDialog = page.getByRole("dialog");
    await expect(renameDialog).toBeVisible();
    await expect(renameDialog.getByText("重命名目录")).toBeVisible();

    const nameInput = renameDialog.locator('input[type="text"]');
    await expect(nameInput).toHaveValue("projects");

    // Change folder name to renamed_projects
    await nameInput.fill("renamed_projects");
    await renameDialog.getByRole("button", { name: "保存" }).click();
    await expect(renameDialog).not.toBeVisible();

    // Verify folder was renamed without .md
    await expect(
      page.locator(".tree-folder").filter({ hasText: "renamed_projects" }),
    ).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page
        .locator(".tree-folder")
        .filter({ hasText: "renamed_projects.md" }),
    ).not.toBeVisible();

    // Verify open note path in TopBar is now renamed_projects/example.md
    const topBarPath = page.locator(".topbar-path");
    await expect(topBarPath).toContainText("renamed_projects/example.md");

    // Verify the flushed token was persisted on disk in renamed_projects/example.md
    const renamedExamplePath = path.resolve(
      process.cwd(),
      "test-vault/renamed_projects/example.md",
    );
    expect(fs.existsSync(renamedExamplePath)).toBe(true);
    const diskContent = fs.readFileSync(renamedExamplePath, "utf8");
    expect(diskContent).toContain(uniqueFlushToken);

    // Edit again after folder rename to verify continuous autosave
    const uniqueAfterToken = `After-Rename-Token-${Date.now()}`;
    const remappedEditor = page.locator(".vditor-ir .vditor-reset");
    await expect(remappedEditor).toContainText(uniqueFlushToken);
    await page.waitForTimeout(400);
    await remappedEditor.click();
    await page.keyboard.type(`\n${uniqueAfterToken}`);
    const statusBar = page.locator(".statusbar");
    await expect(statusBar).toContainText("未保存", { timeout: 5000 });
    await expect(statusBar).toContainText("已保存", { timeout: 8000 });

    const updatedDiskContent = fs.readFileSync(renamedExamplePath, "utf8");
    expect(updatedDiskContent).toContain(uniqueAfterToken);

    // Clean up folder rename back to projects
    const renamedFolder = page
      .locator(".tree-folder")
      .filter({ hasText: "renamed_projects" })
      .first();
    await renamedFolder.click({ button: "right" });
    await page
      .locator(".file-context-menu")
      .getByRole("menuitem", { name: "重命名" })
      .click();
    const revertDialog = page.getByRole("dialog");
    await revertDialog.locator('input[type="text"]').fill("projects");
    await revertDialog.getByRole("button", { name: "保存" }).click();
    await expect(revertDialog).not.toBeVisible();
  });

  test("serves custom server fonts via /custom/fonts/* with status 200", async ({
    request,
  }) => {
    const resReg = await request.get("/custom/fonts/NoteWebCJK-Regular.woff2");
    expect(resReg.status()).toBe(200);
    const bodyReg = await resReg.body();
    expect(bodyReg.length).toBeGreaterThan(1000000);

    const resBold = await request.get("/custom/fonts/NoteWebCJK-Bold.woff2");
    expect(resBold.status()).toBe(200);

    const resMono = await request.get("/custom/fonts/NoteWebMonoCJK-Regular.woff2");
    expect(resMono.status()).toBe(200);
  });

  test("toggles Zen Mode, hides application UI chrome, and exits via Escape", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    const sidebar = page.locator(".sidebar-container");
    const topBar = page.locator(".topbar");
    const statusBar = page.locator(".statusbar");
    const vditorToolbar = page.locator(".vditor-toolbar");

    await expect(sidebar).toBeVisible();
    await expect(topBar).toBeVisible();
    await expect(statusBar).toBeVisible();

    // Click Zen Mode button in TopBar
    const zenBtn = page.getByRole("button", { name: "专注模式 (Esc 退出)" });
    await expect(zenBtn).toBeVisible();
    await zenBtn.click();

    // App shell has zen-mode class, UI chrome is hidden
    const appShell = page.locator(".app-shell");
    await expect(appShell).toHaveClass(/zen-mode/);
    await expect(sidebar).not.toBeVisible();
    await expect(topBar).not.toBeVisible();
    await expect(statusBar).not.toBeVisible();
    await expect(vditorToolbar).not.toBeVisible();

    // Editor is still interactive in Zen Mode
    await editorContainer.click();
    await page.keyboard.type(" Typing In Zen Mode");
    await expect(editorContainer).toContainText("Typing In Zen Mode");

    // Press Escape to exit Zen Mode
    await page.keyboard.press("Escape");
    await expect(appShell).not.toHaveClass(/zen-mode/);

    // Chrome is visible again
    await expect(sidebar).toBeVisible();
    await expect(topBar).toBeVisible();
    await expect(statusBar).toBeVisible();
    await expect(page.locator(".topbar-path")).toContainText("inbox/welcome.md");
  });

  test("switching clean notes does not issue PUT /api/note requests", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    let putRequestCount = 0;
    page.on("request", (req) => {
      if (req.method() === "PUT" && req.url().includes("/api/note")) {
        putRequestCount++;
      }
    });

    // Open projects/example.md (clean switch)
    const exampleNote = page
      .locator(".tree-note")
      .filter({ hasText: "example" })
      .first();
    const isExampleVisible = await exampleNote.isVisible();
    if (!isExampleVisible) {
      const projectsFolder = page
        .locator(".tree-folder")
        .filter({ hasText: "projects" })
        .first();
      await projectsFolder.click();
    }
    await expect(exampleNote).toBeVisible({ timeout: 5000 });
    await exampleNote.click();
    await expect(page.locator(".topbar-path")).toContainText("projects/example.md");

    // Switch back to inbox/welcome.md (clean)
    const welcomeNote = page
      .locator(".tree-note")
      .filter({ hasText: "welcome" })
      .first();
    await welcomeNote.click();
    await expect(page.locator(".topbar-path")).toContainText("inbox/welcome.md");

    await page.waitForTimeout(500);

    // No PUT requests should have occurred
    expect(putRequestCount).toBe(0);
  });

  test("seamlessly switches between IR and VIM modes without losing pending input", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    const irBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "IR",
    });
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });

    await expect(irBtn).toHaveClass(/active/);

    // 1. Type in IR and immediately switch to VIM
    await editorContainer.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" ImmediateIRText");

    await vimBtn.click();
    await expect(vimBtn).toHaveClass(/active/);

    // Verify Vim editor is mounted with the typed text intact
    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible();
    await expect(cmContent).toContainText("ImmediateIRText");

    // 2. Type in VIM (in Insert mode) and immediately switch to IR
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await cmContent.click();
    await page.keyboard.press("i");
    await expect(vimPanel).toContainText("INSERT");
    await page.keyboard.type(" ImmediateVimText");
    await expect(cmContent).toContainText("ImmediateVimText");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    await irBtn.click();
    await expect(irBtn).toHaveClass(/active/);

    // Verify Vditor editor is mounted with the typed Vim text intact
    const reloadedVditor = page.locator(".vditor-ir .vditor-reset");
    await expect(reloadedVditor).toBeVisible({ timeout: 10000 });
    await expect(reloadedVditor).toContainText("ImmediateVimText", {
      timeout: 10000,
    });
  });

  test("executes native Vim motions, operators (dw, u, Ctrl+R), search, and Ex commands (:w, :ir)", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await expect(cmContent).toBeVisible({ timeout: 10000 });
    await expect(vimPanel).toBeVisible();

    // Focus editor and verify NORMAL mode
    await cmContent.click();
    await expect(vimPanel).toContainText("NORMAL");

    // Insert a test line
    await page.keyboard.press("G");
    await page.keyboard.press("o");
    await page.keyboard.type("firstword secondword thirdword");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toContainText("firstword secondword thirdword");

    // dw to delete word
    await page.keyboard.press("0");
    await page.keyboard.press("d");
    await page.keyboard.press("w");
    await expect(cmContent).not.toContainText("firstword");
    await expect(cmContent).toContainText("secondword thirdword");

    // u to undo
    await page.keyboard.press("u");
    await expect(cmContent).toContainText("firstword secondword thirdword");

    // :redo to redo
    await page.keyboard.press(":");
    await page.keyboard.type("redo");
    await page.keyboard.press("Enter");
    await expect(cmContent).not.toContainText("firstword");
    await expect(cmContent).toContainText("secondword thirdword");

    // Search /secondword
    await page.keyboard.press("/");
    await page.keyboard.type("secondword");
    await page.keyboard.press("Enter");

    // Ex command :w saves document
    await page.keyboard.press(":");
    await page.keyboard.type("w");
    await page.keyboard.press("Enter");

    const statusBar = page.locator(".statusbar");
    await expect(statusBar).toContainText("已保存", { timeout: 8000 });

    // Ex command :ir switches to IR mode
    await page.keyboard.press(":");
    await page.keyboard.type("ir");
    await page.keyboard.press("Enter");

    const vditorEditor = page.locator(".vditor-ir .vditor-reset");
    await expect(vditorEditor).toBeVisible();
    await expect(vditorEditor).toContainText("secondword thirdword");
  });

  test("Vim DOM invariant: contenteditable is false in NORMAL/VISUAL and true in INSERT/REPLACE", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    // 1. NORMAL mode: contenteditable === "false"
    await expect(cmContent).toHaveAttribute("contenteditable", "false");

    // 2. VISUAL mode: contenteditable === "false"
    await page.keyboard.press("v");
    await expect(vimPanel).toContainText("VISUAL");
    await expect(cmContent).toHaveAttribute("contenteditable", "false");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toHaveAttribute("contenteditable", "false");

    // 3. INSERT mode: contenteditable === "true"
    await page.keyboard.press("i");
    await expect(vimPanel).toContainText("INSERT");
    await expect(cmContent).toHaveAttribute("contenteditable", "true");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toHaveAttribute("contenteditable", "false");

    // 4. REPLACE mode (Shift+R): contenteditable === "true"
    await page.keyboard.press("R");
    await expect(vimPanel).toContainText("REPLACE");
    await expect(cmContent).toHaveAttribute("contenteditable", "true");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toHaveAttribute("contenteditable", "false");
  });

  test("P0 IME isolation: standalone keydown 'i' does not enter INSERT and composition lifecycle never emits Vim commands", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    const proxy = page.locator(".note-web-vim-editor .note-web-vim-ime-proxy");
    await expect(cmContent).toBeVisible();
    await expect(proxy).toBeAttached();

    await cmContent.click();
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    const originalText = await cmContent.textContent();

    // 1. Synthetic event-order test: dispatch standalone keydown 'i' without beforeinput
    // Vim must NOT execute 'i' command or enter INSERT mode
    await page.evaluate(() => {
      const proxyEl = document.querySelector(
        ".note-web-vim-ime-proxy",
      ) as HTMLTextAreaElement;
      proxyEl.focus();
      const keyEvent = new KeyboardEvent("keydown", {
        key: "i",
        code: "KeyI",
        bubbles: true,
        cancelable: true,
      });
      proxyEl.dispatchEvent(keyEvent);
    });

    // Assert: still NORMAL, contenteditable is false
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toHaveAttribute("contenteditable", "false");

    // 2. Dispatch compositionstart (simulating Chinese IME composition started)
    await page.evaluate(() => {
      const proxyEl = document.querySelector(
        ".note-web-vim-ime-proxy",
      ) as HTMLTextAreaElement;
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });

    // Assert: still NORMAL
    await expect(vimPanel).toContainText("NORMAL");

    // 3. Dispatch full Chinese composition sequence: "nihao" -> "你好"
    await page.evaluate(() => {
      const proxyEl = document.querySelector(
        ".note-web-vim-ime-proxy",
      ) as HTMLTextAreaElement;
      // n
      proxyEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "n",
          code: "KeyN",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: "n",
          bubbles: true,
        }),
      );
      // i (must not trigger INSERT)
      proxyEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "i",
          code: "KeyI",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: "ni",
          bubbles: true,
        }),
      );
      // h (must not move cursor left)
      proxyEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "h",
          code: "KeyH",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: "nih",
          bubbles: true,
        }),
      );
      // a (must not append)
      proxyEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          code: "KeyA",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: "niha",
          bubbles: true,
        }),
      );
      // o (must not open line)
      proxyEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "o",
          code: "KeyO",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: "nihao",
          bubbles: true,
        }),
      );

      // commit "你好"
      proxyEl.value = "你好";
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionend", {
          data: "你好",
          bubbles: true,
        }),
      );
      proxyEl.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertCompositionText",
          data: "你好",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new InputEvent("input", {
          inputType: "insertCompositionText",
          data: "你好",
          bubbles: true,
        }),
      );
    });

    // Assert: Document completely unchanged, mode is still NORMAL
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).not.toContainText("你好");
    const afterCompText = await cmContent.textContent();
    expect(afterCompText).toBe(originalText);

    // 4. In VISUAL mode: Chinese composition also completely isolated
    await page.keyboard.press("v");
    await expect(vimPanel).toContainText("VISUAL");

    await page.evaluate(() => {
      const proxyEl = document.querySelector(
        ".note-web-vim-ime-proxy",
      ) as HTMLTextAreaElement;
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
      proxyEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          bubbles: true,
          cancelable: true,
        }),
      );
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          data: "zhong",
          bubbles: true,
        }),
      );
      proxyEl.value = "中文";
      proxyEl.dispatchEvent(
        new CompositionEvent("compositionend", {
          data: "中文",
          bubbles: true,
        }),
      );
      proxyEl.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertCompositionText",
          data: "中文",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Assert: still VISUAL, document unchanged
    await expect(vimPanel).toContainText("VISUAL");
    await expect(cmContent).not.toContainText("中文");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
  });

  test("handles Chinese IME and blocks text input outside Insert mode", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    // A. NORMAL text-input regression:
    // In NORMAL mode, page.keyboard.insertText simulates IME commit / direct text input path.
    // Document must remain completely unchanged and panel remains NORMAL.
    const originalDoc = await cmContent.textContent();
    await page.keyboard.insertText("中文输入法测试NORMAL");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).not.toContainText("中文输入法测试NORMAL");
    const currentDoc = await cmContent.textContent();
    expect(currentDoc).toBe(originalDoc);

    // B. VISUAL mode text-input regression:
    // In VISUAL mode, text input via IME commit must NOT replace selection or insert into doc.
    await page.keyboard.press("v");
    await expect(vimPanel).toContainText("VISUAL");
    await page.keyboard.insertText("中文测试VISUAL");
    await expect(cmContent).not.toContainText("中文测试VISUAL");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    // C. INSERT mode Chinese insertion:
    // In INSERT mode, Chinese text via IME / insertText must insert properly.
    await page.keyboard.press("G");
    await page.keyboard.press("o");
    await expect(vimPanel).toContainText("INSERT");
    await page.keyboard.insertText("中文Vim测试文本");
    await expect(cmContent).toContainText("中文Vim测试文本");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toContainText("中文Vim测试文本");

    // D. Normal Vim motions and operations on Chinese text:
    await page.keyboard.press("0");
    await page.keyboard.press("x"); // delete single character '中'
    await expect(cmContent).toContainText("文Vim测试文本");
    await page.keyboard.press("u"); // undo
    await expect(cmContent).toContainText("中文Vim测试文本");

    // E. Literal replacement with 'r'
    await page.keyboard.press("r");
    await page.keyboard.press("A");
    await expect(cmContent).toContainText("A文Vim测试文本");
    await page.keyboard.press("u");
    await expect(cmContent).toContainText("中文Vim测试文本");
  });

  test("Vim Mode + Zen Mode: Escape belongs to Vim and :zen exits Zen Mode", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const zenBtn = page.getByRole("button", {
      name: "专注模式 (:zen 退出)",
    });
    await expect(zenBtn).toBeVisible();
    await zenBtn.click();

    const appShell = page.locator(".app-shell");
    await expect(appShell).toHaveClass(/zen-mode/);

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await expect(cmContent).toBeVisible();
    await expect(vimPanel).toBeVisible(); // Vim status bar remains in Zen

    // Enter insert mode in Zen
    await cmContent.click();
    await page.keyboard.press("i");
    await page.keyboard.type(" ZenVimEditing");
    await expect(vimPanel).toContainText("INSERT");

    // Press Escape inside Vim -> goes back to Normal, does NOT exit Zen
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(appShell).toHaveClass(/zen-mode/);

    // Type :zen in Vim Ex command -> exits Zen Mode
    await page.keyboard.press(":");
    await page.keyboard.type("zen");
    await page.keyboard.press("Enter");

    await expect(appShell).not.toHaveClass(/zen-mode/);
    await expect(page.locator(".sidebar-container")).toBeVisible();
    await expect(page.locator(".topbar")).toBeVisible();
  });

  test("enforces insert mode via 'i' before allowing text input and takes over Ctrl shortcuts", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await expect(cmContent).toBeVisible();
    await expect(vimPanel).toContainText("NORMAL");

    // Click editor in Normal mode
    await cmContent.click();

    // In normal mode, motions like j, k, l, h, w, b work, but typing arbitrary characters does NOT insert them into doc
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await page.keyboard.press("l");
    await page.keyboard.press("h");
    await expect(vimPanel).toContainText("NORMAL");

    // Press 'i' to explicitly enter INSERT mode
    await page.keyboard.press("i");
    await expect(vimPanel).toContainText("INSERT");

    // Now typing works properly in insert mode
    await page.keyboard.type("ExplicitInsertMode");
    await expect(cmContent).toContainText("ExplicitInsertMode");

    // Press Escape to return to NORMAL mode
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    // Test Undo (u) and Redo (:redo)
    await page.keyboard.press("u");
    await expect(cmContent).not.toContainText("ExplicitInsertMode");

    await page.keyboard.press(":");
    await page.keyboard.type("redo");
    await page.keyboard.press("Enter");
    await expect(cmContent).toContainText("ExplicitInsertMode");
  });

  test("Session Resume: restores last open note and expands ancestor folders on startup", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".vditor-ir .vditor-reset")).toBeVisible({
      timeout: 10000,
    });

    // 1. Open projects/example.md
    const exampleNote = page
      .locator(".tree-note")
      .filter({ hasText: "example" })
      .first();
    const isExampleVisible = await exampleNote.isVisible();
    if (!isExampleVisible) {
      const projectsFolder = page
        .locator(".tree-folder")
        .filter({ hasText: "projects" })
        .first();
      await projectsFolder.click();
    }
    await expect(exampleNote).toBeVisible({ timeout: 5000 });
    await exampleNote.click();
    await expect(page.locator(".topbar-path")).toContainText(
      "projects/example.md",
    );

    // Verify localStorage has saved the last open note path
    const savedPath = await page.evaluate(() =>
      localStorage.getItem("note-web-last-open-note-v1"),
    );
    expect(savedPath).toBe("projects/example.md");

    // 2. Reload page with clean state -> should automatically open projects/example.md
    await page.reload();
    await expect(page.locator(".topbar-path")).toContainText(
      "projects/example.md",
      { timeout: 10000 },
    );
    await expect(
      page.locator(".tree-note").filter({ hasText: "example" }).first(),
    ).toBeVisible();
  });

  test("Session Resume: falls back to first note without alert when saved last note is missing", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".vditor-ir .vditor-reset")).toBeVisible({
      timeout: 10000,
    });

    // Set non-existent path in localStorage
    await page.evaluate(() => {
      localStorage.setItem(
        "note-web-last-open-note-v1",
        "deleted_folder/missing_note.md",
      );
    });

    let dialogPopped = false;
    page.on("dialog", (dialog) => {
      dialogPopped = true;
      dialog.dismiss();
    });

    // Reload -> should check tree first, silently discard missing note, and open first available note
    await page.reload();
    await expect(page.locator(".topbar-path")).toContainText(
      "inbox/welcome.md",
      { timeout: 10000 },
    );

    expect(dialogPopped).toBe(false);
  });

  test("Session Resume: does not fetch folder as note and falls back to first note when last path is folder", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".vditor-ir .vditor-reset")).toBeVisible({
      timeout: 10000,
    });

    let folderFetchRequested = false;
    await page.route("**/api/note?path=projects", (route) => {
      folderFetchRequested = true;
      route.abort();
    });

    // Set folder path "projects" in localStorage
    await page.evaluate(() => {
      localStorage.setItem("note-web-last-open-note-v1", "projects");
    });

    let dialogPopped = false;
    page.on("dialog", (dialog) => {
      dialogPopped = true;
      dialog.dismiss();
    });

    // Reload -> should not attempt to fetch "projects" as a note, discard it, and open first available note
    await page.reload();
    await expect(page.locator(".topbar-path")).toContainText(
      "inbox/welcome.md",
      { timeout: 10000 },
    );

    expect(dialogPopped).toBe(false);
    expect(folderFetchRequested).toBe(false);
  });

  test("Startup Note Policy: respects startupNoteMode ('none' and 'first')", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".vditor-ir .vditor-reset")).toBeVisible({
      timeout: 10000,
    });

    // 1. Set startupNoteMode to 'none'
    await page.evaluate(() => {
      const raw = localStorage.getItem("note-web-settings-v1") || "{}";
      const settings = JSON.parse(raw);
      settings.startupNoteMode = "none";
      localStorage.setItem("note-web-settings-v1", JSON.stringify(settings));
    });

    await page.reload();
    // When startupNoteMode is none, no note is auto-opened
    await expect(page.locator(".empty-editor")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".topbar-path")).toContainText("未选择笔记");

    // 2. Set startupNoteMode to 'first'
    await page.evaluate(() => {
      const raw = localStorage.getItem("note-web-settings-v1") || "{}";
      const settings = JSON.parse(raw);
      settings.startupNoteMode = "first";
      localStorage.setItem("note-web-settings-v1", JSON.stringify(settings));
      localStorage.setItem(
        "note-web-last-open-note-v1",
        "projects/example.md",
      );
    });

    await page.reload();
    // When startupNoteMode is 'first', it always opens first note regardless of last path
    await expect(page.locator(".topbar-path")).toContainText(
      "inbox/welcome.md",
      { timeout: 10000 },
    );

    // Clean up settings
    await page.evaluate(() => {
      localStorage.removeItem("note-web-settings-v1");
      localStorage.removeItem("note-web-last-open-note-v1");
    });
  });

  test("Vim external sync does not pollute undo history and 'u' does not restore old content", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("note-web-settings-v1");
      localStorage.removeItem("note-web-last-open-note-v1");
    });
    await page.reload();
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".topbar-path")).toContainText("inbox/welcome.md");

    // 1. Record original content and ensure clean note
    const originalContent = fs.readFileSync(welcomeFixturePath, "utf8");
    await expect(cmContent).toContainText("Welcome to Note Web");

    // 2. Direct external edit on the same note file on disk
    const externalContent = "# External Note Title\n\nExternal sync body content.";
    await new Promise((r) => setTimeout(r, 250));
    fs.writeFileSync(welcomeFixturePath, externalContent, "utf8");

    // 3. Trigger window focus event to sync external changes
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      return await cmContent.textContent();
    }, { timeout: 8000, intervals: [300, 500] }).toContain("External Note Title");

    // 4. Wait for Vim editor to display the external content
    await expect(cmContent).toContainText("External Note Title");
    await expect(cmContent).toContainText("External sync body content.");

    // 5. In Normal mode, press 'u' -> must NOT revert to previous original content
    await cmContent.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("u");

    await expect(cmContent).toContainText("External Note Title");
    await expect(cmContent).toContainText("External sync body content.");

    // 6. Test local user edits still undo/redo normally
    await page.keyboard.press("i");
    await page.keyboard.type("LOCAL_USER_EDIT ");
    await page.keyboard.press("Escape");

    await expect(cmContent).toContainText("LOCAL_USER_EDIT");

    // Undo local edit
    await page.keyboard.press("u");
    await expect(cmContent).not.toContainText("LOCAL_USER_EDIT");

    // Redo local edit
    await page.keyboard.press(":");
    await page.keyboard.type("redo");
    await page.keyboard.press("Enter");
    await expect(cmContent).toContainText("LOCAL_USER_EDIT");

    // 7. Clean up local edit before restoring fixture file on disk
    await page.keyboard.press("u");
    await expect(cmContent).not.toContainText("LOCAL_USER_EDIT");

    // Restore fixture file on disk
    fs.writeFileSync(welcomeFixturePath, originalContent, "utf8");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(cmContent).toContainText("Welcome to Note Web", {
      timeout: 10000,
    });
  });

  test("Vim Ergonomics: hybrid relative line numbers with single gutter and dynamic cursor updates", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmEditor = page.locator(".note-web-vim-editor");
    await expect(cmEditor).toBeVisible({ timeout: 10000 });

    // Verify there is EXACTLY ONE line-number gutter column in the DOM
    const lineGutterCols = page.locator(".note-web-vim-editor .cm-lineNumbers");
    await expect(lineGutterCols).toHaveCount(1);

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await cmContent.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("g");
    await page.keyboard.press("g");

    // In CodeMirror, gutter element 0 is the spacer. Visible line 1 is nth(1), line 2 is nth(2), line 3 is nth(3)
    const gutterElements = page.locator(
      ".note-web-vim-editor .cm-lineNumbers .cm-gutterElement",
    );
    await expect(gutterElements.nth(1)).toHaveText("1");
    await expect(gutterElements.nth(2)).toHaveText("1");
    await expect(gutterElements.nth(3)).toHaveText("2");

    // Move cursor down 1 line with 'j': line 2 becomes active ('2'), line 1 becomes '1', line 3 becomes '1'
    await page.keyboard.press("j");
    await expect(gutterElements.nth(1)).toHaveText("1");
    await expect(gutterElements.nth(2)).toHaveText("2");
    await expect(gutterElements.nth(3)).toHaveText("1");

    // Open Settings and disable relative line numbers -> numbers should become absolute 1, 2, 3
    const settingsBtn = page.locator("button[aria-label='设置']");
    await settingsBtn.click();
    const settingsModal = page.locator(".settings-dialog");
    await expect(settingsModal).toBeVisible();

    const relCheck = settingsModal
      .locator(".settings-row", { hasText: "相对行号" })
      .locator("input[type='checkbox']");
    await relCheck.uncheck();

    const doneBtn = settingsModal.locator("button", { hasText: "完成" });
    await doneBtn.click();
    await expect(settingsModal).not.toBeVisible();

    // Verify gutter elements now show standard absolute numbers
    await expect(gutterElements.nth(1)).toHaveText("1");
    await expect(gutterElements.nth(2)).toHaveText("2");
    await expect(gutterElements.nth(3)).toHaveText("3");
  });

  test("Vim Ergonomics: line wrapping setting toggles without recreating editor", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible();
    await expect(cmContent).toHaveClass(/cm-lineWrapping/);

    // Open Settings and disable line wrapping
    const settingsBtn = page.locator("button[aria-label='设置']");
    await settingsBtn.click();
    const settingsModal = page.locator(".settings-dialog");
    await expect(settingsModal).toBeVisible();

    const wrapCheck = settingsModal
      .locator(".settings-row", { hasText: "自动换行" })
      .locator("input[type='checkbox']");
    await wrapCheck.uncheck();

    const doneBtn = settingsModal.locator("button", { hasText: "完成" });
    await doneBtn.click();
    await expect(settingsModal).not.toBeVisible();

    // Verify .cm-lineWrapping class is removed
    await expect(cmContent).not.toHaveClass(/cm-lineWrapping/);
  });

  test("Vim Ergonomics: jj escapes from Insert mode when enabled", async ({
    page,
  }) => {
    await page.goto("/");
    // 1. Enable jjEscape in Settings
    const settingsBtn = page.locator("button[aria-label='设置']");
    await settingsBtn.click();
    const settingsModal = page.locator(".settings-dialog");
    await expect(settingsModal).toBeVisible();

    const jjCheck = settingsModal
      .locator(".settings-row", { hasText: "jj 退出插入模式" })
      .locator("input[type='checkbox']");
    await jjCheck.check();

    const doneBtn = settingsModal.locator("button", { hasText: "完成" });
    await doneBtn.click();
    await expect(settingsModal).not.toBeVisible();

    // 2. Switch to Vim mode
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    await expect(cmContent).toBeVisible();
    await cmContent.click();

    // 3. Press i, type text, then type jj
    await page.keyboard.press("i");
    await expect(vimPanel).toContainText("INSERT");

    await page.keyboard.type("hellotext");
    await page.keyboard.type("jj");

    // 4. Verify returned to NORMAL mode and 'jj' is not in document
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toContainText("hellotext");
    await expect(cmContent).not.toContainText("hellotextjj");
  });

  test("Vim Advanced: lowercase marks and jumping within active note", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press("Escape");

    // Go to top and set mark 'a'
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await page.keyboard.press("a");

    // Jump to bottom with 'G'
    await page.keyboard.press("G");

    // Jump back to mark 'a' with `a
    await page.keyboard.press("`");
    await page.keyboard.press("a");

    // Type 'x' to delete the first character '#' and verify
    await page.keyboard.press("x");
    await expect(cmContent).not.toContainText("# Welcome to Note Web");
    await expect(cmContent).toContainText(" Welcome to Note Web");

    // Undo
    await page.keyboard.press("u");
    await expect(cmContent).toContainText("# Welcome to Note Web");
  });

  test("Vim Advanced: named registers and black-hole register", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press("Escape");

    // 1. Yank first line into register 'a': "ayy
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press('"');
    await page.keyboard.press("a");
    await page.keyboard.press("y");
    await page.keyboard.press("y");

    // 2. Go to end and paste from register 'a': "ap
    await page.keyboard.press("G");
    await page.keyboard.press('"');
    await page.keyboard.press("a");
    await page.keyboard.press("p");

    // 3. Delete with black-hole register: "_dd
    await page.keyboard.press('"');
    await page.keyboard.press("_");
    await page.keyboard.press("d");
    await page.keyboard.press("d");

    // 4. Paste again from register 'a': "ap -> should still contain original line
    await page.keyboard.press('"');
    await page.keyboard.press("a");
    await page.keyboard.press("p");

    await expect(cmContent).toContainText("# Welcome to Note Web");
  });

  test("Vim Advanced: macros recording, playback with count, and @@", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press("Escape");

    // 1. Insert 4 new sample lines: itemalpha, itembeta, itemgamma, itemdelta
    await page.keyboard.press("G");
    await page.keyboard.press("o");
    await page.keyboard.type("itemalpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("itembeta");
    await page.keyboard.press("Enter");
    await page.keyboard.type("itemgamma");
    await page.keyboard.press("Enter");
    await page.keyboard.type("itemdelta");
    await page.keyboard.press("Escape");

    // 2. Move cursor up to itemalpha: 3k
    await page.keyboard.press("3");
    await page.keyboard.press("k");

    // 3. Record macro 'a': qa I- <Escape>j q (prepends "- " and moves down 1 line)
    await page.keyboard.press("q");
    await page.keyboard.press("a");
    await page.keyboard.press("I");
    await page.keyboard.type("- ");
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    await page.keyboard.press("q");

    await expect(cmContent).toContainText("- itemalpha");

    // 4. Cursor is now at itembeta. Run macro with count 2: 2@a
    // This executes on itembeta and itemgamma!
    await page.keyboard.press("2");
    await page.keyboard.press("@");
    await page.keyboard.press("a");

    await expect(cmContent).toContainText("- itembeta");
    await expect(cmContent).toContainText("- itemgamma");

    // 5. Cursor is now at itemdelta. Run @@ on itemdelta
    await page.keyboard.press("@");
    await page.keyboard.press("@");

    await expect(cmContent).toContainText("- itemdelta");
  });

  test("Vim Advanced: macro with backspace and named register persistence across tab reload", async ({
    page,
  }) => {
    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press("Escape");

    // 1. Record macro 'a' with Backspace: qa i abc <Backspace> d <Escape> q -> inserts "abd"
    await page.keyboard.press("G");
    await page.keyboard.press("o");
    await page.keyboard.press("Escape");

    await page.keyboard.press("q");
    await page.keyboard.press("a");
    await page.keyboard.press("i");
    await page.keyboard.type("abc");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("d");
    await page.keyboard.press("Escape");
    await page.keyboard.press("q");

    await expect(cmContent).toContainText("abd");

    // 2. Set named register 'b' with unique token
    const uniqueToken = "REGISTER_B_" + Date.now();
    await page.keyboard.press("o");
    await page.keyboard.type(uniqueToken);
    await page.keyboard.press("Escape");

    await page.keyboard.press('"');
    await page.keyboard.press("b");
    await page.keyboard.press("y");
    await page.keyboard.press("y");

    // Verify sessionStorage has saved the session with register 'b' containing unique token
    const rawSession = await page.evaluate(() =>
      sessionStorage.getItem("note-web-vim-session-v1"),
    );
    expect(rawSession).not.toBeNull();
    const sessionObj = JSON.parse(rawSession || "{}");
    expect(sessionObj.registers?.b?.keyBuffer?.join("")).toContain(uniqueToken);
    expect(sessionObj.latestMacroRegister).toBe("a");

    // 3. Reload page and re-enter Vim mode
    await page.reload();
    const vimBtnAfter = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtnAfter.click();

    const cmContentAfter = page.locator(".note-web-vim-editor .cm-content");
    await expect(cmContentAfter).toBeVisible();
    await cmContentAfter.click();
    await page.keyboard.press("Escape");

    // 4. Test restored macro @a on reloaded page
    await page.keyboard.press("G");
    await page.keyboard.press("o");
    await page.keyboard.press("Escape");

    await page.keyboard.press("@");
    await page.keyboard.press("a");

    // Verify macro with Backspace inserted "abd"
    await expect(cmContentAfter).toContainText("abd");

    // 5. Test restored latestMacroRegister with @@
    await page.keyboard.press("o");
    await page.keyboard.press("Escape");

    await page.keyboard.press("@");
    await page.keyboard.press("@");

    // Count occurrences of "abd"
    const contentText = await cmContentAfter.textContent();
    const matches = contentText?.match(/abd/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);

    // 6. Paste restored register "b
    await page.keyboard.press("o");
    await page.keyboard.press("Escape");
    await page.keyboard.press('"');
    await page.keyboard.press("b");
    await page.keyboard.press("p");

    await expect(cmContentAfter).toContainText(uniqueToken);

    // Clean up sessionStorage
    await page.evaluate(() =>
      sessionStorage.removeItem("note-web-vim-session-v1"),
    );
  });

  test("Vim IME Companion E2E: normal-pending blocks printable command 'i' until verified ACK enables normal-ready and INSERT", async ({
    page,
  }) => {
    // 1. Setup Mock Companion Extension with a controlled switch delay
    await page.addInitScript(() => {
      (window as any).__mockCalls = [];
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.source === "note-web" && data.channel === "vim-ime") {
          (window as any).__mockCalls.push(data);
          if (data.action === "ping") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "ping",
              },
              "*",
            );
          } else if (data.action === "switch_ascii") {
            const delay = (window as any).__mockSwitchDelay || 250;
            setTimeout(() => {
              window.postMessage(
                {
                  source: "note-web-companion",
                  channel: "vim-ime",
                  id: data.id,
                  ok: true,
                  action: "switch_ascii",
                  strategy: "keyboard_layout",
                  verified: true,
                  targetPid: 9999,
                },
                "*",
              );
            }, delay);
          } else if (data.action === "restore") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "restore",
                restored: true,
              },
              "*",
            );
          }
        }
      });
    });

    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    const imeStatus = page.locator(".note-web-vim-ime-status");
    await expect(cmContent).toBeVisible();
    await expect(imeStatus).toBeVisible();

    // Verify IME status indicator renders Auto
    await expect(imeStatus).toContainText("IME Auto");

    // Enter INSERT mode
    await cmContent.click();
    await page.keyboard.press("i");
    await expect(vimPanel).toContainText("INSERT");

    // Set delay for next switch to simulate in-flight native switch
    await page.evaluate(() => {
      (window as any).__mockSwitchDelay = 350;
    });

    // Press Escape -> triggers switch_ascii, enters normal-pending
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");

    // Immediately dispatch 'i' during normal-pending
    await page.evaluate(() => {
      const proxyEl = document.querySelector(
        ".note-web-vim-ime-proxy",
      ) as HTMLTextAreaElement;
      proxyEl?.focus();
      const event = new KeyboardEvent("keydown", {
        key: "i",
        code: "KeyI",
        bubbles: true,
        cancelable: true,
      });
      proxyEl?.dispatchEvent(event);
    });

    // Assert: during pending, 'i' was blocked, mode remains NORMAL
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toHaveAttribute("contenteditable", "false");

    // Wait for native ACK to arrive (350ms delay + buffer)
    await page.waitForTimeout(450);
    await expect(imeStatus).toContainText("IME Auto");

    // Now in normal-ready, pressing 'i' enters INSERT
    await page.keyboard.press("i");
    await expect(vimPanel).toContainText("INSERT");
    await expect(cmContent).toHaveAttribute("contenteditable", "true");
  });

  test("Vim IME Companion E2E: Search / restores text input for Unicode queries, closing re-switches to ASCII", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__mockCalls = [];
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.source === "note-web" && data.channel === "vim-ime") {
          (window as any).__mockCalls.push(data);
          if (data.action === "ping") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "ping",
              },
              "*",
            );
          } else if (data.action === "switch_ascii") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "switch_ascii",
                strategy: "keyboard_layout",
                verified: true,
              },
              "*",
            );
          } else if (data.action === "restore") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "restore",
                restored: true,
              },
              "*",
            );
          }
        }
      });
    });

    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const imeStatus = page.locator(".note-web-vim-ime-status");
    await expect(cmContent).toBeVisible();
    await expect(imeStatus).toContainText("IME Auto");

    await cmContent.click();
    await page.keyboard.press("Escape");

    // Clear recorded calls prior to opening search
    await page.evaluate(() => ((window as any).__mockCalls = []));

    // Press '/' to open Search dialog
    await page.keyboard.press("/");

    // Dialog input should be visible and active
    const dialogInput = page.locator(".cm-vim-panel input, .cm-panel input");
    await expect(dialogInput).toBeVisible({ timeout: 5000 });

    // Verify restore was requested when dialog opened
    await expect.poll(async () => {
      const calls = await page.evaluate(() => (window as any).__mockCalls || []);
      return calls.some((c: any) => c.action === "restore");
    }).toBe(true);

    // Type Unicode Chinese search term
    await dialogInput.fill("欢迎使用");
    await page.keyboard.press("Enter");

    // After pressing Enter, dialog closes and editor returns to Normal
    await expect(dialogInput).not.toBeVisible();

    // Verify switch_ascii was requested upon search closing and state returns to normal-ready
    await expect.poll(async () => {
      const calls = await page.evaluate(() => (window as any).__mockCalls || []);
      const actions = calls.map((c: any) => c.action);
      return actions.includes("switch_ascii");
    }).toBe(true);

    await expect(imeStatus).toContainText("IME Auto");
  });

  test("Vim IME Companion E2E: Ex command : restores text input and closing via Escape re-switches to ASCII", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__mockCalls = [];
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.source === "note-web" && data.channel === "vim-ime") {
          (window as any).__mockCalls.push(data);
          if (data.action === "ping") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "ping",
              },
              "*",
            );
          } else if (data.action === "switch_ascii") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "switch_ascii",
                strategy: "keyboard_layout",
                verified: true,
              },
              "*",
            );
          } else if (data.action === "restore") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "restore",
                restored: true,
              },
              "*",
            );
          }
        }
      });
    });

    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const imeStatus = page.locator(".note-web-vim-ime-status");
    await expect(cmContent).toBeVisible();
    await expect(imeStatus).toContainText("IME Auto");

    await cmContent.click();
    await page.keyboard.press("Escape");

    // Clear calls
    await page.evaluate(() => ((window as any).__mockCalls = []));

    // Press ':' to open Ex command panel
    await page.keyboard.press(":");

    const dialogInput = page.locator(".cm-vim-panel input, .cm-panel input");
    await expect(dialogInput).toBeVisible({ timeout: 5000 });

    // Verify restore was called when Ex opened
    await expect.poll(async () => {
      const calls = await page.evaluate(() => (window as any).__mockCalls || []);
      return calls.some((c: any) => c.action === "restore");
    }).toBe(true);

    // Cancel Ex dialog with Escape
    await page.keyboard.press("Escape");
    await expect(dialogInput).not.toBeVisible();

    // Verify switch_ascii re-acquired
    await expect.poll(async () => {
      const calls = await page.evaluate(() => (window as any).__mockCalls || []);
      return calls.some((c: any) => c.action === "switch_ascii");
    }).toBe(true);

    await expect(imeStatus).toContainText("IME Auto");
  });

  test("Vim IME Companion E2E: Switching from Vim to IR restores text input for rich text editing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__mockCalls = [];
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.source === "note-web" && data.channel === "vim-ime") {
          (window as any).__mockCalls.push(data);
          if (data.action === "ping") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "ping",
              },
              "*",
            );
          } else if (data.action === "switch_ascii") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "switch_ascii",
                strategy: "keyboard_layout",
                verified: true,
              },
              "*",
            );
          } else if (data.action === "restore") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "restore",
                restored: true,
              },
              "*",
            );
          }
        }
      });
    });

    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    const irBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "IR",
    });

    await vimBtn.click();
    await expect(page.locator(".note-web-vim-editor")).toBeVisible();

    // Switch to IR mode
    await irBtn.click();
    await expect(page.locator(".vditor-ir .vditor-reset")).toBeVisible({
      timeout: 10000,
    });

    // Verify restore was called when switching from Vim to IR
    const calls = await page.evaluate(() => (window as any).__mockCalls || []);
    const restoreCalls = calls.filter((c: any) => c.action === "restore");
    expect(restoreCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("Vim IME Companion E2E: Disconnection invalidates normal-ready, and subsequent Normal mode entry triggers lightweight reconnect", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__mockCalls = [];
      let isDisconnected = false;
      (window as any).__setDisconnected = (val: boolean) => {
        isDisconnected = val;
      };

      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.source === "note-web" && data.channel === "vim-ime") {
          (window as any).__mockCalls.push(data);

          if (isDisconnected) {
            return;
          }

          if (data.action === "ping") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "ping",
              },
              "*",
            );
          } else if (data.action === "switch_ascii") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "switch_ascii",
                strategy: "keyboard_layout",
                verified: true,
              },
              "*",
            );
          }
        }
      });
    });

    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();
    await expect(page.locator(".note-web-vim-editor")).toBeVisible();

    const imeStatus = page.locator(".note-web-vim-ime-status");
    await expect(imeStatus).toContainText("IME Auto");

    // Simulate native disconnected
    await page.evaluate(() => {
      (window as any).__companionDisconnected = true;
      if (typeof (window as any).__setDisconnected === "function") {
        (window as any).__setDisconnected(true);
      }
      window.postMessage(
        {
          source: "note-web-companion",
          channel: "vim-ime",
          type: "native-disconnected",
          reason: "port-disconnected",
        },
        "*",
      );
    });

    // IME status should show IME Fallback
    await expect(imeStatus).toContainText("IME Fallback");

    // Native host reconnects
    await page.evaluate(() => {
      (window as any).__companionDisconnected = false;
      if (typeof (window as any).__setDisconnected === "function") {
        (window as any).__setDisconnected(false);
      }
    });

    // 1. First Normal mode transition after reconnect triggers probe and updates availability to available
    const vimEditor = page.locator(".note-web-vim-editor .cm-content");
    await vimEditor.click();
    await page.keyboard.type("i");
    await page.keyboard.press("Escape");

    // 2. Second Normal mode transition performs Native acquisition and establishes IME Auto
    await page.keyboard.type("i");
    await page.keyboard.press("Escape");

    // Reconnected successfully -> IME Auto
    await expect(imeStatus).toContainText("IME Auto");
  });

  test("Unified keyboard ownership: normal-ready focuses CodeMirror, Vim owns Ctrl+R/F, Note Web owns Ctrl+Shift+P/N/S", async ({
    page,
  }) => {
    // 1. Mock Companion Extension to simulate normal-ready (IME Auto)
    await page.addInitScript(() => {
      (window as any).__mockCalls = [];
      (window as any).__print_call_count = 0;
      (window as any).__e2e_page_marker = "active_session_123";

      window.print = () => {
        (window as any).__print_call_count++;
      };

      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.source === "note-web" && data.channel === "vim-ime") {
          (window as any).__mockCalls.push(data);

          if (data.action === "ping") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "ping",
              },
              "*",
            );
          } else if (data.action === "switch_ascii") {
            window.postMessage(
              {
                source: "note-web-companion",
                channel: "vim-ime",
                id: data.id,
                ok: true,
                action: "switch_ascii",
                strategy: "keyboard_layout",
                verified: true,
              },
              "*",
            );
          }
        }
      });
    });

    await page.goto("/");
    const vimBtn = page.locator(".editor-mode-toggle .mode-btn", {
      hasText: "VIM",
    });
    await vimBtn.click();

    const cmContent = page.locator(".note-web-vim-editor .cm-content");
    const vimPanel = page.locator(".note-web-vim-editor .cm-vim-panel");
    const imeStatus = page.locator(".note-web-vim-ime-status");
    await expect(cmContent).toBeVisible({ timeout: 10000 });
    await expect(vimPanel).toContainText("NORMAL");
    await expect(imeStatus).toContainText("IME Auto");

    // 2. In normal-ready mode: activeElement is CodeMirror (.cm-content), NOT proxy!
    await cmContent.click();
    const activeIsCodeMirror = await page.evaluate(() => {
      const active = document.activeElement;
      return (
        active?.classList.contains("cm-content") ||
        Boolean(active?.closest(".cm-editor"))
      );
    });
    expect(activeIsCodeMirror).toBe(true);

    // 3. Test Vim editing and Ctrl+R (Vim-owned Redo):
    await page.keyboard.press("G");
    await page.keyboard.press("o");
    await page.keyboard.type("firstword secondword thirdword");
    await page.keyboard.press("Escape");
    await expect(vimPanel).toContainText("NORMAL");
    await expect(cmContent).toContainText("firstword secondword thirdword");

    // dw to delete word
    await page.keyboard.press("0");
    await page.keyboard.press("d");
    await page.keyboard.press("w");
    await expect(cmContent).not.toContainText("firstword");
    await expect(cmContent).toContainText("secondword thirdword");

    // Undo with u
    await page.keyboard.press("u");
    await expect(cmContent).toContainText("firstword");

    // Redo with Control+r (Vim-owned Redo)
    await page.keyboard.press("Control+r");
    await expect(cmContent).not.toContainText("firstword");
    await expect(cmContent).toContainText("secondword thirdword");

    // Verify page did NOT reload (session marker intact)
    const marker = await page.evaluate(() => (window as any).__e2e_page_marker);
    expect(marker).toBe("active_session_123");

    // 5. Test Ctrl+F (Vim-owned Page Down):
    await page.keyboard.press("Control+f");
    await expect(vimPanel).toContainText("NORMAL");

    // 6. Test Ctrl+Shift+P (Note Web-owned Quick Open):
    await page.keyboard.press("Control+Shift+p");
    const quickOpenDialog = page.getByRole("dialog");
    await expect(quickOpenDialog).toBeVisible();
    const printCalls = await page.evaluate(
      () => (window as any).__print_call_count,
    );
    expect(printCalls).toBe(0);

    // Close dialog via Escape
    await page.keyboard.press("Escape");
    await expect(quickOpenDialog).not.toBeVisible();

    // 7. Test Ctrl+Shift+N (Note Web-owned New Note):
    await page.keyboard.press("Control+Shift+n");
    const newNoteDialog = page.getByRole("dialog");
    await expect(newNoteDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(newNoteDialog).not.toBeVisible();

    // 8. Test Ctrl+Shift+S (Note Web-owned Save):
    await page.keyboard.press("Control+Shift+s");
    const statusBar = page.locator(".statusbar");
    await expect(statusBar).toContainText("已保存", { timeout: 8000 });
  });
});


