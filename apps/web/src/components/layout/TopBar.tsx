import React, { useState } from "react";
import {
  PanelLeft,
  Settings as SettingsIcon,
  Save,
  MoreVertical,
  Edit2,
  FolderInput,
  Trash2,
  Maximize2,
} from "lucide-react";
import { IconButton } from "../common/IconButton";
import { Button } from "../common/Button";

interface TopBarProps {
  currentPath: string | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onToggleZenMode?: () => void;
  editorMode: "ir" | "vim";
  onToggleEditorMode: (mode: "ir" | "vim") => void;
  onSave: () => void;
  canSave: boolean;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentPath,
  sidebarOpen,
  onToggleSidebar,
  onOpenSettings,
  onToggleZenMode,
  editorMode,
  onToggleEditorMode,
  onSave,
  canSave,
  onRename,
  onMove,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <IconButton
          icon={<PanelLeft size={18} />}
          label={sidebarOpen ? "隐藏侧边栏 (Ctrl+Shift+B)" : "显示侧边栏 (Ctrl+Shift+B)"}
          onClick={onToggleSidebar}
          size="sm"
        />
        <div className="topbar-path" title={currentPath || ""}>
          {currentPath ? (
            <span>{currentPath}</span>
          ) : (
            <span className="topbar-path-empty">未选择笔记</span>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <div className="editor-mode-toggle" role="group" aria-label="编辑器模式">
          <button
            type="button"
            className={`mode-btn ${editorMode === "ir" ? "active" : ""}`}
            onClick={() => onToggleEditorMode("ir")}
            title="即时渲染 (IR Mode)"
          >
            IR
          </button>
          <button
            type="button"
            className={`mode-btn ${editorMode === "vim" ? "active" : ""}`}
            onClick={() => onToggleEditorMode("vim")}
            title="Vim Markdown Mode"
          >
            VIM
          </button>
        </div>

        {currentPath && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSave}
              disabled={!canSave}
              className="save-button"
              title="保存 (Ctrl+Shift+S)"
            >
              <Save size={14} style={{ marginRight: 4 }} />
              保存
            </Button>

            <div className="dropdown-container">
              <IconButton
                icon={<MoreVertical size={16} />}
                label="更多操作"
                onClick={() => setMenuOpen(!menuOpen)}
                size="sm"
              />
              {menuOpen && (
                <>
                  <div
                    className="dropdown-backdrop"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="dropdown-menu">
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onRename();
                      }}
                    >
                      <Edit2 size={14} />
                      重命名
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onMove();
                      }}
                    >
                      <FolderInput size={14} />
                      移动到...
                    </button>
                    <div className="dropdown-divider" />
                    <button
                      className="dropdown-item dropdown-item-danger"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                    >
                      <Trash2 size={14} />
                      删除笔记
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <IconButton
          icon={<Maximize2 size={18} />}
          label={
            editorMode === "vim"
              ? "专注模式 (:zen 退出)"
              : "专注模式 (Esc 退出)"
          }
          onClick={onToggleZenMode}
          size="sm"
        />

        <IconButton
          icon={<SettingsIcon size={18} />}
          label="设置"
          onClick={onOpenSettings}
          size="sm"
        />
      </div>
    </header>
  );
};
