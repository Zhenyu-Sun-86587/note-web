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
      const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "Escape") {
        options.onEscape?.();
        return;
      }

      // Save: Ctrl/Cmd + S
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        options.onSave?.();
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
