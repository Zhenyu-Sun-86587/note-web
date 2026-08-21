import { describe, it, expect } from "vitest";
import type { TabItem } from "../components/tabs/TabBar";
import { getBasename } from "../utils/note-path";

describe("Multi-Note Tabs Logic & Model", () => {
  it("does not create duplicate tabs for the same note path", () => {
    const tabs: TabItem[] = [
      {
        path: "inbox/welcome.md",
        title: "welcome.md",
        draftContent: "# Hello",
        savedContent: "# Hello",
        revision: "rev-1",
        saveStatus: "idle",
        doc: {
          path: "inbox/welcome.md",
          content: "# Hello",
          revision: "rev-1",
          modifiedAt: new Date().toISOString(),
          size: 7,
        },
      },
    ];

    const targetPath = "inbox/welcome.md";
    const exists = tabs.some((t) => t.path === targetPath);
    expect(exists).toBe(true);

    const nextTabs = exists ? tabs : [...tabs, { path: targetPath } as TabItem];
    expect(nextTabs).toHaveLength(1);
  });

  it("calculates tab dirty status based on draftContent !== savedContent", () => {
    const cleanTab: TabItem = {
      path: "inbox/a.md",
      title: "a.md",
      draftContent: "abc",
      savedContent: "abc",
      revision: "rev-1",
      saveStatus: "idle",
      doc: { path: "inbox/a.md", content: "abc", revision: "rev-1", modifiedAt: "", size: 3 },
    };

    const dirtyTab: TabItem = {
      path: "inbox/b.md",
      title: "b.md",
      draftContent: "abc modified",
      savedContent: "abc",
      revision: "rev-1",
      saveStatus: "dirty",
      doc: { path: "inbox/b.md", content: "abc", revision: "rev-1", modifiedAt: "", size: 3 },
    };

    expect(cleanTab.draftContent !== cleanTab.savedContent).toBe(false);
    expect(dirtyTab.draftContent !== dirtyTab.savedContent).toBe(true);
  });

  it("selects next adjacent tab when active tab is closed", () => {
    const tabs: TabItem[] = [
      { path: "inbox/1.md", title: "1.md", draftContent: "1", savedContent: "1", revision: "r1", saveStatus: "idle", doc: { path: "inbox/1.md", content: "1", revision: "r1", modifiedAt: "", size: 1 } },
      { path: "inbox/2.md", title: "2.md", draftContent: "2", savedContent: "2", revision: "r2", saveStatus: "idle", doc: { path: "inbox/2.md", content: "2", revision: "r2", modifiedAt: "", size: 1 } },
      { path: "inbox/3.md", title: "3.md", draftContent: "3", savedContent: "3", revision: "r3", saveStatus: "idle", doc: { path: "inbox/3.md", content: "3", revision: "r3", modifiedAt: "", size: 1 } },
    ];

    // Close middle tab (index 1: 2.md)
    const closedIdx = 1;
    const remaining = tabs.filter((_, idx) => idx !== closedIdx);
    expect(remaining).toHaveLength(2);

    const nextIdx = Math.min(closedIdx, remaining.length - 1);
    expect(remaining[nextIdx].path).toBe("inbox/3.md");

    // Close rightmost tab (index 1: 3.md)
    const closedRightIdx = 1;
    const remaining2 = remaining.filter((_, idx) => idx !== closedRightIdx);
    const nextRightIdx = Math.min(closedRightIdx, remaining2.length - 1);
    expect(remaining2[nextRightIdx].path).toBe("inbox/1.md");
  });

  it("synchronizes tab path and title when a note is renamed", () => {
    const tabs: TabItem[] = [
      { path: "inbox/old.md", title: "old.md", draftContent: "text", savedContent: "text", revision: "r1", saveStatus: "idle", doc: { path: "inbox/old.md", content: "text", revision: "r1", modifiedAt: "", size: 4 } },
    ];

    const oldPath = "inbox/old.md";
    const newPath = "inbox/new.md";

    const updated = tabs.map((t) =>
      t.path === oldPath
        ? { ...t, path: newPath, title: getBasename(newPath), doc: { ...t.doc, path: newPath } }
        : t,
    );

    expect(updated[0].path).toBe("inbox/new.md");
    expect(updated[0].title).toBe("new.md");
  });

  it("synchronizes nested tab paths when parent folder is renamed", () => {
    const tabs: TabItem[] = [
      { path: "projects/alpha/note1.md", title: "note1.md", draftContent: "1", savedContent: "1", revision: "r1", saveStatus: "idle", doc: { path: "projects/alpha/note1.md", content: "1", revision: "r1", modifiedAt: "", size: 1 } },
      { path: "inbox/welcome.md", title: "welcome.md", draftContent: "2", savedContent: "2", revision: "r2", saveStatus: "idle", doc: { path: "inbox/welcome.md", content: "2", revision: "r2", modifiedAt: "", size: 1 } },
    ];

    const oldFolder = "projects/alpha";
    const newFolder = "projects/beta";

    const updated = tabs.map((t) => {
      if (t.path.startsWith(`${oldFolder}/`)) {
        const suffix = t.path.slice(oldFolder.length);
        const remap = `${newFolder}${suffix}`;
        return { ...t, path: remap, title: getBasename(remap), doc: { ...t.doc, path: remap } };
      }
      return t;
    });

    expect(updated[0].path).toBe("projects/beta/note1.md");
    expect(updated[1].path).toBe("inbox/welcome.md");
  });

  it("removes child tabs when parent folder is deleted", () => {
    const tabs: TabItem[] = [
      { path: "projects/alpha/n1.md", title: "n1.md", draftContent: "", savedContent: "", revision: "r", saveStatus: "idle", doc: { path: "projects/alpha/n1.md", content: "", revision: "r", modifiedAt: "", size: 0 } },
      { path: "projects/alpha/n2.md", title: "n2.md", draftContent: "", savedContent: "", revision: "r", saveStatus: "idle", doc: { path: "projects/alpha/n2.md", content: "", revision: "r", modifiedAt: "", size: 0 } },
      { path: "inbox/welcome.md", title: "welcome.md", draftContent: "", savedContent: "", revision: "r", saveStatus: "idle", doc: { path: "inbox/welcome.md", content: "", revision: "r", modifiedAt: "", size: 0 } },
    ];

    const deletedFolder = "projects/alpha";
    const remaining = tabs.filter(
      (t) => t.path !== deletedFolder && !t.path.startsWith(`${deletedFolder}/`),
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0].path).toBe("inbox/welcome.md");
  });
});
