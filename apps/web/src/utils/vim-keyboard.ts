import { Vim } from "@replit/codemirror-vim";

/**
 * Shortcuts owned by Note Web application rather than Vim.
 * In Normal mode, these should trigger App actions (Save, Quick Open, New Note, etc.)
 * rather than Vim motions/commands.
 */
export const NOTE_WEB_APP_SHORTCUTS = [
  { key: "s", ctrl: true, desc: "Save note" },
  { key: "p", ctrl: true, desc: "Quick Open" },
  { key: "n", ctrl: true, desc: "New note" },
  { key: ",", ctrl: true, desc: "Settings" },
  { key: "f", ctrl: true, shift: true, desc: "Global search" },
  { key: "b", ctrl: true, shift: true, desc: "Toggle sidebar" },
] as const;

/**
 * Vim bindings to unmap from @replit/codemirror-vim so that CodeMirror lets
 * the event bubble up to the Note Web shortcut router.
 */
export const APP_OWNED_VIM_UNMAPS = ["<C-p>", "<C-n>", "<C-s>"] as const;

let vimKeymapsConfigured = false;

/**
 * Configures Vim keymaps by unmapping Note Web-owned bindings.
 * Called during Vim editor initialization or module load.
 */
export function setupVimKeymaps() {
  if (vimKeymapsConfigured) return;

  const contexts = ["normal", "insert", "visual", "operator"];
  for (const binding of APP_OWNED_VIM_UNMAPS) {
    for (const ctx of contexts) {
      try {
        Vim.unmap(binding, ctx);
      } catch {}
    }
  }

  vimKeymapsConfigured = true;
}

/**
 * Helper to check if an event matches a Note Web App-owned shortcut.
 */
export function isAppOwnedShortcut(e: KeyboardEvent | {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): "save" | "quick-open" | "new-note" | "settings" | "search" | "sidebar" | null {
  const isMac =
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey) return null;

  const key = e.key.toLowerCase();

  // Ctrl/Cmd + Shift + F -> Search
  if (e.shiftKey && key === "f") return "search";
  // Ctrl/Cmd + Shift + B -> Sidebar
  if (e.shiftKey && key === "b") return "sidebar";

  // Shortcuts requiring shiftKey === false
  if (!e.shiftKey) {
    if (key === "s") return "save";
    if (key === "p") return "quick-open";
    if (key === "n") return "new-note";
    if (key === ",") return "settings";
  }

  return null;
}

/**
 * Vim-owned standard Ctrl chords that must be preserved for Vim in normal/visual mode.
 */
export const VIM_OWNED_CTRL_KEYS = new Set([
  "r", // Redo
  "f", // Page Down
  "b", // Page Up
  "d", // Half Page Down
  "u", // Half Page Up
  "o", // Jump older
  "i", // Jump newer (in Normal mode)
  "w", // Window command prefix (Ctrl+W)
  "a", // Increment number
  "x", // Decrement number
  "e", // Scroll line down
  "y", // Scroll line up
  "v", // Visual block mode
  "[", // Escape alias
  "]", // Jump to tag
  "c", // Interrupt / Escape alias
  "h", // Backspace alias
  "j", // Line down alias
  "k", // Line up alias
  "l", // Redraw / Clear
  "g", // File info
  "t", // Tag pop
  "m", // Return alias
  "q", // Visual block / command
]);

export function isVimOwnedCtrlChord(e: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  code?: string;
}): boolean {
  if (!e.ctrlKey || e.altKey || e.metaKey) {
    return false;
  }
  const key = e.key.toLowerCase();
  if (VIM_OWNED_CTRL_KEYS.has(key)) {
    return true;
  }
  if (e.code === "BracketLeft" || e.code === "BracketRight") {
    return true;
  }
  return false;
}
