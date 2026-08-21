/**
 * Note Web Application Shortcuts
 *
 * App-level shortcuts use Ctrl+Alt (or Cmd+Alt on macOS) to avoid collisions with
 * browser defaults (Edge/Chrome) and Vim standard commands.
 */
export const NOTE_WEB_APP_SHORTCUTS = [
  { key: "s", ctrl: true, alt: true, desc: "Save note (Ctrl+Alt+S)" },
  { key: "p", ctrl: true, alt: true, desc: "Quick Open (Ctrl+Alt+P)" },
  { key: "n", ctrl: true, alt: true, desc: "New note (Ctrl+Alt+N)" },
  { key: "f", ctrl: true, alt: true, desc: "Global search (Ctrl+Alt+F)" },
  { key: "b", ctrl: true, alt: true, desc: "Toggle sidebar (Ctrl+Alt+B)" },
  { key: ",", ctrl: true, alt: true, desc: "Settings (Ctrl+Alt+,)" },
] as const;

export type AppAction =
  | "save"
  | "quick-open"
  | "new-note"
  | "settings"
  | "search"
  | "sidebar";

/**
 * Checks if a keyboard event matches a Note Web App-owned shortcut (Ctrl+Alt+...).
 */
export function isAppOwnedShortcut(e: KeyboardEvent | {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): AppAction | null {
  const isMac =
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mod = isMac ? (e.metaKey || e.ctrlKey) : e.ctrlKey;

  // App shortcuts strictly require Ctrl (or Cmd on Mac) + Alt
  if (!mod || !e.altKey) {
    return null;
  }

  const key = e.key.toLowerCase();
  if (key === "s") return "save";
  if (key === "p") return "quick-open";
  if (key === "n") return "new-note";
  if (key === "f") return "search";
  if (key === "b") return "sidebar";
  if (key === ",") return "settings";

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
