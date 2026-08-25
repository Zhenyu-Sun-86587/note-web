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

export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export type CustomShortcuts = Record<AppAction, ShortcutBinding>;

export const DEFAULT_APP_SHORTCUTS: CustomShortcuts = {
  save: { key: "s", ctrl: true, shift: true },
  "quick-open": { key: "p", ctrl: true, shift: true },
  "new-note": { key: "n", ctrl: true, shift: true },
  search: { key: "f", ctrl: true, shift: true },
  sidebar: { key: "b", ctrl: true, shift: true },
  settings: { key: ",", ctrl: true, shift: true },
  "toggle-outline": { key: "o", ctrl: true, alt: true },
  "toggle-vim-preview": { key: "v", ctrl: true, alt: true },
};

export const SHORTCUT_INFO: Record<
  AppAction,
  { label: string; description: string; defaultDesc: string }
> = {
  save: {
    label: "保存笔记",
    description: "立即保存当前笔记修改",
    defaultDesc: "Ctrl+Shift+S",
  },
  "quick-open": {
    label: "快速打开",
    description: "通过文件名快速查找并切换笔记",
    defaultDesc: "Ctrl+Shift+P",
  },
  "new-note": {
    label: "新建笔记",
    description: "在当前目录或根目录新建空白笔记",
    defaultDesc: "Ctrl+Shift+N",
  },
  search: {
    label: "全局搜索",
    description: "搜索所有笔记的文件名与全文内容",
    defaultDesc: "Ctrl+Shift+F",
  },
  sidebar: {
    label: "切换侧边栏",
    description: "显示或隐藏文件导航侧边栏",
    defaultDesc: "Ctrl+Shift+B",
  },
  settings: {
    label: "偏好设置",
    description: "打开系统与编辑器偏好设置",
    defaultDesc: "Ctrl+Shift+,",
  },
  "toggle-outline": {
    label: "切换大纲",
    description: "展开或收起 Markdown 大纲面板",
    defaultDesc: "Ctrl+Alt+O",
  },
  "toggle-vim-preview": {
    label: "切换 Vim 预览",
    description: "在 Vim 模式下开启或关闭分栏实时预览",
    defaultDesc: "Ctrl+Alt+V",
  },
};

/**
 * Formats a ShortcutBinding into a human-readable display string.
 */
export function formatShortcutBinding(
  binding: ShortcutBinding,
  isMac?: boolean,
): string {
  const isMacPlatform =
    isMac ??
    (typeof navigator !== "undefined" &&
      /Macintosh|Mac OS X/i.test(navigator.userAgent));

  const parts: string[] = [];
  if (binding.ctrl) {
    parts.push(isMacPlatform ? "Cmd" : "Ctrl");
  }
  if (binding.alt) {
    parts.push(isMacPlatform ? "Option" : "Alt");
  }
  if (binding.shift) {
    parts.push("Shift");
  }

  let keyDisplay = binding.key;
  if (keyDisplay.length === 1) {
    keyDisplay = keyDisplay.toUpperCase();
  } else if (keyDisplay.startsWith("arrow")) {
    keyDisplay = keyDisplay.slice(5).toUpperCase();
  } else {
    keyDisplay = keyDisplay.charAt(0).toUpperCase() + keyDisplay.slice(1);
  }
  parts.push(keyDisplay);

  return parts.join("+");
}

/**
 * Checks if a keyboard event matches a Note Web App-owned shortcut.
 */
export function isAppOwnedShortcut(
  e:
    | KeyboardEvent
    | {
        key: string;
        ctrlKey?: boolean;
        metaKey?: boolean;
        shiftKey?: boolean;
        altKey?: boolean;
        code?: string;
      },
  customShortcuts?: Partial<CustomShortcuts>,
): AppAction | null {
  const isMac =
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mod = isMac ? Boolean(e.metaKey || e.ctrlKey) : Boolean(e.ctrlKey);

  const shortcuts: CustomShortcuts = {
    ...DEFAULT_APP_SHORTCUTS,
    ...customShortcuts,
  } as CustomShortcuts;

  const eventKey = (e.key || "").toLowerCase();
  const eventCode = (e as KeyboardEvent).code;
  const isShift = Boolean(e.shiftKey);
  const isAlt = Boolean(e.altKey);

  for (const [action, binding] of Object.entries(shortcuts) as [
    AppAction,
    ShortcutBinding,
  ][]) {
    if (!binding) continue;

    const reqMod = Boolean(binding.ctrl);
    const reqShift = Boolean(binding.shift);
    const reqAlt = Boolean(binding.alt);

    if (mod !== reqMod) continue;
    if (isShift !== reqShift) continue;
    if (isAlt !== reqAlt) continue;

    const targetKey = binding.key.toLowerCase();
    if (
      targetKey === "," &&
      (eventKey === "," || eventKey === "<" || eventCode === "Comma")
    ) {
      return action;
    }
    if (eventKey === targetKey) {
      return action;
    }
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
