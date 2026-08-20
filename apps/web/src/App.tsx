import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "./components/layout/AppShell";
import { TopBar } from "./components/layout/TopBar";
import { StatusBar } from "./components/layout/StatusBar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { EditorPane } from "./components/editor/EditorPane";
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
  renameOrMoveNote,
  renameFolder,
  deleteNote,
  createFolder,
  deleteFolder,
} from "./api/client";
import { useSettings } from "./hooks/useSettings";
import { useAutosave } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowFocusRefresh } from "./hooks/useWindowFocusRefresh";
import { generateConflictPath } from "./utils/filename";
import { getDirname, getBasename } from "./utils/note-path";
import { generateCopyFilename } from "./utils/copy-name";

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

export default function App() {
  const { settings, effectiveTheme, updateSetting, resetSettings } =
    useSettings();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(["inbox", "projects"]),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [openNote, setOpenNote] = useState<NoteDocument | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const draftContentRef = useRef(draftContent);
  draftContentRef.current = draftContent;

  const openNoteRef = useRef(openNote);
  openNoteRef.current = openNote;

  const hasAutoOpenedRef = useRef(false);

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

  // Open note
  const handleOpenNote = useCallback(
    async (notePath: string) => {
      try {
        const doc = await fetchNote(notePath);
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

  // Auto-open first note only on first load
  useEffect(() => {
    if (tree.length > 0 && !openNote && !hasAutoOpenedRef.current) {
      function findFirstNote(items: TreeNode[]): string | null {
        for (const item of items) {
          if (item.type === "note") return item.path;
          if (item.type === "folder") {
            const nested = findFirstNote(item.children);
            if (nested) return nested;
          }
        }
        return null;
      }
      const firstNote = findFirstNote(tree);
      if (firstNote) {
        hasAutoOpenedRef.current = true;
        handleOpenNote(firstNote);
      }
    }
  }, [tree, openNote, handleOpenNote]);

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
    },
  });

  // Flush helper that aborts if dirty save fails
  const flushCurrentNote = useCallback(async (): Promise<boolean> => {
    if (!isDirty) {
      return true;
    }
    return saveNow();
  }, [isDirty, saveNow]);

  // Switch note safely flushing dirty changes
  const switchNote = useCallback(
    async (targetPath: string) => {
      if (openNote?.path === targetPath) return;

      if (!(await flushCurrentNote())) {
        return;
      }

      resetStatus("idle");
      await handleOpenNote(targetPath);
    },
    [openNote, flushCurrentNote, resetStatus, handleOpenNote],
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
        if (draftContentRef.current === current.content) {
          // Not dirty, safe to reload disk changes automatically
          setOpenNote(latest);
          setDraftContent(latest.content);
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

    if (renameTarget.type === "note") {
      if (openNote?.path === renameTarget.path) {
        if (!(await flushCurrentNote())) {
          return;
        }
      }
      await renameOrMoveNote(renameTarget.path, newPath);
      if (openNote?.path === renameTarget.path) {
        setOpenNote((prev) => (prev ? { ...prev, path: newPath } : null));
      }
    } else {
      const affectsOpenNote =
        openNote !== null &&
        (openNote.path === renameTarget.path ||
          openNote.path.startsWith(`${renameTarget.path}/`));

      if (affectsOpenNote) {
        if (!(await flushCurrentNote())) {
          return;
        }
      }

      await renameFolder(renameTarget.path, newPath);
      // Remap openNote path if it is inside renamed folder
      if (
        openNote &&
        (openNote.path === renameTarget.path ||
          openNote.path.startsWith(`${renameTarget.path}/`))
      ) {
        const suffix = openNote.path.slice(renameTarget.path.length);
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
      if (openNote?.path === deleteTarget.path) {
        resetStatus("idle");
        setOpenNote(null);
        setDraftContent("");
      }
    } else {
      await deleteFolder(deleteTarget.path);
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

      await createNote(targetPath, sourceDoc.content);
      await loadTree();

      if (targetFolder) {
        setExpandedFolders((prev) => new Set([...prev, targetFolder]));
      }
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      alert(`粘贴笔记失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: () => {
      if (openNote) saveNow();
    },
    onQuickOpen: () => setQuickOpenOpen(true),
    onSearch: () => setSearchOpen(true),
    onToggleSidebar: () => setSidebarOpen((prev) => !prev),
    onNewNote: () => {
      setNewNoteDefaultFolder(openNote ? getDirname(openNote.path) : "");
      setNewNoteOpen(true);
    },
    onOpenSettings: () => setSettingsOpen(true),
  });

  const effectiveSaveStatus =
    isDirty && saveStatus === "idle" ? "dirty" : saveStatus;

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      sidebarWidth={settings.sidebarWidth}
      onResizeSidebar={(newWidth) => updateSetting("sidebarWidth", newWidth)}
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
      <TopBar
        currentPath={openNote?.path ?? null}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenSettings={() => setSettingsOpen(true)}
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
      />

      <EditorPane
        notePath={openNote?.path ?? null}
        initialContent={draftContent}
        hasConflict={saveStatus === "conflict"}
        theme={effectiveTheme}
        onChange={(val) => setDraftContent(val)}
        onNewNote={() => {
          setNewNoteDefaultFolder(openNote ? getDirname(openNote.path) : "");
          setNewNoteOpen(true);
        }}
        onReloadConflict={handleReloadConflict}
        onSaveAsConflictCopy={handleSaveAsConflictCopy}
      />

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
