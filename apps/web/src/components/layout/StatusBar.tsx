import React from "react";
import type { SaveStatus } from "../../api/types";
import { Check, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";

interface StatusBarProps {
  saveStatus: SaveStatus;
  content: string;
  isNoteOpen: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  saveStatus,
  content,
  isNoteOpen,
}) => {
  const getStatusDisplay = () => {
    switch (saveStatus) {
      case "saving":
        return (
          <span className="status-badge status-saving">
            <Loader2 size={12} className="spinner" />
            正在保存...
          </span>
        );
      case "saved":
        return (
          <span className="status-badge status-saved">
            <Check size={12} />
            已保存
          </span>
        );
      case "dirty":
        return (
          <span className="status-badge status-dirty">
            <span className="status-dot" />
            未保存
          </span>
        );
      case "conflict":
        return (
          <span className="status-badge status-conflict">
            <AlertTriangle size={12} />
            版本冲突
          </span>
        );
      case "error":
        return (
          <span className="status-badge status-error">
            <AlertCircle size={12} />
            保存失败
          </span>
        );
      default:
        return null;
    }
  };

  const calculateCounts = () => {
    if (!isNoteOpen || !content) {
      return { chars: 0, words: 0 };
    }
    const chars = content.length;
    // Chinese characters + English words
    const cnMatches = content.match(/[\u4e00-\u9fa5]/g) || [];
    const enMatches =
      content
        .replaceAll(/[\u4e00-\u9fa5]/g, " ")
        .match(/[a-zA-Z0-9_\-]+/g) || [];
    const words = cnMatches.length + enMatches.length;
    return { chars, words };
  };

  const { chars, words } = calculateCounts();

  return (
    <footer className="statusbar">
      <div className="statusbar-left">{isNoteOpen && getStatusDisplay()}</div>
      <div className="statusbar-right">
        {isNoteOpen && (
          <>
            <span className="statusbar-metric">{words} 词</span>
            <span className="statusbar-metric">{chars} 字符</span>
          </>
        )}
        <span className="statusbar-mode">IR</span>
      </div>
    </footer>
  );
};
