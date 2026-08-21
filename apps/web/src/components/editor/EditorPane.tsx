import { useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
import { VditorEditor } from "./VditorEditor";
import { VimMarkdownEditor } from "./VimMarkdownEditor";
import { MarkdownPreview, type MarkdownPreviewHandle } from "./MarkdownPreview";
import { EmptyEditor } from "./EmptyEditor";
import { ConflictBanner } from "./ConflictBanner";
import type { Theme } from "./VditorEditor";
import type { EditorHandle } from "./EditorHandle";

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
    },
    ref,
  ) => {
    const activeEditorRef = useRef<EditorHandle | null>(null);
    const previewRef = useRef<MarkdownPreviewHandle | null>(null);
    const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);

    const isSyncingEditorToPreview = useRef(false);
    const isSyncingPreviewToEditor = useRef(false);

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
      return <EmptyEditor onNewNote={onNewNote} />;
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
              className={`vim-split-container ${vimPreviewOpen ? "preview-open" : "preview-closed"}`}
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
                  <div className="vim-split-divider" />
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
