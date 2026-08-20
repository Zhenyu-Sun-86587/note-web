import React from "react";
import { AlertTriangle, RefreshCw, Copy } from "lucide-react";
import { Button } from "../common/Button";

interface ConflictBannerProps {
  onReload: () => void;
  onSaveAsCopy: () => void;
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({
  onReload,
  onSaveAsCopy,
}) => {
  return (
    <div className="conflict-banner">
      <div className="conflict-banner-icon">
        <AlertTriangle size={18} />
      </div>
      <div className="conflict-banner-text">
        <strong>文件版本冲突：</strong>
        <span>该文件在磁盘上已被其他程序修改。为防止数据丢失，自动保存已暂停。</span>
      </div>
      <div className="conflict-banner-actions">
        <Button variant="secondary" size="sm" onClick={onReload}>
          <RefreshCw size={13} style={{ marginRight: 4 }} />
          重新加载磁盘版本
        </Button>
        <Button variant="primary" size="sm" onClick={onSaveAsCopy}>
          <Copy size={13} style={{ marginRight: 4 }} />
          另存为冲突副本
        </Button>
      </div>
    </div>
  );
};
