import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { getBasename, getDirname, joinPaths } from "../../utils/note-path";
import type { TreeNode } from "../../api/types";

interface MoveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  tree: TreeNode[];
  onSubmit: (newPath: string) => Promise<void>;
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

export const MoveDialog: React.FC<MoveDialogProps> = ({
  isOpen,
  onClose,
  currentPath,
  tree,
  onSubmit,
}) => {
  const [targetFolder, setTargetFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folders = extractFolders(tree);

  useEffect(() => {
    if (isOpen) {
      const currentDir = getDirname(currentPath);
      setTargetFolder(currentDir);
      setError(null);
    }
  }, [isOpen, currentPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const base = getBasename(currentPath);
    const newPath = targetFolder ? joinPaths(targetFolder, base) : base;

    if (newPath === currentPath) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(newPath);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "移动失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="移动笔记">
      <form onSubmit={handleSubmit} className="dialog-form">
        <div className="form-group">
          <label className="form-label">目标目录</label>
          <select
            className="form-select"
            value={targetFolder}
            onChange={(e) => setTargetFolder(e.target.value)}
          >
            {folders.map((f) => (
              <option key={f} value={f}>
                {f ? `/${f}` : "/ (根目录)"}
              </option>
            ))}
          </select>
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
            {loading ? "移动中..." : "确认移动"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
