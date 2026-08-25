import { useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
import { VditorEditor } from "./VditorEditor";
import { VimMarkdownEditor } from "./VimMarkdownEditor";
import { MarkdownPreview, type MarkdownPreviewHandle } from "./MarkdownPreview";
import { EmptyEditor } from "./EmptyEditor";
import { ConflictBanner } from "./ConflictBanner";
import {
  loadSavedSplitRatio,
  saveSplitRatio,
  calculateSplitRatio,
  DEFAULT_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
} from "../../utils/split-layout";
import type { Theme } from "./VditorEditor";
import type { EditorHandle } from "./EditorHandle";
import type { CustomShortcuts } from "../../utils/vim-keyboard";

export interface EditorPaneProps {
  notePath: string | null;
  initialContent: string;
  hasConflict: boolean;
  theme: Theme;
  editorMode: "ir" | "vim";
  vimRelativeLineNumbers?: boolean;
  vimLineWrapping?: boolean;
  vimJjEscape?: boolean;
  vimPreviewOpen?: boolean;
  onChange: (value: string) => void;
  onNewNote: () => void;
  onReloadConflict: () => void;
  onSaveAsConflictCopy: () => void;
  onSave?: () => void;
  onSwitchToIR?: () => void;
  onToggleZen?: () => void;
  onCursorActivity?: (line: number) => void;
  shortcuts?: Partial<CustomShortcuts>;
}

export const EditorPane = forwardRef<EditorHandle, EditorPaneProps>(
  (
    {
      notePath,
      initialContent,
      hasConflict,
      theme,
      editorMode,
      vimRelativeLineNumbers,
      vimLineWrapping,
      vimJjEscape,
      vimPreviewOpen = false,
      onChange,
      onNewNote,
      onReloadConflict,
      onSaveAsConflictCopy,
      onSave,
      onSwitchToIR,
      onToggleZen,
      onCursorActivity,
      shortcuts,
    },
    ref,
  ) => {
    const activeEditorRef = useRef<EditorHandle | null>(null);
    const previewRef = useRef<MarkdownPreviewHandle | null>(null);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);
    const [isResizingSplit, setIsResizingSplit] = useState(false);
    const [splitRatio, setSplitRatio] = useState<number>(loadSavedSplitRatio);

    const isSyncingEditorToPreview = useRef(false);
    const isSyncingPreviewToEditor = useRef(false);

    const handleDividerPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsResizingSplit(true);

        const handlePointerMove = (moveEvent: PointerEvent) => {
          const container = splitContainerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const nextRatio = calculateSplitRatio(moveEvent.clientX, rect);
          setSplitRatio(nextRatio);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
          setIsResizingSplit(false);
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);

          const container = splitContainerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const nextRatio = calculateSplitRatio(upEvent.clientX, rect);
          setSplitRatio(nextRatio);
          saveSplitRatio(nextRatio);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
      },
      [],
    );

    const handleDividerDoubleClick = useCallback(() => {
      setSplitRatio(DEFAULT_SPLIT_RATIO);
      saveSplitRatio(DEFAULT_SPLIT_RATIO);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => activeEditorRef.current?.getValue() ?? initialContent,
        focus: () => activeEditorRef.current?.focus(),
        scrollToHeading: (heading) =>
          activeEditorRef.current?.scrollToHeading?.(heading),
        scrollToLine: (line) => activeEditorRef.current?.scrollToLine?.(line),
        scrollViewportToLine: (line) =>
          activeEditorRef.current?.scrollViewportToLine?.(line),
        getVisibleTopLine: () =>
          activeEditorRef.current?.getVisibleTopLine?.() ?? 1,
        getCursorLine: () => activeEditorRef.current?.getCursorLine?.() ?? 1,
      }),
      [initialContent],
    );

    // Sync Editor -> Preview
    const handleEditorScroll = useCallback(
      (_scrollTop: number, topSourceLine: number) => {
        if (!syncScrollEnabled || isSyncingPreviewToEditor.current) return;
        isSyncingEditorToPreview.current = true;
        previewRef.current?.scrollToSourceLine(topSourceLine);
        setTimeout(() => {
          isSyncingEditorToPreview.current = false;
        }, 50);
      },
      [syncScrollEnabled],
    );

    // Sync Preview -> Editor
    const handlePreviewScroll = useCallback(
      (_scrollTop: number, sourceLine: number) => {
        if (!syncScrollEnabled || isSyncingEditorToPreview.current) return;
        isSyncingPreviewToEditor.current = true;
        activeEditorRef.current?.scrollViewportToLine?.(sourceLine);
        setTimeout(() => {
          isSyncingPreviewToEditor.current = false;
        }, 50);
      },
      [syncScrollEnabled],
    );

    if (!notePath) {
      return <EmptyEditor onNewNote={onNewNote} shortcuts={shortcuts} />;
    }

    return (
      <div className="editor-pane">
        {hasConflict && (
          <ConflictBanner
            onReload={onReloadConflict}
            onSaveAsCopy={onSaveAsConflictCopy}
          />
        )}
        <div className="editor-wrapper">
          {editorMode === "vim" ? (
            <div
              ref={splitContainerRef}
              className={`vim-split-container ${vimPreviewOpen ? "preview-open" : "preview-closed"} ${isResizingSplit ? "is-resizing-split" : ""}`}
              style={
                vimPreviewOpen
                  ? ({
                      "--vim-split-ratio": `${(splitRatio * 100).toFixed(2)}%`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <div className="vim-split-editor">
                <VimMarkdownEditor
                  key={`${notePath}-vim`}
                  ref={activeEditorRef}
                  notePath={notePath}
                  value={initialContent}
                  theme={theme}
                  vimRelativeLineNumbers={vimRelativeLineNumbers}
                  vimLineWrapping={vimLineWrapping}
                  vimJjEscape={vimJjEscape}
                  onChange={onChange}
                  onSave={onSave}
                  onSwitchToIR={onSwitchToIR}
                  onToggleZen={onToggleZen}
                  onCursorActivity={onCursorActivity}
                  onScroll={handleEditorScroll}
                />
              </div>
              {vimPreviewOpen && (
                <>
                  <div
                    className={`vim-split-divider ${isResizingSplit ? "is-resizing" : ""}`}
                    onPointerDown={handleDividerPointerDown}
                    onDoubleClick={handleDividerDoubleClick}
                    title="拖拽调整编辑器与预览占比，双击恢复 50%"
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuenow={Math.round(splitRatio * 100)}
                    aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
                    aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
                    tabIndex={0}
                  />
                  <div className="vim-split-preview">
                    <MarkdownPreview
                      ref={previewRef}
                      notePath={notePath}
                      content={initialContent}
                      theme={theme}
                      syncScrollEnabled={syncScrollEnabled}
                      onToggleSyncScroll={() => setSyncScrollEnabled((p) => !p)}
                      onScroll={handlePreviewScroll}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <VditorEditor
              key={`${notePath}-ir`}
              ref={activeEditorRef}
              notePath={notePath}
              value={initialContent}
              theme={theme}
              onChange={onChange}
            />
          )}
        </div>
      </div>
    );
  },
);

EditorPane.displayName = "EditorPane";
