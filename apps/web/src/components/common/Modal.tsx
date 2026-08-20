import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number | string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 440,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <IconButton icon={<X size={18} />} label="关闭" onClick={onClose} size="sm" />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};
