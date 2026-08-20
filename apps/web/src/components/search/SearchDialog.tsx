import React, { useState, useEffect, useRef } from "react";
import { Search, FileText } from "lucide-react";
import type { SearchMatch } from "../../api/types";
import { searchNotes } from "../../api/client";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNote: (path: string) => void;
}

export const SearchDialog: React.FC<SearchDialogProps> = ({
  isOpen,
  onClose,
  onSelectNote,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchNotes(trimmed, 50);
        setResults(res.items);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        onSelectNote(results[selectedIndex].path);
        onClose();
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="全文搜索" width={600}>
      <div className="search-dialog">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="搜索笔记标题与正文..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <Spinner size={16} className="search-spinner" />}
        </div>

        <div className="search-results-list">
          {query.trim() && !loading && results.length === 0 ? (
            <div className="search-empty">未找到匹配的内容</div>
          ) : (
            results.map((match, idx) => (
              <div
                key={`${match.path}-${match.line}-${idx}`}
                className={`search-result-item ${idx === selectedIndex ? "selected" : ""}`}
                onClick={() => {
                  onSelectNote(match.path);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <FileText size={16} className="result-icon" />
                <div className="result-info">
                  <div className="result-path-header">
                    <span className="result-path">{match.path}</span>
                    {match.line > 1 && (
                      <span className="result-line-badge">
                        第 {match.line} 行
                      </span>
                    )}
                  </div>
                  <div className="result-snippet">{match.snippet}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
