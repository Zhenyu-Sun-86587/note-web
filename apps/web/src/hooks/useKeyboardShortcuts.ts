import { useEffect } from "react";

interface ShortcutsOptions {
  onSave?: () => void;
  onQuickOpen?: () => void;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  onOpenSettings?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(options: ShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const isInsideVim = Boolean(target?.closest(".note-web-vim-editor"));
      const isInsideModal = Boolean(
        target?.closest(".modal-backdrop, .modal-content, [role='dialog']"),
      );

      const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Save: Ctrl/Cmd + S is always intercepted and handled
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        options.onSave?.();
        return;
      }

      // If focus is inside Vim editor (and not inside an open modal dialog),
      // allow Vim to handle all other keys natively (Ctrl+P, Ctrl+N, Ctrl+B, Ctrl+F, Escape, etc.)
      // and prevent browser shortcuts (e.g. Ctrl+R reload, Ctrl+P print) from taking over Vim chords.
      if (isInsideVim && !isInsideModal) {
        if (e.ctrlKey && !e.metaKey && !e.altKey) {
          const key = e.key.toLowerCase();
          const vimHijackCtrlKeys = new Set([
            "r",
            "p",
            "f",
            "b",
            "d",
            "u",
            "o",
            "n",
            "w",
            "a",
            "e",
            "y",
            "v",
            "[",
            "]",
            "c",
            "h",
            "j",
            "k",
            "l",
            "g",
            "t",
            "i",
            "m",
            "q",
          ]);
          if (vimHijackCtrlKeys.has(key)) {
            e.preventDefault();
          }
        }
        return;
      }

      if (e.key === "Escape") {
        options.onEscape?.();
        return;
      }

      // Settings: Ctrl/Cmd + ,
      if (mod && !e.shiftKey && !e.altKey && e.key === ",") {
        e.preventDefault();
        options.onOpenSettings?.();
        return;
      }

      // Quick Open: Ctrl/Cmd + P
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        options.onQuickOpen?.();
        return;
      }

      // Toggle Sidebar: Ctrl/Cmd + Shift + B
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        options.onToggleSidebar?.();
        return;
      }

      // Global Search: Ctrl/Cmd + Shift + F
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        options.onSearch?.();
        return;
      }

      // New Note: Ctrl/Cmd + N
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        options.onNewNote?.();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [options]);
}
