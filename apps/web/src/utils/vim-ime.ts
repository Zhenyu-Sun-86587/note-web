import { EditorView } from "@codemirror/view";
import { getCM, Vim } from "@replit/codemirror-vim";
import { persistVimSession } from "./vim-session";
import { vimCompanion } from "./vim-companion";

export interface PendingKey {
  key: string;
  code?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface VimImeState {
  composing: boolean;
  suppressCommit: boolean;
  pendingPrintableKey: PendingKey | null;
}

export function createVimImeState(): VimImeState {
  return {
    composing: false,
    suppressCommit: false,
    pendingPrintableKey: null,
  };
}

export function isAsciiPrintable(str: string): boolean {
  if (str.length !== 1) return false;
  const code = str.charCodeAt(0);
  return code >= 0x20 && code <= 0x7e;
}

export const VIM_CTRL_KEYS = new Set([
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "[",
  "]",
]);

export function isVimCtrlChord(e: {
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
  if (VIM_CTRL_KEYS.has(key)) {
    return true;
  }
  if (e.code === "BracketLeft" || e.code === "BracketRight") {
    return true;
  }
  return false;
}

export function isNonPrintableOrControlKey(e: KeyboardEvent | {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  code?: string;
}): boolean {
  // Modifiers alone: ignore
  if (
    e.key === "Shift" ||
    e.key === "Control" ||
    e.key === "Alt" ||
    e.key === "Meta"
  ) {
    return false;
  }

  // Ctrl chords (e.g. Ctrl+R, Ctrl+F, Ctrl+B, Ctrl+D, Ctrl+U, Ctrl+[, Ctrl+C, etc.)
  if (isVimCtrlChord(e)) {
    return true;
  }

  switch (e.key) {
    case "Escape":
    case "Enter":
    case "Backspace":
    case "Delete":
    case "Tab":
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
    case "Home":
    case "End":
    case "PageUp":
    case "PageDown":
    case "Insert":
      return true;
    default:
      return false;
  }
}

export function forwardKeyToVim(
  view: EditorView,
  eventLike: {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  },
): boolean {
  const cm = getCM(view);
  if (!cm) return false;

  const mockEvent = {
    key: eventLike.key,
    code: eventLike.code || "",
    ctrlKey: Boolean(eventLike.ctrlKey),
    altKey: Boolean(eventLike.altKey),
    metaKey: Boolean(eventLike.metaKey),
    shiftKey: Boolean(eventLike.shiftKey),
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
      eventLike.preventDefault?.();
    },
    stopPropagation() {
      this.propagationStopped = true;
      eventLike.stopPropagation?.();
    },
  };

  const vimPlugin = (cm as any).state?.vimPlugin;
  let handled = false;
  if (vimPlugin && typeof vimPlugin.handleKey === "function") {
    handled = Boolean(vimPlugin.handleKey(mockEvent, view));
  } else {
    // Fallback direct to Vim.multiSelectHandleKey
    const vim = (cm as any).state?.vim;
    if (!vim) return false;
    const keyName = (Vim as any).vimKeyFromEvent(mockEvent, vim);
    if (!keyName) return false;
    handled = Boolean((Vim as any).multiSelectHandleKey(cm, keyName, "user"));
  }

  persistVimSession();
  return handled;
}

export function isVimDialogActive(_cm: any, view: EditorView): boolean {
  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
  ) {
    if (activeEl.classList.contains("note-web-vim-ime-proxy")) {
      return false;
    }
    if (
      activeEl.closest(".cm-vim-panel") ||
      activeEl.closest(".cm-dialog") ||
      activeEl.closest(".cm-panel")
    ) {
      return true;
    }
  }
  const dialogInput = view.dom.querySelector(
    ".cm-vim-panel input, .cm-dialog input, .cm-panel input",
  );
  if (dialogInput && dialogInput === activeEl) {
    return true;
  }
  return false;
}

export function updateProxyPosition(
  view: EditorView,
  proxyEl: HTMLTextAreaElement | null,
  containerEl: HTMLElement | null,
) {
  if (!proxyEl || !containerEl) return;
  try {
    const head = view.state.selection.main.head;
    const coords = view.coordsAtPos(head);
    if (coords) {
      const containerRect = containerEl.getBoundingClientRect();
      const top = Math.max(0, coords.top - containerRect.top);
      const left = Math.max(0, coords.left - containerRect.left);
      proxyEl.style.top = `${top}px`;
      proxyEl.style.left = `${left}px`;
      return;
    }
  } catch {
    // Ignore errors if coordinates cannot be computed
  }
  proxyEl.style.top = "0px";
  proxyEl.style.left = "0px";
}

export interface AttachProxyOptions {
  onSave?: () => void;
}

export function attachVimImeProxy(
  view: EditorView,
  proxyEl: HTMLTextAreaElement,
  _containerEl: HTMLElement,
  options: AttachProxyOptions = {},
) {
  const imeState = createVimImeState();
  const isMac =
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS X/i.test(navigator.userAgent);

  const handleKeyDown = (e: KeyboardEvent) => {
    // If currently composing in IME, ignore keydown in command layer
    if (imeState.composing) {
      return;
    }

    // Narrow fallback persist if recording macro q or Escape
    if (e.key === "q" || e.key === "Escape") {
      queueMicrotask(persistVimSession);
    }

    // App Save: Cmd+S on Mac, Ctrl+S elsewhere
    const isSave =
      (isMac ? e.metaKey : e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      e.key.toLowerCase() === "s";
    if (isSave) {
      e.preventDefault();
      e.stopPropagation();
      options.onSave?.();
      imeState.pendingPrintableKey = null;
      return;
    }

    // Non-printable or Ctrl chords: execute immediately with unconditional preventDefault / stopPropagation
    if (isNonPrintableOrControlKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      imeState.pendingPrintableKey = null;
      forwardKeyToVim(view, e);
      return;
    }

    const companionState = vimCompanion.getInputState();

    // 1. In normal-pending: ALL printable keys are blocked completely to prevent race conditions
    if (companionState === "normal-pending") {
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        isAsciiPrintable(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
      imeState.pendingPrintableKey = null;
      return;
    }

    // 2. In normal-ready: Native companion has verified target window is ASCII, forward directly
    if (companionState === "normal-ready") {
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        isAsciiPrintable(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        forwardKeyToVim(view, e);
      }
      imeState.pendingPrintableKey = null;
      return;
    }

    // 3. Fallback (unavailable / error): Safe web proxy verification via beforeinput
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      isAsciiPrintable(e.key)
    ) {
      imeState.pendingPrintableKey = {
        key: e.key,
        code: e.code,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      return;
    }

    // If Process or Unidentified or other IME key:
    if (e.key === "Process" || e.key === "Unidentified" || e.key === "Dead") {
      imeState.pendingPrintableKey = null;
      return;
    }

    imeState.pendingPrintableKey = null;
  };

  const handleCompositionStart = () => {
    imeState.composing = true;
    imeState.pendingPrintableKey = null;
  };

  const handleCompositionUpdate = () => {
    imeState.composing = true;
    imeState.pendingPrintableKey = null;
  };

  const handleCompositionEnd = () => {
    imeState.composing = false;
    imeState.suppressCommit = true;
    imeState.pendingPrintableKey = null;
    queueMicrotask(() => {
      if (proxyEl) {
        proxyEl.value = "";
      }
      imeState.suppressCommit = false;
    });
  };

  const handleBeforeInput = (e: InputEvent) => {
    // If currently composing or in trailing commit suppression:
    if (imeState.composing || imeState.suppressCommit) {
      e.preventDefault();
      return;
    }

    // If plain text input:
    if (e.inputType === "insertText" && typeof e.data === "string") {
      e.preventDefault();
      if (isAsciiPrintable(e.data)) {
        const keyToForward = e.data;
        const pending = imeState.pendingPrintableKey;
        const shiftKey =
          pending?.shiftKey ?? (keyToForward !== keyToForward.toLowerCase());
        forwardKeyToVim(view, {
          key: keyToForward,
          code: pending?.code,
          shiftKey,
          ctrlKey: Boolean(pending?.ctrlKey),
          altKey: Boolean(pending?.altKey),
          metaKey: Boolean(pending?.metaKey),
        });
      }
      imeState.pendingPrintableKey = null;
      if (proxyEl) {
        proxyEl.value = "";
      }
      return;
    }

    // Block all other text input outside Insert mode
    e.preventDefault();
    imeState.pendingPrintableKey = null;
    if (proxyEl) {
      proxyEl.value = "";
    }
  };

  const handleInput = () => {
    if (!imeState.composing && proxyEl) {
      proxyEl.value = "";
    }
  };

  proxyEl.addEventListener("keydown", handleKeyDown);
  proxyEl.addEventListener("compositionstart", handleCompositionStart);
  proxyEl.addEventListener("compositionupdate", handleCompositionUpdate);
  proxyEl.addEventListener("compositionend", handleCompositionEnd);
  proxyEl.addEventListener("beforeinput", handleBeforeInput as EventListener);
  proxyEl.addEventListener("input", handleInput);

  return {
    state: imeState,
    cleanup() {
      proxyEl.removeEventListener("keydown", handleKeyDown);
      proxyEl.removeEventListener("compositionstart", handleCompositionStart);
      proxyEl.removeEventListener("compositionupdate", handleCompositionUpdate);
      proxyEl.removeEventListener("compositionend", handleCompositionEnd);
      proxyEl.removeEventListener(
        "beforeinput",
        handleBeforeInput as EventListener,
      );
      proxyEl.removeEventListener("input", handleInput);
    },
  };
}
