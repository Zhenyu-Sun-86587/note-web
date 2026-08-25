import React from "react";
import { FileText, FilePlus } from "lucide-react";
import { Button } from "../common/Button";
import {
  DEFAULT_APP_SHORTCUTS,
  formatShortcutBinding,
  type AppAction,
  type CustomShortcuts,
} from "../../utils/vim-keyboard";

interface EmptyEditorProps {
  onNewNote: () => void;
  shortcuts?: Partial<CustomShortcuts>;
}

export const EmptyEditor: React.FC<EmptyEditorProps> = ({
  onNewNote,
  shortcuts,
}) => {
  const getShortcutDesc = (action: AppAction) => {
    const binding =
      (shortcuts && shortcuts[action]) || DEFAULT_APP_SHORTCUTS[action];
    return formatShortcutBinding(binding);
  };

  return (
    <div className="empty-editor">
      <div className="empty-editor-card">
        <div className="empty-editor-icon">
          <FileText size={48} />
        </div>
        <h2>Note Web</h2>
        <p>在左侧选择一篇笔记开始编辑，或者新建一篇笔记。</p>
        <div className="empty-editor-actions">
          <Button variant="primary" onClick={onNewNote}>
            <FilePlus size={16} style={{ marginRight: 6 }} />
            新建笔记 ({getShortcutDesc("new-note")})
          </Button>
        </div>
        <div className="empty-editor-shortcuts">
          <div className="shortcut-item">
            <kbd>{getShortcutDesc("quick-open")}</kbd> 快速打开
          </div>
          <div className="shortcut-item">
            <kbd>{getShortcutDesc("search")}</kbd> 全文搜索
          </div>
          <div className="shortcut-item">
            <kbd>{getShortcutDesc("save")}</kbd> 保存笔记
          </div>
          <div className="shortcut-item">
            <kbd>{getShortcutDesc("sidebar")}</kbd> 切换侧边栏
          </div>
          <div className="shortcut-item">
            <kbd>{getShortcutDesc("settings")}</kbd> 设置
          </div>
        </div>
      </div>
    </div>
  );
};
