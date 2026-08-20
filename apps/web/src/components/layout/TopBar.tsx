import React, { useState } from "react";
import {
  PanelLeft,
  Sun,
  Moon,
  Save,
  MoreVertical,
  Edit2,
  FolderInput,
  Trash2,
} from "lucide-react";
import { IconButton } from "../common/IconButton";
import { Button } from "../common/Button";
import type { Theme } from "../../hooks/useTheme";

interface TopBarProps {
  currentPath: string | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  theme: Theme;
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
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
          label={sidebarOpen ? "隐藏侧边栏 (Ctrl+B)" : "显示侧边栏 (Ctrl+B)"}
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
        {currentPath && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSave}
              disabled={!canSave}
              className="save-button"
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
          icon={theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          label={theme === "light" ? "切换至深色模式" : "切换至浅色模式"}
          onClick={onToggleTheme}
          size="sm"
        />
      </div>
    </header>
  );
};
