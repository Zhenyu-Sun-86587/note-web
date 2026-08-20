import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { ensureMdExtension, joinPaths } from "../../utils/note-path";
import type { TreeNode } from "../../api/types";

interface NewNoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFolder: string;
  tree: TreeNode[];
  onSubmit: (notePath: string) => Promise<void>;
}

function extractFolders(tree: TreeNode[]): string[] {
  const folders: string[] = [""];
  function recurse(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.type === "folder") {
        folders.push(node.path);
        recurse(node.children);
      }
    }
  }
  recurse(tree);
  return folders;
}

export const NewNoteDialog: React.FC<NewNoteDialogProps> = ({
  isOpen,
  onClose,
  defaultFolder,
  tree,
  onSubmit,
}) => {
  const [folder, setFolder] = useState(defaultFolder);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const folders = extractFolders(tree);

  useEffect(() => {
    if (isOpen) {
      setFolder(defaultFolder);
      setFilename("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultFolder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = filename.trim();
    if (!cleanName) {
      setError("请输入文件名");
      return;
    }

    const fullNoteName = ensureMdExtension(cleanName);
    const fullPath = folder ? joinPaths(folder, fullNoteName) : fullNoteName;

    setLoading(true);
    setError(null);
    try {
      await onSubmit(fullPath);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新建笔记">
      <form onSubmit={handleSubmit} className="dialog-form">
        <div className="form-group">
          <label className="form-label">存放目录</label>
          <select
            className="form-select"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            {folders.map((f) => (
              <option key={f} value={f}>
                {f ? `/${f}` : "/ (根目录)"}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">笔记名称</label>
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder="例如: meeting-notes"
            value={filename}
            onChange={(e) => {
              setFilename(e.target.value);
              setError(null);
            }}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="dialog-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "创建中..." : "创建"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
