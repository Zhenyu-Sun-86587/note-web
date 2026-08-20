import { useRef, useImperativeHandle, forwardRef } from "react";
import { VditorEditor } from "./VditorEditor";
import { VimMarkdownEditor } from "./VimMarkdownEditor";
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
  onChange: (value: string) => void;
  onNewNote: () => void;
  onReloadConflict: () => void;
  onSaveAsConflictCopy: () => void;
  onSave?: () => void;
  onSwitchToIR?: () => void;
  onToggleZen?: () => void;
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
      onChange,
      onNewNote,
      onReloadConflict,
      onSaveAsConflictCopy,
      onSave,
      onSwitchToIR,
      onToggleZen,
    },
    ref,
  ) => {
    const activeEditorRef = useRef<EditorHandle | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => activeEditorRef.current?.getValue() ?? initialContent,
        focus: () => activeEditorRef.current?.focus(),
      }),
      [initialContent],
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
            <VimMarkdownEditor
              key={`${notePath}-vim`}
              ref={activeEditorRef}
              value={initialContent}
              theme={theme}
              vimRelativeLineNumbers={vimRelativeLineNumbers}
              vimLineWrapping={vimLineWrapping}
              vimJjEscape={vimJjEscape}
              onChange={onChange}
              onSave={onSave}
              onSwitchToIR={onSwitchToIR}
              onToggleZen={onToggleZen}
            />
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
