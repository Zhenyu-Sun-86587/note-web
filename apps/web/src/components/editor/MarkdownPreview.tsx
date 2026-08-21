import { useMemo, useRef, useImperativeHandle, forwardRef } from "react";
import { renderMarkdown } from "../../utils/markdown-renderer";
import { Link2, Link2Off } from "lucide-react";

export interface MarkdownPreviewHandle {
  scrollToSourceLine: (line: number) => void;
  getContainer: () => HTMLDivElement | null;
}

export interface MarkdownPreviewProps {
  notePath: string;
  content: string;
  theme?: "light" | "dark";
  syncScrollEnabled?: boolean;
  onToggleSyncScroll?: () => void;
  onScroll?: (scrollTop: number, sourceLine: number) => void;
}

export const MarkdownPreview = forwardRef<
  MarkdownPreviewHandle,
  MarkdownPreviewProps
>(
  (
    {
      notePath,
      content,
      syncScrollEnabled = true,
      onToggleSyncScroll,
      onScroll,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const onScrollRef = useRef(onScroll);
    onScrollRef.current = onScroll;

    const html = useMemo(() => {
      return renderMarkdown(content, notePath);
    }, [content, notePath]);

    useImperativeHandle(
      ref,
      () => ({
        getContainer: () => containerRef.current,
        scrollToSourceLine: (sourceLine: number) => {
          const container = containerRef.current;
          if (!container) return;

          const elements = Array.from(
            container.querySelectorAll<HTMLElement>("[data-source-line]"),
          );
          if (elements.length === 0) return;

          const containerRect = container.getBoundingClientRect();
          const currentScrollTop = container.scrollTop;

          const mapped = elements.map((el) => {
            const line = parseInt(el.getAttribute("data-source-line") || "1", 10);
            const endLineAttr = el.getAttribute("data-source-end-line");
            const endLine = endLineAttr ? parseInt(endLineAttr, 10) : line;
            const top = el.getBoundingClientRect().top - containerRect.top + currentScrollTop;
            return { el, line, endLine, top };
          });

          // If line is before first element
          if (sourceLine <= mapped[0].line) {
            container.scrollTop = 0;
            return;
          }

          // If line is after last element
          const last = mapped[mapped.length - 1];
          if (sourceLine >= (last.endLine || last.line)) {
            container.scrollTop = container.scrollHeight - container.clientHeight;
            return;
          }

          // Find surrounding elements
          let before = mapped[0];
          let after = mapped[mapped.length - 1];

          for (let i = 0; i < mapped.length; i++) {
            if (mapped[i].line <= sourceLine) {
              before = mapped[i];
            }
            if (mapped[i].line > sourceLine) {
              after = mapped[i];
              break;
            }
          }

          if (before === after || before.line === after.line) {
            container.scrollTop = before.top;
            return;
          }

          // Linear interpolation between source line and DOM top
          const fraction = (sourceLine - before.line) / (after.line - before.line);
          const targetTop = before.top + fraction * (after.top - before.top);
          container.scrollTop = Math.max(0, targetTop);
        },
      }),
      [],
    );

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>("[data-source-line]"),
      );
      if (elements.length === 0) {
        onScrollRef.current?.(scrollTop, 1);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const mapped = elements.map((el) => {
        const line = parseInt(el.getAttribute("data-source-line") || "1", 10);
        const endLineAttr = el.getAttribute("data-source-end-line");
        const endLine = endLineAttr ? parseInt(endLineAttr, 10) : line;
        const top = el.getBoundingClientRect().top - containerRect.top + scrollTop;
        return { el, line, endLine, top };
      });

      if (scrollTop <= 5) {
        onScrollRef.current?.(scrollTop, 1);
        return;
      }

      const maxScrollTop = container.scrollHeight - container.clientHeight;
      if (scrollTop >= maxScrollTop - 5) {
        const last = mapped[mapped.length - 1];
        onScrollRef.current?.(scrollTop, last.endLine || last.line);
        return;
      }

      let before = mapped[0];
      let after = mapped[mapped.length - 1];

      for (let i = 0; i < mapped.length; i++) {
        if (mapped[i].top <= scrollTop) {
          before = mapped[i];
        }
        if (mapped[i].top > scrollTop) {
          after = mapped[i];
          break;
        }
      }

      if (before === after || after.top === before.top) {
        onScrollRef.current?.(scrollTop, before.line);
        return;
      }

      const fraction = (scrollTop - before.top) / (after.top - before.top);
      const calculatedLine = before.line + fraction * (after.line - before.line);
      onScrollRef.current?.(scrollTop, calculatedLine);
    };

    return (
      <div
        ref={containerRef}
        className="note-web-markdown-preview"
        aria-label="Markdown 实时预览"
        onScroll={handleScroll}
      >
        <div className="preview-toolbar">
          <span className="preview-badge">PREVIEW</span>
          {onToggleSyncScroll && (
            <button
              type="button"
              className={`preview-sync-toggle ${syncScrollEnabled ? "active" : ""}`}
              onClick={onToggleSyncScroll}
              title={syncScrollEnabled ? "双向同步滚动: 已开启" : "双向同步滚动: 已关闭"}
              aria-label={syncScrollEnabled ? "关闭同步滚动" : "开启同步滚动"}
            >
              {syncScrollEnabled ? <Link2 size={12} /> : <Link2Off size={12} />}
              <span>{syncScrollEnabled ? "同步滚动" : "独立滚动"}</span>
            </button>
          )}
        </div>
        <div
          className="markdown-preview-content vditor-reset"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  },
);

MarkdownPreview.displayName = "MarkdownPreview";
