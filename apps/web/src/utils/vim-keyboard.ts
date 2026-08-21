/**
 * Note Web Application Shortcuts
 *
 * App-level shortcuts use Ctrl+Shift (or Cmd+Shift on macOS) to avoid collisions with
 * browser defaults (Edge/Chrome) and Vim standard commands.
 */
export const NOTE_WEB_APP_SHORTCUTS = [
  { key: "s", ctrl: true, shift: true, desc: "Save note (Ctrl+Shift+S)" },
  { key: "p", ctrl: true, shift: true, desc: "Quick Open (Ctrl+Shift+P)" },
  { key: "n", ctrl: true, shift: true, desc: "New note (Ctrl+Shift+N)" },
  { key: "f", ctrl: true, shift: true, desc: "Global search (Ctrl+Shift+F)" },
  { key: "b", ctrl: true, shift: true, desc: "Toggle sidebar (Ctrl+Shift+B)" },
  { key: ",", ctrl: true, shift: true, desc: "Settings (Ctrl+Shift+,)" },
  { key: "o", ctrl: true, alt: true, desc: "Toggle outline (Ctrl+Alt+O)" },
  { key: "v", ctrl: true, alt: true, desc: "Toggle Vim preview (Ctrl+Alt+V)" },
] as const;

export type AppAction =
  | "save"
  | "quick-open"
  | "new-note"
  | "settings"
  | "search"
  | "sidebar"
  | "toggle-outline"
  | "toggle-vim-preview";

/**
 * Checks if a keyboard event matches a Note Web App-owned shortcut.
 */
export function isAppOwnedShortcut(e: KeyboardEvent | {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  code?: string;
}): AppAction | null {
  const isMac =
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mod = isMac ? (e.metaKey || e.ctrlKey) : e.ctrlKey;

  if (!mod) {
    return null;
  }

  const key = e.key.toLowerCase();

  // App shortcuts with Ctrl/Cmd + Shift (no Alt)
  if (e.shiftKey && !e.altKey) {
    if (key === "s") return "save";
    if (key === "p") return "quick-open";
    if (key === "n") return "new-note";
    if (key === "f") return "search";
    if (key === "b") return "sidebar";
    if (key === "," || key === "<" || e.code === "Comma") return "settings";
  }

  // Safe App shortcuts with Ctrl/Cmd + Alt (no Shift)
  if (e.altKey && !e.shiftKey) {
    if (key === "o") return "toggle-outline";
    if (key === "v") return "toggle-vim-preview";
  }

  return null;
}

/**
 * Standard Vim Ctrl keys in Normal/Visual mode.
 */
export const VIM_OWNED_CTRL_KEYS = new Set([
  "r", // Redo
  "f", // Page Down
  "b", // Page Up
  "d", // Half Page Down
  "u", // Half Page Up
  "o", // Jump older
  "i", // Jump newer
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

/**
 * Checks if an event is a Vim-owned standard Ctrl chord (without Alt).
 */
export function isVimOwnedCtrlChord(e: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  code?: string;
}): boolean {
  if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
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
