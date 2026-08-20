import { useEffect } from "react";

interface ShortcutsOptions {
  onSave?: () => void;
  onQuickOpen?: () => void;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(options: ShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "Escape") {
        options.onEscape?.();
        return;
      }

      if (mod && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "s") {
          e.preventDefault();
          options.onSave?.();
        } else if (key === "p") {
          e.preventDefault();
          options.onQuickOpen?.();
        } else if (key === "k") {
          e.preventDefault();
          options.onSearch?.();
        } else if (key === "b") {
          e.preventDefault();
          options.onToggleSidebar?.();
        } else if (key === "n") {
          e.preventDefault();
          options.onNewNote?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [options]);
}
