import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import {
  getBasename,
  getDirname,
  ensureMdExtension,
  joinPaths,
  removeMdExtension,
} from "../../utils/note-path";

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onSubmit: (newPath: string) => Promise<void>;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  onClose,
  currentPath,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const base = getBasename(currentPath);
      setName(removeMdExtension(base));
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, currentPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("请输入新的文件名");
      return;
    }

    const dir = getDirname(currentPath);
    const newNameWithExt = ensureMdExtension(cleanName);
    const newPath = dir ? joinPaths(dir, newNameWithExt) : newNameWithExt;

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
      setError(err instanceof Error ? err.message : "重命名失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="重命名笔记">
      <form onSubmit={handleSubmit} className="dialog-form">
        <div className="form-group">
          <label className="form-label">文件名</label>
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
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
            {loading ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
