import React from "react";
import { VditorEditor } from "./VditorEditor";
import { EmptyEditor } from "./EmptyEditor";
import { ConflictBanner } from "./ConflictBanner";
import type { Theme } from "./VditorEditor";

interface EditorPaneProps {
  notePath: string | null;
  initialContent: string;
  hasConflict: boolean;
  theme: Theme;
  onChange: (value: string) => void;
  onNewNote: () => void;
  onReloadConflict: () => void;
  onSaveAsConflictCopy: () => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  notePath,
  initialContent,
  hasConflict,
  theme,
  onChange,
  onNewNote,
  onReloadConflict,
  onSaveAsConflictCopy,
}) => {
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
        <VditorEditor
          key={notePath}
          notePath={notePath}
          value={initialContent}
          theme={theme}
          onChange={onChange}
        />
      </div>
    </div>
  );
};
