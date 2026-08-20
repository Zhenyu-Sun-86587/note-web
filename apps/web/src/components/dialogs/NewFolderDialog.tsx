import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { joinPaths } from "../../utils/note-path";
import type { TreeNode } from "../../api/types";

interface NewFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultParent: string;
  tree: TreeNode[];
  onSubmit: (folderPath: string) => Promise<void>;
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

export const NewFolderDialog: React.FC<NewFolderDialogProps> = ({
  isOpen,
  onClose,
  defaultParent,
  tree,
  onSubmit,
}) => {
  const [parentFolder, setParentFolder] = useState(defaultParent);
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const folders = extractFolders(tree);

  useEffect(() => {
    if (isOpen) {
      setParentFolder(defaultParent);
      setFolderName("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultParent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = folderName.trim();
    if (!cleanName) {
      setError("请输入目录名称");
      return;
    }

    const fullPath = parentFolder
      ? joinPaths(parentFolder, cleanName)
      : cleanName;

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
    <Modal isOpen={isOpen} onClose={onClose} title="新建目录">
      <form onSubmit={handleSubmit} className="dialog-form">
        <div className="form-group">
          <label className="form-label">父级目录</label>
          <select
            className="form-select"
            value={parentFolder}
            onChange={(e) => setParentFolder(e.target.value)}
          >
            {folders.map((f) => (
              <option key={f} value={f}>
                {f ? `/${f}` : "/ (根目录)"}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">目录名称</label>
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder="例如: projects"
            value={folderName}
            onChange={(e) => {
              setFolderName(e.target.value);
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
