import React, { useEffect, useRef } from "react";
import {
  FileText,
  FolderPlus,
  FilePlus,
  Edit2,
  FolderInput,
  Copy,
  Clipboard,
  Trash2,
  RefreshCw,
} from "lucide-react";

export type ContextTarget =
  | {
      type: "note";
      path: string;
      x: number;
      y: number;
    }
  | {
      type: "folder";
      path: string;
      x: number;
      y: number;
    }
  | {
      type: "root";
      path: "";
      x: number;
      y: number;
    };

export interface FileClipboard {
  operation: "copy";
  type: "note";
  sourcePath: string;
}

interface FileContextMenuProps {
  target: ContextTarget | null;
  clipboard: FileClipboard | null;
  onClose: () => void;
  onOpenNote?: (path: string) => void;
  onNewNote?: (folderPath: string) => void;
  onNewFolder?: (parentPath: string) => void;
  onRename?: (target: { type: "note" | "folder"; path: string }) => void;
  onMove?: (notePath: string) => void;
  onCopy?: (notePath: string) => void;
  onPaste?: (targetFolder: string) => void;
  onDelete?: (target: { type: "note" | "folder"; path: string }) => void;
  onRefresh?: () => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  target,
  clipboard,
  onClose,
  onOpenNote,
  onNewNote,
  onNewFolder,
  onRename,
  onMove,
  onCopy,
  onPaste,
  onDelete,
  onRefresh,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleWindowChange = () => {
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [target, onClose]);

  if (!target) return null;

  // Viewport clamping
  const menuWidth = 180;
  const menuHeight = 220;
  const maxX = window.innerWidth - menuWidth - 8;
  const maxY = window.innerHeight - menuHeight - 8;
  const posX = Math.max(8, Math.min(target.x, maxX));
  const posY = Math.max(8, Math.min(target.y, maxY));

  return (
    <div
      ref={menuRef}
      className="dropdown-menu file-context-menu"
      style={{
        position: "fixed",
        top: posY,
        left: posX,
        zIndex: 1000,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
      }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {target.type === "note" && (
        <>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onOpenNote?.(target.path);
            }}
          >
            <FileText size={14} />
            打开
          </button>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onRename?.({ type: "note", path: target.path });
            }}
          >
            <Edit2 size={14} />
            重命名
          </button>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onMove?.(target.path);
            }}
          >
            <FolderInput size={14} />
            移动到...
          </button>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onCopy?.(target.path);
            }}
          >
            <Copy size={14} />
            复制
          </button>
          <div className="dropdown-divider" />
          <button
            className="dropdown-item dropdown-item-danger"
            role="menuitem"
            onClick={() => {
              onClose();
              onDelete?.({ type: "note", path: target.path });
            }}
          >
            <Trash2 size={14} />
            删除笔记
          </button>
        </>
      )}

      {target.type === "folder" && (
        <>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onNewNote?.(target.path);
            }}
          >
            <FilePlus size={14} />
            新建笔记
          </button>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onNewFolder?.(target.path);
            }}
          >
            <FolderPlus size={14} />
            新建子目录
          </button>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onRename?.({ type: "folder", path: target.path });
            }}
          >
            <Edit2 size={14} />
            重命名
          </button>
          {clipboard && (
            <button
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                onClose();
                onPaste?.(target.path);
              }}
            >
              <Clipboard size={14} />
              粘贴笔记
            </button>
          )}
          <div className="dropdown-divider" />
          <button
            className="dropdown-item dropdown-item-danger"
            role="menuitem"
            onClick={() => {
              onClose();
              onDelete?.({ type: "folder", path: target.path });
            }}
          >
            <Trash2 size={14} />
            删除目录
          </button>
        </>
      )}

      {target.type === "root" && (
        <>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onNewNote?.("");
            }}
          >
            <FilePlus size={14} />
            新建笔记
          </button>
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onNewFolder?.("");
            }}
          >
            <FolderPlus size={14} />
            新建目录
          </button>
          {clipboard && (
            <button
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                onClose();
                onPaste?.("");
              }}
            >
              <Clipboard size={14} />
              粘贴笔记
            </button>
          )}
          <div className="dropdown-divider" />
          <button
            className="dropdown-item"
            role="menuitem"
            onClick={() => {
              onClose();
              onRefresh?.();
            }}
          >
            <RefreshCw size={14} />
            刷新文件树
          </button>
        </>
      )}
    </div>
  );
};
