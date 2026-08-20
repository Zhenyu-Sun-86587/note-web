import React from "react";
import type { TreeNode } from "../../api/types";
import { FileTreeItem } from "./FileTreeItem";

interface FileTreeProps {
  items: TreeNode[];
  selectedPath: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectNote: (path: string) => void;
  onNewNoteInFolder: (folderPath: string) => void;
  onNewSubFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  items,
  selectedPath,
  expandedFolders,
  onToggleFolder,
  onSelectNote,
  onNewNoteInFolder,
  onNewSubFolder,
  onDeleteFolder,
}) => {
  if (items.length === 0) {
    return (
      <div className="tree-empty">
        <p>暂无笔记</p>
      </div>
    );
  }

  return (
    <nav className="file-tree" aria-label="文件树">
      {items.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          level={0}
          selectedPath={selectedPath}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectNote={onSelectNote}
          onNewNoteInFolder={onNewNoteInFolder}
          onNewSubFolder={onNewSubFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </nav>
  );
};
