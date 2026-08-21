import React, { useMemo } from "react";
import { renderMarkdown } from "../../utils/markdown-renderer";

export interface MarkdownPreviewProps {
  notePath: string;
  content: string;
  theme?: "light" | "dark";
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  notePath,
  content,
}) => {
  const html = useMemo(() => {
    return renderMarkdown(content, notePath);
  }, [content, notePath]);

  return (
    <div className="note-web-markdown-preview" aria-label="Markdown 实时预览">
      <div
        className="markdown-preview-content vditor-reset"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
