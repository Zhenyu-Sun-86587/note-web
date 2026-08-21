import React from "react";
import { FileText, FilePlus } from "lucide-react";
import { Button } from "../common/Button";

interface EmptyEditorProps {
  onNewNote: () => void;
}

export const EmptyEditor: React.FC<EmptyEditorProps> = ({ onNewNote }) => {
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
            新建笔记 (Ctrl+Shift+N)
          </Button>
        </div>
        <div className="empty-editor-shortcuts">
          <div className="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> 快速打开
          </div>
          <div className="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> 全文搜索
          </div>
          <div className="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> 保存笔记
          </div>
          <div className="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> 切换侧边栏
          </div>
          <div className="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>,</kbd> 设置
          </div>
        </div>
      </div>
    </div>
  );
};
