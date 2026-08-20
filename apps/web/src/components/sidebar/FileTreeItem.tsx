import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FilePlus,
  FolderPlus,
  Trash2,
} from "lucide-react";
import type { TreeNode } from "../../api/types";
import { removeMdExtension } from "../../utils/note-path";

interface FileTreeItemProps {
  node: TreeNode;
  level?: number;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectNote: (path: string) => void;
  onNewNoteInFolder: (folderPath: string) => void;
  onNewSubFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
}

export const FileTreeItem: React.FC<FileTreeItemProps> = ({
  node,
  level = 0,
  selectedPath,
  expandedFolders,
  onToggleFolder,
  onSelectNote,
  onNewNoteInFolder,
  onNewSubFolder,
  onDeleteFolder,
  onContextMenu,
}) => {
  const [hovered, setHovered] = useState(false);

  const indentStyle = { paddingLeft: `${level * 14 + 10}px` };

  if (node.type === "folder") {
    const isExpanded = expandedFolders.has(node.path);

    return (
      <div className="tree-folder-group">
        <div
          className={`tree-item tree-folder ${hovered ? "hovered" : ""}`}
          style={indentStyle}
          onClick={() => onToggleFolder(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu?.(e, node);
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span className="tree-caret">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="tree-icon">
            {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
          </span>
          <span className="tree-label">{node.name}</span>

          {hovered && (
            <div
              className="tree-item-actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="tree-action-btn"
                title="新建笔记"
                onClick={() => onNewNoteInFolder(node.path)}
              >
                <FilePlus size={13} />
              </button>
              <button
                className="tree-action-btn"
                title="新建子目录"
                onClick={() => onNewSubFolder(node.path)}
              >
                <FolderPlus size={13} />
              </button>
              {node.children.length === 0 && (
                <button
                  className="tree-action-btn tree-action-btn-danger"
                  title="删除空目录"
                  onClick={() => onDeleteFolder(node.path)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="tree-children">
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                level={level + 1}
                selectedPath={selectedPath}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onSelectNote={onSelectNote}
                onNewNoteInFolder={onNewNoteInFolder}
                onNewSubFolder={onNewSubFolder}
                onDeleteFolder={onDeleteFolder}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;

  return (
    <div
      className={`tree-item tree-note ${isSelected ? "selected" : ""}`}
      style={indentStyle}
      onClick={() => onSelectNote(node.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, node);
      }}
      title={node.path}
    >
      <span className="tree-caret tree-caret-placeholder" />
      <span className="tree-icon">
        <FileText size={15} />
      </span>
      <span className="tree-label">{removeMdExtension(node.name)}</span>
    </div>
  );
};
