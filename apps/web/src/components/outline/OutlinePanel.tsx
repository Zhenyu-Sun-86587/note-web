import React, { useMemo } from "react";
import { X, AlignLeft } from "lucide-react";
import type { HeadingItem } from "../../utils/outline-parser";

export interface OutlinePanelProps {
  headings: HeadingItem[];
  activeLine?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectHeading: (heading: HeadingItem) => void;
}

export const OutlinePanel: React.FC<OutlinePanelProps> = ({
  headings,
  activeLine,
  isOpen,
  onClose,
  onSelectHeading,
}) => {
  // Determine active heading based on activeLine (the last heading at or above activeLine)
  const activeHeadingId = useMemo(() => {
    if (activeLine == null || headings.length === 0) {
      return headings[0]?.id ?? null;
    }
    let current: HeadingItem | null = null;
    for (const h of headings) {
      if (h.line <= activeLine) {
        current = h;
      } else {
        break;
      }
    }
    return current?.id ?? headings[0]?.id ?? null;
  }, [headings, activeLine]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="outline-panel" aria-label="文档大纲">
      <div className="outline-header">
        <div className="outline-title-wrap">
          <AlignLeft size={16} className="outline-header-icon" />
          <span className="outline-title">大纲</span>
          {headings.length > 0 && (
            <span className="outline-count">{headings.length}</span>
          )}
        </div>
        <button
          type="button"
          className="outline-close-btn"
          onClick={onClose}
          title="关闭大纲 (Ctrl+Alt+O)"
          aria-label="关闭大纲"
        >
          <X size={14} />
        </button>
      </div>

      <div className="outline-content">
        {headings.length === 0 ? (
          <div className="outline-empty">无大纲内容</div>
        ) : (
          <nav className="outline-list">
            {headings.map((item) => {
              const isActive = item.id === activeHeadingId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`outline-item outline-level-${item.level} ${isActive ? "active" : ""}`}
                  style={{
                    paddingLeft: `${Math.max(0, (item.level - 1) * 12 + 12)}px`,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelectHeading(item)}
                  title={item.text}
                >
                  <span className="outline-item-level">H{item.level}</span>
                  <span className="outline-item-text">{item.text}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </aside>
  );
};
