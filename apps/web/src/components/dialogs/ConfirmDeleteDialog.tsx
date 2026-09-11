import React, { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { AlertCircle } from "lucide-react";

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemPath: string;
  itemType: "note" | "folder";
  onConfirm: () => Promise<void>;
}

export const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  isOpen,
  onClose,
  title,
  itemPath,
  itemType,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderDeleteConfirmed, setFolderDeleteConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFolderDeleteConfirmed(false);
    }
  }, [isOpen, itemPath]);

  const handleConfirm = async () => {
    if (itemType === "folder" && !folderDeleteConfirmed) {
      setFolderDeleteConfirmed(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width={400}>
      <div className="dialog-content">
        <div className="delete-warning">
          <AlertCircle size={20} className="warning-icon" />
          <p>
            确定要删除该{itemType === "note" ? "笔记" : "目录"}吗？
            <br />
            <strong>{itemPath}</strong>
          </p>
        </div>
        <p className="delete-subtext">
          {itemType === "folder"
            ? folderDeleteConfirmed
              ? "请再次确认：目录内的所有文件和子目录都将被永久删除。"
              : "该目录及其全部内容将被递归删除，此操作不可撤销。"
            : "此操作不可撤销。"}
        </p>

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
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading
              ? "删除中..."
              : itemType === "folder" && folderDeleteConfirmed
                ? "再次确认并删除"
                : "确认删除"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
