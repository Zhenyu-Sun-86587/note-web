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

test.afterEach(() => {
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
});

test.describe("Note Web E2E Suite", () => {
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

  test("switching clean notes does not issue PUT /api/notes/* requests", async ({
    page,
  }) => {
    await page.goto("/");
    const editorContainer = page.locator(".vditor-ir .vditor-reset");
    await expect(editorContainer).toBeVisible({ timeout: 10000 });

    let putRequestCount = 0;
    page.on("request", (req) => {
      if (req.method() === "PUT" && req.url().includes("/api/notes/")) {
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
});
