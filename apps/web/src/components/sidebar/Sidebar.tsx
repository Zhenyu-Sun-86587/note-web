import React from "react";
import {
  FilePlus,
  FolderPlus,
  Search,
  RefreshCw,
  Zap,
} from "lucide-react";
import type { TreeNode } from "../../api/types";
import { IconButton } from "../common/IconButton";
import { FileTree } from "./FileTree";

interface SidebarProps {
  items: TreeNode[];
  selectedPath: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectNote: (path: string) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onOpenSearch: () => void;
  onOpenQuickOpen: () => void;
  onRefreshTree: () => void;
  onNewNoteInFolder: (folderPath: string) => void;
  onNewSubFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  loading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  selectedPath,
  expandedFolders,
  onToggleFolder,
  onSelectNote,
  onNewNote,
  onNewFolder,
  onOpenSearch,
  onOpenQuickOpen,
  onRefreshTree,
  onNewNoteInFolder,
  onNewSubFolder,
  onDeleteFolder,
  loading,
}) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span>Note Web</span>
        </div>
        <div className="sidebar-actions">
          <IconButton
            icon={<FilePlus size={16} />}
            label="新建笔记 (Ctrl+N)"
            onClick={onNewNote}
            size="sm"
          />
          <IconButton
            icon={<FolderPlus size={16} />}
            label="新建目录"
            onClick={onNewFolder}
            size="sm"
          />
          <IconButton
            icon={<Search size={16} />}
            label="全文搜索 (Ctrl+K)"
            onClick={onOpenSearch}
            size="sm"
          />
          <IconButton
            icon={<RefreshCw size={16} className={loading ? "spinning" : ""} />}
            label="刷新文件树"
            onClick={onRefreshTree}
            size="sm"
          />
        </div>
      </div>

      <div className="sidebar-quick-open">
        <button className="quick-open-btn" onClick={onOpenQuickOpen}>
          <Zap size={14} />
          <span>快速打开... (Ctrl+P)</span>
        </button>
      </div>

      <div className="sidebar-content">
        <FileTree
          items={items}
          selectedPath={selectedPath}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectNote={onSelectNote}
          onNewNoteInFolder={onNewNoteInFolder}
          onNewSubFolder={onNewSubFolder}
          onDeleteFolder={onDeleteFolder}
        />
      </div>
    </div>
  );
};
