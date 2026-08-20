import React, { useState, useEffect, useRef } from "react";
import { Zap, FileText } from "lucide-react";
import type { TreeNode } from "../../api/types";
import { Modal } from "../common/Modal";

interface QuickOpenDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tree: TreeNode[];
  onSelectNote: (path: string) => void;
}

interface FlattenedNote {
  name: string;
  path: string;
}

function extractAllNotes(items: TreeNode[]): FlattenedNote[] {
  const notes: FlattenedNote[] = [];
  function recurse(list: TreeNode[]) {
    for (const item of list) {
      if (item.type === "note") {
        notes.push({ name: item.name, path: item.path });
      } else if (item.type === "folder") {
        recurse(item.children);
      }
    }
  }
  recurse(items);
  return notes;
}

export const QuickOpenDialog: React.FC<QuickOpenDialogProps> = ({
  isOpen,
  onClose,
  tree,
  onSelectNote,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allNotes = extractAllNotes(tree);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = allNotes.filter(
    (n) =>
      n.name.toLowerCase().includes(normalizedQuery) ||
      n.path.toLowerCase().includes(normalizedQuery),
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filtered.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectNote(filtered[selectedIndex].path);
        onClose();
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="快速打开" width={560}>
      <div className="quick-open-dialog">
        <div className="search-input-wrapper">
          <Zap size={16} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="输入文件名或路径..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="search-results-list">
          {filtered.length === 0 ? (
            <div className="search-empty">没有匹配的笔记</div>
          ) : (
            filtered.map((note, idx) => (
              <div
                key={note.path}
                className={`search-result-item ${idx === selectedIndex ? "selected" : ""}`}
                onClick={() => {
                  onSelectNote(note.path);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <FileText size={16} className="result-icon" />
                <div className="result-info">
                  <div className="result-name">{note.name}</div>
                  <div className="result-path">{note.path}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
