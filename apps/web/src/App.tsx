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

import type { TreeNode, NoteDocument } from "./api/types";
import {
  fetchTree,
  fetchNote,
  createNote,
  renameOrMoveNote,
  deleteNote,
  createFolder,
  deleteFolder,
} from "./api/client";
import { useTheme } from "./hooks/useTheme";
import { useAutosave } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowFocusRefresh } from "./hooks/useWindowFocusRefresh";
import { generateConflictPath } from "./utils/filename";
import { getDirname } from "./utils/note-path";

export default function App() {
  const { theme, toggleTheme } = useTheme();

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

  // Dialogs state
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteDefaultFolder, setNewNoteDefaultFolder] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderDefaultParent, setNewFolderDefaultParent] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "note" | "folder";
    path: string;
  } | null>(null);

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

  // Auto-open first note on first load if available
  useEffect(() => {
    if (tree.length > 0 && !openNote) {
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
        handleOpenNote(firstNote);
      }
    }
  }, [tree, openNote, handleOpenNote]);

  // Autosave hook
  const { status: saveStatus, saveNow, setStatus } = useAutosave({
    path: openNote?.path ?? null,
    content: draftContent,
    revision: openNote?.revision ?? null,
    enabled: Boolean(openNote),
    onSaved: (doc) => {
      setOpenNote(doc);
    },
  });

  // Switch note safely saving dirty changes
  const switchNote = useCallback(
    async (targetPath: string) => {
      if (openNote?.path === targetPath) return;

      if (
        openNote &&
        saveStatus === "dirty" &&
        draftContentRef.current !== openNote.content
      ) {
        await saveNow();
      }

      await handleOpenNote(targetPath);
    },
    [openNote, saveStatus, saveNow, handleOpenNote],
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
      setStatus("idle");
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
      setStatus("idle");
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      alert(
        `另存冲突副本失败: ${err instanceof Error ? err.message : "未知错误"}`,
      );
    }
  };

  // CRUD actions
  const handleCreateNote = async (fullPath: string) => {
    const newDoc = await createNote(fullPath, "");
    await loadTree();
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

  const handleRenameNote = async (newPath: string) => {
    if (!openNote) return;
    await renameOrMoveNote(openNote.path, newPath);
    await loadTree();
    setOpenNote((prev) => (prev ? { ...prev, path: newPath } : null));
  };

  const handleMoveNote = async (newPath: string) => {
    if (!openNote) return;
    await renameOrMoveNote(openNote.path, newPath);
    await loadTree();
    setOpenNote((prev) => (prev ? { ...prev, path: newPath } : null));
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
      await deleteNote(deleteTarget.path);
      if (openNote?.path === deleteTarget.path) {
        setOpenNote(null);
        setDraftContent("");
      }
    } else {
      await deleteFolder(deleteTarget.path);
    }

    await loadTree();
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
  });

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
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
          loading={treeLoading}
        />
      }
    >
      <TopBar
        currentPath={openNote?.path ?? null}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSave={saveNow}
        canSave={Boolean(openNote) && saveStatus !== "conflict"}
        onRename={() => setRenameOpen(true)}
        onMove={() => setMoveOpen(true)}
        onDelete={handleDeleteCurrentNote}
      />

      <EditorPane
        notePath={openNote?.path ?? null}
        initialContent={draftContent}
        hasConflict={saveStatus === "conflict"}
        theme={theme}
        onChange={(val) => setDraftContent(val)}
        onNewNote={() => {
          setNewNoteDefaultFolder(openNote ? getDirname(openNote.path) : "");
          setNewNoteOpen(true);
        }}
        onReloadConflict={handleReloadConflict}
        onSaveAsConflictCopy={handleSaveAsConflictCopy}
      />

      <StatusBar
        saveStatus={saveStatus}
        content={draftContent}
        isNoteOpen={Boolean(openNote)}
      />

      {/* Dialogs */}
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

      {openNote && (
        <>
          <RenameDialog
            isOpen={renameOpen}
            onClose={() => setRenameOpen(false)}
            currentPath={openNote.path}
            onSubmit={handleRenameNote}
          />

          <MoveDialog
            isOpen={moveOpen}
            onClose={() => setMoveOpen(false)}
            currentPath={openNote.path}
            tree={tree}
            onSubmit={handleMoveNote}
          />
        </>
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
