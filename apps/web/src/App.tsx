import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AppShell } from "./components/layout/AppShell";
import { TopBar } from "./components/layout/TopBar";
import { StatusBar } from "./components/layout/StatusBar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { EditorPane } from "./components/editor/EditorPane";
import { TabBar, type TabItem } from "./components/tabs/TabBar";
import { OutlinePanel } from "./components/outline/OutlinePanel";
import { QuickOpenDialog } from "./components/search/QuickOpenDialog";
import { SearchDialog } from "./components/search/SearchDialog";
import { NewNoteDialog } from "./components/dialogs/NewNoteDialog";
import { NewFolderDialog } from "./components/dialogs/NewFolderDialog";
import { RenameDialog } from "./components/dialogs/RenameDialog";
import { MoveDialog } from "./components/dialogs/MoveDialog";
import { ConfirmDeleteDialog } from "./components/dialogs/ConfirmDeleteDialog";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import {
  FileContextMenu,
  type ContextTarget,
  type FileClipboard,
} from "./components/sidebar/FileContextMenu";

import type { TreeNode, NoteDocument } from "./api/types";
import {
  fetchTree,
  fetchNote,
  createNote,
  saveNote,
  renameOrMoveNote,
  renameFolder,
  deleteNote,
  createFolder,
  deleteFolder,
} from "./api/client";
import {
  useSettings,
  LAST_OPEN_NOTE_KEY,
  type EditorMode,
} from "./hooks/useSettings";
import { useAutosave } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowFocusRefresh } from "./hooks/useWindowFocusRefresh";
import type { EditorHandle } from "./components/editor/EditorHandle";
import { generateConflictPath } from "./utils/filename";
import { getDirname, getBasename } from "./utils/note-path";
import { generateCopyFilename } from "./utils/copy-name";
import { parseHeadings, type HeadingItem } from "./utils/outline-parser";

function getFilenamesInFolder(tree: TreeNode[], folderPath: string): string[] {
  if (!folderPath) {
    return tree
      .filter((item): item is Extract<TreeNode, { type: "note" }> => item.type === "note")
      .map((item) => item.name);
  }
  function findFolder(
    items: TreeNode[],
  ): Extract<TreeNode, { type: "folder" }> | null {
    for (const item of items) {
      if (item.type === "folder") {
        if (item.path === folderPath) return item;
        const found = findFolder(item.children);
        if (found) return found;
      }
    }
    return null;
  }
  const folder = findFolder(tree);
  if (!folder) return [];
  return folder.children
    .filter((item): item is Extract<TreeNode, { type: "note" }> => item.type === "note")
    .map((item) => item.name);
}

function hasNotePath(items: TreeNode[], targetPath: string): boolean {
  for (const item of items) {
    if (item.type === "note" && item.path === targetPath) return true;
    if (item.type === "folder" && item.children) {
      if (hasNotePath(item.children, targetPath)) return true;
    }
  }
  return false;
}

function findFirstNote(items: TreeNode[]): string | null {
  for (const item of items) {
    if (item.type === "note") return item.path;
    if (item.type === "folder" && item.children) {
      const nested = findFirstNote(item.children);
      if (nested) return nested;
    }
  }
  return null;
}

function getAncestorFolders(notePath: string): string[] {
  const parts = notePath.split("/");
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join("/"));
  }
  return ancestors;
}

export default function App() {
  const { settings, effectiveTheme, updateSetting, resetSettings } =
    useSettings();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(["inbox", "projects"]),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Tabs state
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const [openNote, setOpenNote] = useState<NoteDocument | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const draftContentRef = useRef(draftContent);
  draftContentRef.current = draftContent;

  const openNoteRef = useRef(openNote);
  openNoteRef.current = openNote;

  const hasAutoOpenedRef = useRef(false);

  // Outline state
  const [outlineOpen, setOutlineOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("note-web-outline-open-v1") === "true";
    } catch {
      return false;
    }
  });
  const [cursorLine, setCursorLine] = useState<number | null>(1);
  const headings = useMemo(() => parseHeadings(draftContent), [draftContent]);

  const toggleOutline = useCallback(() => {
    setOutlineOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("note-web-outline-open-v1", String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  }, []);

  // Vim Preview state
  const [vimPreviewOpen, setVimPreviewOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("note-web-vim-preview-open-v1") === "true";
    } catch {
      return false;
    }
  });

  const toggleVimPreview = useCallback(() => {
    setVimPreviewOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("note-web-vim-preview-open-v1", String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  }, []);

  // Dialogs state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteDefaultFolder, setNewNoteDefaultFolder] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderDefaultParent, setNewFolderDefaultParent] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    type: "note" | "folder";
    path: string;
  } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "note" | "folder";
    path: string;
  } | null>(null);

  // Context menu & internal clipboard state
  const [contextMenuTarget, setContextMenuTarget] =
    useState<ContextTarget | null>(null);
  const [clipboard, setClipboard] = useState<FileClipboard | null>(null);

  const isDirty = openNote !== null && draftContent !== openNote.content;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const [editorMode, setEditorMode] = useState<EditorMode>(
    () => settings.editorMode || "ir",
  );
  const editorPaneRef = useRef<EditorHandle | null>(null);

  const handleSwitchEditorMode = useCallback(
    (mode: EditorMode) => {
      if (editorMode === mode) return;
      const currentRealValue = editorPaneRef.current?.getValue();
      if (
        typeof currentRealValue === "string" &&
        currentRealValue !== draftContent
      ) {
        setDraftContent(currentRealValue);
      }
      setEditorMode(mode);
    },
    [editorMode, draftContent],
  );

  const prevSettingsEditorModeRef = useRef(settings.editorMode);
  useEffect(() => {
    if (settings.editorMode !== prevSettingsEditorModeRef.current) {
      prevSettingsEditorModeRef.current = settings.editorMode;
      handleSwitchEditorMode(settings.editorMode);
    }
  }, [settings.editorMode, handleSwitchEditorMode]);

  useEffect(() => {
    if (openNote?.path) {
      try {
        localStorage.setItem(LAST_OPEN_NOTE_KEY, openNote.path);
      } catch {
        // ignore storage write error
      }
    }
  }, [openNote?.path]);

  const [zenMode, setZenMode] = useState(false);
  const [showZenHint, setShowZenHint] = useState(false);
  const zenHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleZenMode = useCallback(() => {
    setZenMode((prev) => {
      const next = !prev;
      if (next) {
        setShowZenHint(true);
        if (zenHintTimerRef.current) clearTimeout(zenHintTimerRef.current);
        zenHintTimerRef.current = setTimeout(() => {
          setShowZenHint(false);
        }, 2200);
      } else {
        setShowZenHint(false);
        if (zenHintTimerRef.current) clearTimeout(zenHintTimerRef.current);
      }
      return next;
    });
  }, []);

  // Load tree
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await fetchTree();
      setTree(res.items);
    } catch {
      // ignore tree load error
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Draft update syncing into active tab
  const handleDraftChange = useCallback((val: string) => {
    setDraftContent(val);
    const currentPath = openNoteRef.current?.path;
    if (currentPath) {
      setTabs((prev) =>
        prev.map((t) => (t.path === currentPath ? { ...t, draftContent: val } : t)),
      );
    }
  }, []);

  // Open note
  const handleOpenNote = useCallback(
    async (notePath: string) => {
      try {
        const doc = await fetchNote(notePath);
        const newTab: TabItem = {
          path: doc.path,
          title: getBasename(doc.path),
          draftContent: doc.content,
          savedContent: doc.content,
          revision: doc.revision,
          saveStatus: "idle",
          doc,
        };
        setTabs((prev) => {
          if (prev.some((t) => t.path === doc.path)) {
            return prev;
          }
          return [...prev, newTab];
        });
        setOpenNote(doc);
        setDraftContent(doc.content);
      } catch (err: unknown) {
        // eslint-disable-next-line no-alert
        alert(
          `打开笔记失败: ${err instanceof Error ? err.message : "未知错误"}`,
        );
      }
    },
    [],
  );

  // Auto-open note on initial tree load based on startupNoteMode
  useEffect(() => {
    if (tree.length > 0 && !openNote && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      const mode = settings.startupNoteMode || "last";
      if (mode === "none") {
        return;
      }

      if (mode === "first") {
        const first = findFirstNote(tree);
        if (first) {
          handleOpenNote(first);
          const ancestors = getAncestorFolders(first);
          if (ancestors.length > 0) {
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              ancestors.forEach((a) => next.add(a));
              return next;
            });
          }
        }
        return;
      }

      // Default: "last"
      let lastPath: string | null = null;
      try {
        lastPath = localStorage.getItem(LAST_OPEN_NOTE_KEY);
      } catch {
        lastPath = null;
      }

      if (lastPath && hasNotePath(tree, lastPath)) {
        handleOpenNote(lastPath);
        const ancestors = getAncestorFolders(lastPath);
        if (ancestors.length > 0) {
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            ancestors.forEach((a) => next.add(a));
            return next;
          });
        }
      } else {
        if (lastPath) {
          try {
            localStorage.removeItem(LAST_OPEN_NOTE_KEY);
          } catch {
            // ignore
          }
        }
        const fallbackFirst = findFirstNote(tree);
        if (fallbackFirst) {
          handleOpenNote(fallbackFirst);
          const ancestors = getAncestorFolders(fallbackFirst);
          if (ancestors.length > 0) {
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              ancestors.forEach((a) => next.add(a));
              return next;
            });
          }
        }
      }
    }
  }, [tree, openNote, handleOpenNote, settings.startupNoteMode]);

  // Autosave hook
  const {
    status: saveStatus,
    saveNow,
    resetStatus,
    setStatus,
  } = useAutosave({
    path: openNote?.path ?? null,
    content: draftContent,
    revision: openNote?.revision ?? null,
    enabled: Boolean(openNote) && isDirty,
    onSaved: (doc) => {
      setOpenNote(doc);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === doc.path
            ? {
                ...t,
                savedContent: doc.content,
                revision: doc.revision,
                saveStatus: "saved",
                doc,
              }
            : t,
        ),
      );
    },
  });

  // Flush helper that aborts if dirty save fails
  const flushCurrentNote = useCallback(async (): Promise<boolean> => {
    if (!openNoteRef.current || !isDirtyRef.current) {
      return true;
    }
    return saveNow();
  }, [saveNow]);

  // Switch note safely flushing dirty changes & activating tab
  const switchNote = useCallback(
    async (targetPath: string) => {
      const currentPath = openNoteRef.current?.path;
      if (currentPath === targetPath) return;

      // Sync active editor value
      const currentRealValue = editorPaneRef.current?.getValue();
      if (
        typeof currentRealValue === "string" &&
        currentRealValue !== draftContentRef.current
      ) {
        setDraftContent(currentRealValue);
        draftContentRef.current = currentRealValue;
        if (currentPath) {
          setTabs((prev) =>
            prev.map((t) =>
              t.path === currentPath ? { ...t, draftContent: currentRealValue } : t,
            ),
          );
        }
      }

      if (!(await flushCurrentNote())) {
        return;
      }

      // Check if tab already exists
      const existingTab = tabsRef.current.find((t) => t.path === targetPath);
      if (existingTab) {
        setOpenNote(existingTab.doc);
        setDraftContent(existingTab.draftContent);
        resetStatus(
          existingTab.draftContent !== existingTab.savedContent ? "dirty" : "idle",
        );
      } else {
        try {
          const doc = await fetchNote(targetPath);
          const newTab: TabItem = {
            path: doc.path,
            title: getBasename(doc.path),
            draftContent: doc.content,
            savedContent: doc.content,
            revision: doc.revision,
            saveStatus: "idle",
            doc,
          };
          setTabs((prev) => {
            if (prev.some((t) => t.path === doc.path)) return prev;
            return [...prev, newTab];
          });
          setOpenNote(doc);
          setDraftContent(doc.content);
          resetStatus("idle");
        } catch (err: unknown) {
          // eslint-disable-next-line no-alert
          alert(`打开笔记失败: ${err instanceof Error ? err.message : "未知错误"}`);
        }
      }
    },
    [flushCurrentNote, resetStatus],
  );

  // Close tab
  const handleCloseTab = useCallback(
    async (tabPath: string) => {
      const currentTabs = tabsRef.current;
      const targetTab = currentTabs.find((t) => t.path === tabPath);
      if (!targetTab) return;

      const isActive = openNoteRef.current?.path === tabPath;

      if (isActive) {
        // Sync active editor value
        const currentRealValue = editorPaneRef.current?.getValue();
        if (
          typeof currentRealValue === "string" &&
          currentRealValue !== draftContentRef.current
        ) {
          setDraftContent(currentRealValue);
          draftContentRef.current = currentRealValue;
        }

        if (isDirtyRef.current) {
          const saved = await flushCurrentNote();
          if (!saved) return;
        }

        const targetIndex = currentTabs.findIndex((t) => t.path === tabPath);
        const nextTabs = currentTabs.filter((t) => t.path !== tabPath);
        setTabs(nextTabs);

        if (nextTabs.length === 0) {
          setOpenNote(null);
          setDraftContent("");
          resetStatus("idle");
        } else {
          const nextIndex = Math.min(targetIndex, nextTabs.length - 1);
          const nextTab = nextTabs[nextIndex];
          setOpenNote(nextTab.doc);
          setDraftContent(nextTab.draftContent);
          resetStatus(
            nextTab.draftContent !== nextTab.savedContent ? "dirty" : "idle",
          );
        }
      } else {
        // Inactive tab
        const isTabDirty = targetTab.draftContent !== targetTab.savedContent;
        if (isTabDirty && targetTab.revision) {
          try {
            await saveNote(targetTab.path, targetTab.draftContent, targetTab.revision);
          } catch (err: unknown) {
            // eslint-disable-next-line no-alert
            alert(
              `保存标签页失败: ${err instanceof Error ? err.message : "未知错误"}`,
            );
            return;
          }
        }
        setTabs((prev) => prev.filter((t) => t.path !== tabPath));
      }
    },
    [flushCurrentNote, resetStatus],
  );

  // Folder expand toggle
  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  // Dirty page exit confirmation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Window Focus Refresh
  useWindowFocusRefresh(async () => {
    const current = openNoteRef.current;
    if (!current) return;

    try {
      const latest = await fetchNote(current.path);
      if (latest.revision !== current.revision) {
        const isClean =
          draftContentRef.current.replace(/\r\n/g, "\n") ===
          current.content.replace(/\r\n/g, "\n");
        if (isClean) {
          // Not dirty, safe to reload disk changes automatically
          setOpenNote(latest);
          setDraftContent(latest.content);
          setTabs((prev) =>
            prev.map((t) =>
              t.path === latest.path
                ? {
                    ...t,
                    draftContent: latest.content,
                    savedContent: latest.content,
                    revision: latest.revision,
                    saveStatus: "idle",
                  }
                : t,
            ),
          );
        } else {
          // Dirty, trigger conflict!
          setStatus("conflict");
        }
      }
    } catch {
      // ignore background refresh error
    }
  });

  // Conflict resolution handlers
  const handleReloadConflict = async () => {
    if (!openNote) return;
    try {
      const doc = await fetchNote(openNote.path);
      setOpenNote(doc);
      setDraftContent(doc.content);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === doc.path
            ? {
                ...t,
                draftContent: doc.content,
                savedContent: doc.content,
                revision: doc.revision,
                saveStatus: "idle",
              }
            : t,
        ),
      );
      resetStatus("idle");
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      alert(`重新加载失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  const handleSaveAsConflictCopy = async () => {
    if (!openNote) return;
    try {
      const conflictPath = generateConflictPath(openNote.path);
      const newDoc = await createNote(conflictPath, draftContent);
      await loadTree();
      setOpenNote(newDoc);
      setDraftContent(newDoc.content);
      setTabs((prev) => [
        ...prev,
        {
          path: newDoc.path,
          title: getBasename(newDoc.path),
          draftContent: newDoc.content,
          savedContent: newDoc.content,
          revision: newDoc.revision,
          saveStatus: "idle",
          doc: newDoc,
        },
      ]);
      resetStatus("idle");
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      alert(
        `另存冲突副本失败: ${err instanceof Error ? err.message : "未知错误"}`,
      );
    }
  };

  // CRUD actions
  const handleCreateNote = async (fullPath: string) => {
    if (!(await flushCurrentNote())) {
      return;
    }
    const newDoc = await createNote(fullPath, "");
    await loadTree();
    resetStatus("idle");
    const newTab: TabItem = {
      path: newDoc.path,
      title: getBasename(newDoc.path),
      draftContent: "",
      savedContent: "",
      revision: newDoc.revision,
      saveStatus: "idle",
      doc: newDoc,
    };
    setTabs((prev) => {
      if (prev.some((t) => t.path === newDoc.path)) return prev;
      return [...prev, newTab];
    });
    setOpenNote(newDoc);
    setDraftContent("");
    const dir = getDirname(fullPath);
    if (dir) {
      setExpandedFolders((prev) => new Set([...prev, dir]));
    }
  };

  const handleCreateFolder = async (folderPath: string) => {
    await createFolder(folderPath);
    await loadTree();
    setExpandedFolders((prev) => new Set([...prev, folderPath]));
  };

  const handleRenameSubmit = async (newPath: string) => {
    if (!renameTarget) return;

    const currentOpenNote = openNoteRef.current;

    if (renameTarget.type === "note") {
      if (currentOpenNote?.path === renameTarget.path) {
        if (!(await flushCurrentNote())) {
          return;
        }
      }
      await renameOrMoveNote(renameTarget.path, newPath);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === renameTarget.path
            ? { ...t, path: newPath, title: getBasename(newPath) }
            : t,
        ),
      );
      if (currentOpenNote?.path === renameTarget.path) {
        setOpenNote((prev) => (prev ? { ...prev, path: newPath } : null));
      }
    } else {
      const affectsOpenNote =
        currentOpenNote !== null &&
        (currentOpenNote.path === renameTarget.path ||
          currentOpenNote.path.startsWith(`${renameTarget.path}/`));

      if (affectsOpenNote) {
        if (!(await flushCurrentNote())) {
          return;
        }
      }

      await renameFolder(renameTarget.path, newPath);
      setTabs((prev) =>
        prev.map((t) => {
          if (t.path === renameTarget.path) {
            return { ...t, path: newPath, title: getBasename(newPath) };
          }
          if (t.path.startsWith(`${renameTarget.path}/`)) {
            const suffix = t.path.slice(renameTarget.path.length);
            const remapPath = `${newPath}${suffix}`;
            return { ...t, path: remapPath, title: getBasename(remapPath) };
          }
          return t;
        }),
      );

      // Remap openNote path if it is inside renamed folder
      if (
        currentOpenNote &&
        (currentOpenNote.path === renameTarget.path ||
          currentOpenNote.path.startsWith(`${renameTarget.path}/`))
      ) {
        const suffix = currentOpenNote.path.slice(renameTarget.path.length);
        setOpenNote((prev) =>
          prev ? { ...prev, path: `${newPath}${suffix}` } : null,
        );
      }
      // Remap expandedFolders
      setExpandedFolders((prev) => {
        const next = new Set<string>();
        prev.forEach((folder) => {
          if (folder === renameTarget.path) {
            next.add(newPath);
          } else if (folder.startsWith(`${renameTarget.path}/`)) {
            next.add(`${newPath}${folder.slice(renameTarget.path.length)}`);
          } else {
            next.add(folder);
          }
        });
        return next;
      });
    }

    await loadTree();
    setRenameOpen(false);
    setRenameTarget(null);
  };

  const handleMoveSubmit = async (newPath: string) => {
    if (!moveTarget) return;
    if (openNote?.path === moveTarget) {
      if (!(await flushCurrentNote())) {
        return;
      }
    }
    await renameOrMoveNote(moveTarget, newPath);
    setTabs((prev) =>
      prev.map((t) =>
        t.path === moveTarget
          ? { ...t, path: newPath, title: getBasename(newPath) }
          : t,
      ),
    );
    if (openNote?.path === moveTarget) {
      setOpenNote((prev) => (prev ? { ...prev, path: newPath } : null));
    }
    await loadTree();
    setMoveOpen(false);
    setMoveTarget(null);
  };

  const handleDeleteCurrentNote = () => {
    if (!openNote) return;
    setDeleteTarget({ type: "note", path: openNote.path });
    setDeleteDialogOpen(true);
  };

  const handleDeleteFolderAction = (folderPath: string) => {
    setDeleteTarget({ type: "folder", path: folderPath });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "note") {
      if (openNote?.path === deleteTarget.path) {
        if (!(await flushCurrentNote())) {
          return;
        }
      }
      await deleteNote(deleteTarget.path);
      await handleCloseTab(deleteTarget.path);
    } else {
      const folder = deleteTarget.path;
      await deleteFolder(folder);
      const remainingTabs = tabsRef.current.filter(
        (t) => t.path !== folder && !t.path.startsWith(`${folder}/`),
      );
      setTabs(remainingTabs);
      const isCurrentInside =
        openNoteRef.current &&
        (openNoteRef.current.path === folder ||
          openNoteRef.current.path.startsWith(`${folder}/`));
      if (isCurrentInside) {
        if (remainingTabs.length === 0) {
          setOpenNote(null);
          setDraftContent("");
          resetStatus("idle");
        } else {
          const nextTab = remainingTabs[0];
          setOpenNote(nextTab.doc);
          setDraftContent(nextTab.draftContent);
          resetStatus(
            nextTab.draftContent !== nextTab.savedContent ? "dirty" : "idle",
          );
        }
      }
    }

    await loadTree();
  };

  // Context Menu Actions
  const handleOpenContextMenu = (
    e: React.MouseEvent,
    node?: TreeNode,
  ) => {
    if (!node) {
      setContextMenuTarget({
        type: "root",
        path: "",
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }

    if (node.type === "note") {
      setContextMenuTarget({
        type: "note",
        path: node.path,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      setContextMenuTarget({
        type: "folder",
        path: node.path,
        x: e.clientX,
        y: e.clientY,
      });
    }
  };

  const handleCopyNote = (notePath: string) => {
    setClipboard({
      operation: "copy",
      type: "note",
      sourcePath: notePath,
    });
  };

  const handlePasteNote = async (targetFolder: string) => {
    if (!clipboard || clipboard.type !== "note") return;

    try {
      if (openNote?.path === clipboard.sourcePath) {
        if (!(await flushCurrentNote())) {
          return;
        }
      }

      const sourceDoc = await fetchNote(clipboard.sourcePath);
      const baseFilename = getBasename(clipboard.sourcePath);
      const existingInTarget = getFilenamesInFolder(tree, targetFolder);
      const targetFilename = generateCopyFilename(
        baseFilename,
        existingInTarget,
      );
      const targetPath = targetFolder
        ? `${targetFolder}/${targetFilename}`
        : targetFilename;

      const createdDoc = await createNote(targetPath, sourceDoc.content);
      await loadTree();

      const newTab: TabItem = {
        path: createdDoc.path,
        title: getBasename(createdDoc.path),
        draftContent: createdDoc.content,
        savedContent: createdDoc.content,
        revision: createdDoc.revision,
        saveStatus: "idle",
        doc: createdDoc,
      };
      setTabs((prev) => [...prev, newTab]);
      setOpenNote(createdDoc);
      setDraftContent(createdDoc.content);

      if (targetFolder) {
        setExpandedFolders((prev) => new Set([...prev, targetFolder]));
      }
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      alert(`粘贴笔记失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  // Escape handler respecting modals > zenMode
  const handleEscape = useCallback(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (quickOpenOpen) {
      setQuickOpenOpen(false);
      return;
    }
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    if (newNoteOpen) {
      setNewNoteOpen(false);
      return;
    }
    if (newFolderOpen) {
      setNewFolderOpen(false);
      return;
    }
    if (renameOpen) {
      setRenameOpen(false);
      setRenameTarget(null);
      return;
    }
    if (moveOpen) {
      setMoveOpen(false);
      setMoveTarget(null);
      return;
    }
    if (deleteDialogOpen) {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      return;
    }
    if (contextMenuTarget) {
      setContextMenuTarget(null);
      return;
    }
    if (zenMode) {
      setZenMode(false);
      setShowZenHint(false);
      return;
    }
  }, [
    settingsOpen,
    quickOpenOpen,
    searchOpen,
    newNoteOpen,
    newFolderOpen,
    renameOpen,
    moveOpen,
    deleteDialogOpen,
    contextMenuTarget,
    zenMode,
  ]);

  // Outline navigation
  const handleSelectHeading = useCallback((heading: HeadingItem) => {
    editorPaneRef.current?.scrollToHeading?.(heading);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: () => {
      if (openNote) saveNow();
    },
    onEscape: handleEscape,
    onQuickOpen: () => setQuickOpenOpen(true),
    onSearch: () => setSearchOpen(true),
    onToggleSidebar: () => setSidebarOpen((prev) => !prev),
    onNewNote: () => {
      setNewNoteDefaultFolder(openNote ? getDirname(openNote.path) : "");
      setNewNoteOpen(true);
    },
    onOpenSettings: () => setSettingsOpen(true),
    onToggleOutline: toggleOutline,
    onToggleVimPreview: toggleVimPreview,
  });

  const effectiveSaveStatus =
    isDirty && saveStatus === "idle" ? "dirty" : saveStatus;

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      sidebarWidth={settings.sidebarWidth}
      onResizeSidebar={(newWidth) => updateSetting("sidebarWidth", newWidth)}
      zenMode={zenMode}
      sidebar={
        <Sidebar
          items={tree}
          selectedPath={openNote?.path ?? null}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
          onSelectNote={switchNote}
          onNewNote={() => {
            setNewNoteDefaultFolder(openNote ? getDirname(openNote.path) : "");
            setNewNoteOpen(true);
          }}
          onNewFolder={() => {
            setNewFolderDefaultParent(
              openNote ? getDirname(openNote.path) : "",
            );
            setNewFolderOpen(true);
          }}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenQuickOpen={() => setQuickOpenOpen(true)}
          onRefreshTree={loadTree}
          onNewNoteInFolder={(folder) => {
            setNewNoteDefaultFolder(folder);
            setNewNoteOpen(true);
          }}
          onNewSubFolder={(folder) => {
            setNewFolderDefaultParent(folder);
            setNewFolderOpen(true);
          }}
          onDeleteFolder={handleDeleteFolderAction}
          onContextMenu={handleOpenContextMenu}
          loading={treeLoading}
        />
      }
    >
      {zenMode && showZenHint && (
        <div className="zen-mode-hint">
          {editorMode === "vim" ? ":zen 退出专注模式" : "Esc 退出专注模式"}
        </div>
      )}

      <TopBar
        currentPath={openNote?.path ?? null}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleZenMode={toggleZenMode}
        editorMode={editorMode}
        onToggleEditorMode={handleSwitchEditorMode}
        onSave={saveNow}
        canSave={Boolean(openNote) && saveStatus !== "conflict"}
        onRename={() => {
          if (openNote) {
            setRenameTarget({ type: "note", path: openNote.path });
            setRenameOpen(true);
          }
        }}
        onMove={() => {
          if (openNote) {
            setMoveTarget(openNote.path);
            setMoveOpen(true);
          }
        }}
        onDelete={handleDeleteCurrentNote}
        outlineOpen={outlineOpen}
        onToggleOutline={toggleOutline}
        vimPreviewOpen={vimPreviewOpen}
        onToggleVimPreview={toggleVimPreview}
      />

      <TabBar
        tabs={tabs}
        activePath={openNote?.path ?? null}
        onSelectTab={switchNote}
        onCloseTab={handleCloseTab}
      />

      <div className="editor-with-outline-container">
        <EditorPane
          ref={editorPaneRef}
          notePath={openNote?.path ?? null}
          initialContent={draftContent}
          hasConflict={saveStatus === "conflict"}
          theme={effectiveTheme}
          editorMode={editorMode}
          vimRelativeLineNumbers={settings.vimRelativeLineNumbers}
          vimLineWrapping={settings.vimLineWrapping}
          vimJjEscape={settings.vimJjEscape}
          vimPreviewOpen={vimPreviewOpen}
          onChange={handleDraftChange}
          onNewNote={() => {
            setNewNoteDefaultFolder(openNote ? getDirname(openNote.path) : "");
            setNewNoteOpen(true);
          }}
          onReloadConflict={handleReloadConflict}
          onSaveAsConflictCopy={handleSaveAsConflictCopy}
          onSave={saveNow}
          onSwitchToIR={() => handleSwitchEditorMode("ir")}
          onToggleZen={toggleZenMode}
          onCursorActivity={(line) => setCursorLine(line)}
        />

        <OutlinePanel
          headings={headings}
          activeLine={cursorLine}
          isOpen={outlineOpen}
          onClose={() => setOutlineOpen(false)}
          onSelectHeading={handleSelectHeading}
        />
      </div>

      <StatusBar
        saveStatus={effectiveSaveStatus}
        content={draftContent}
        isNoteOpen={Boolean(openNote)}
      />

      {/* File Context Menu */}
      <FileContextMenu
        target={contextMenuTarget}
        clipboard={clipboard}
        onClose={() => setContextMenuTarget(null)}
        onOpenNote={switchNote}
        onNewNote={(folder) => {
          setNewNoteDefaultFolder(folder);
          setNewNoteOpen(true);
        }}
        onNewFolder={(parent) => {
          setNewFolderDefaultParent(parent);
          setNewFolderOpen(true);
        }}
        onRename={(target) => {
          setRenameTarget(target);
          setRenameOpen(true);
        }}
        onMove={(path) => {
          setMoveTarget(path);
          setMoveOpen(true);
        }}
        onCopy={handleCopyNote}
        onPaste={handlePasteNote}
        onDelete={(target) => {
          setDeleteTarget(target);
          setDeleteDialogOpen(true);
        }}
        onRefresh={loadTree}
      />

      {/* Dialogs */}
      <SettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
        onResetSettings={resetSettings}
      />

      <QuickOpenDialog
        isOpen={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        tree={tree}
        onSelectNote={switchNote}
      />

      <SearchDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectNote={switchNote}
      />

      <NewNoteDialog
        isOpen={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        defaultFolder={newNoteDefaultFolder}
        tree={tree}
        onSubmit={handleCreateNote}
      />

      <NewFolderDialog
        isOpen={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        defaultParent={newFolderDefaultParent}
        tree={tree}
        onSubmit={handleCreateFolder}
      />

      {renameTarget && (
        <RenameDialog
          isOpen={renameOpen}
          onClose={() => {
            setRenameOpen(false);
            setRenameTarget(null);
          }}
          currentPath={renameTarget.path}
          kind={renameTarget.type}
          onSubmit={handleRenameSubmit}
        />
      )}

      {moveTarget && (
        <MoveDialog
          isOpen={moveOpen}
          onClose={() => {
            setMoveOpen(false);
            setMoveTarget(null);
          }}
          currentPath={moveTarget}
          tree={tree}
          onSubmit={handleMoveSubmit}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          isOpen={deleteDialogOpen}
          onClose={() => {
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
          }}
          title={deleteTarget.type === "note" ? "删除笔记" : "删除目录"}
          itemPath={deleteTarget.path}
          itemType={deleteTarget.type}
          onConfirm={handleConfirmDelete}
        />
      )}
    </AppShell>
  );
}
