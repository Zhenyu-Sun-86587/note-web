import React from "react";
import { FileText, X } from "lucide-react";
import type { SaveStatus, NoteDocument } from "../../api/types";

export interface TabItem {
  path: string;
  title: string;
  draftContent: string;
  savedContent: string;
  revision: string | null;
  saveStatus: SaveStatus;
  doc: NoteDocument;
}

export interface TabBarProps {
  tabs: TabItem[];
  activePath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
}) => {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar" role="tablist" aria-label="打开的笔记标签页">
      <div className="tab-list">
        {tabs.map((tab) => {
          const isActive = tab.path === activePath;
          const isDirty = tab.draftContent !== tab.savedContent;

          return (
            <div
              key={tab.path}
              className={`tab-item ${isActive ? "active" : ""} ${isDirty ? "dirty" : ""}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onSelectTab(tab.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(tab.path);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  // Middle click closes tab
                  e.preventDefault();
                  onCloseTab(tab.path);
                }
              }}
              title={tab.path}
            >
              <FileText size={13} className="tab-icon" />
              <span className="tab-title">{tab.title}</span>
              {isDirty && (
                <span
                  className="tab-dirty-indicator"
                  title="未保存更改"
                  aria-label="未保存更改"
                >
                  ●
                </span>
              )}
              <button
                type="button"
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                title="关闭标签页"
                aria-label={`关闭 ${tab.title}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
