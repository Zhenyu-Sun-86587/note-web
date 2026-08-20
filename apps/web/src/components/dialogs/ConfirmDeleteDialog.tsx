import React, { useState } from "react";
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

  const handleConfirm = async () => {
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
        <p className="delete-subtext">此操作不可撤销。</p>

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
            {loading ? "删除中..." : "确认删除"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
