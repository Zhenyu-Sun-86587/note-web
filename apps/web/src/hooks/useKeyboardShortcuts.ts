import { useEffect } from "react";
import {
  isAppOwnedShortcut,
  type AppAction,
  type ShortcutBinding,
} from "../utils/vim-keyboard";

interface ShortcutsOptions {
  onSave?: () => void;
  onQuickOpen?: () => void;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  onOpenSettings?: () => void;
  onEscape?: () => void;
  onToggleOutline?: () => void;
  onToggleVimPreview?: () => void;
  shortcuts?: Partial<Record<AppAction, ShortcutBinding>>;
}

export function useKeyboardShortcuts(options: ShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const isInsideVim = Boolean(target?.closest(".note-web-vim-editor"));
      const isInsideModal = Boolean(
        target?.closest(".modal-backdrop, .modal-content, [role='dialog']"),
      );

      // 1. Escape: inside modal dialogs OR when outside Vim editor (e.g. IR editor Zen mode exit)
      if (e.key === "Escape") {
        if (!isInsideVim || isInsideModal) {
          options.onEscape?.();
        }
        return;
      }

      // 2. Note Web-owned Application Shortcuts
      const appAction = isAppOwnedShortcut(e, options.shortcuts);
      if (appAction) {
        e.preventDefault();
        e.stopPropagation();
        switch (appAction) {
          case "save":
            options.onSave?.();
            break;
          case "quick-open":
            options.onQuickOpen?.();
            break;
          case "new-note":
            options.onNewNote?.();
            break;
          case "search":
            options.onSearch?.();
            break;
          case "sidebar":
            options.onToggleSidebar?.();
            break;
          case "settings":
            options.onOpenSettings?.();
            break;
          case "toggle-outline":
            options.onToggleOutline?.();
            break;
          case "toggle-vim-preview":
            options.onToggleVimPreview?.();
            break;
        }
        return;
      }

      // 3. Vim-owned shortcuts and all other keyboard events:
      // In normal-ready mode, real events flow directly into CodeMirror and are
      // handled natively by @replit/codemirror-vim without manual hijacking.
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [options]);
}
