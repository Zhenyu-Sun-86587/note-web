import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vim, Vim, getCM } from "@replit/codemirror-vim";
import type { EditorHandle } from "./EditorHandle";
import "../../styles/vim-editor.css";

export interface VimMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onSwitchToIR?: () => void;
  onToggleZen?: () => void;
  theme?: "light" | "dark";
}

// Global active instance tracker for Ex commands
let activeVimInstance: {
  save?: () => void;
  switchToIR?: () => void;
  toggleZen?: () => void;
} | null = null;

let exCommandsRegistered = false;

function ensureExCommands() {
  if (exCommandsRegistered) return;
  exCommandsRegistered = true;

  Vim.defineEx("write", "w", () => {
    activeVimInstance?.save?.();
  });

  Vim.defineEx("ir", "", () => {
    activeVimInstance?.switchToIR?.();
  });

  Vim.defineEx("zen", "", () => {
    activeVimInstance?.toggleZen?.();
  });
}

export const VimMarkdownEditor = forwardRef<
  EditorHandle,
  VimMarkdownEditorProps
>(({ value, onChange, onSave, onSwitchToIR, onToggleZen }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastEmittedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onSwitchToIRRef = useRef(onSwitchToIR);
  onSwitchToIRRef.current = onSwitchToIR;
  const onToggleZenRef = useRef(onToggleZen);
  onToggleZenRef.current = onToggleZen;

  // Keep active instance callbacks up to date
  useEffect(() => {
    activeVimInstance = {
      save: () => onSaveRef.current?.(),
      switchToIR: () => onSwitchToIRRef.current?.(),
      toggleZen: () => onToggleZenRef.current?.(),
    };
  });

  // Expose imperative handle
  useImperativeHandle(
    ref,
    () => ({
      getValue: () => {
        if (viewRef.current) {
          try {
            return viewRef.current.state.doc.toString();
          } catch {
            return lastEmittedValueRef.current;
          }
        }
        return lastEmittedValueRef.current;
      },
      focus: () => {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  // Initialize CodeMirror 6 EditorView with Vim
  useEffect(() => {
    ensureExCommands();
    if (!containerRef.current) return;

    lastEmittedValueRef.current = value;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const docString = update.state.doc.toString();
        lastEmittedValueRef.current = docString;
        onChangeRef.current(docString);
      }
    });

    // 1. Intercept Ctrl shortcuts to prevent browser hijacking (e.g. Ctrl+R reload, Ctrl+P print, Ctrl+F find, etc.)
    const vimKeyInterceptor = EditorView.domEventHandlers({
      keydown: (e, _view) => {
        const isMac =
          typeof navigator !== "undefined" &&
          navigator.platform.toUpperCase().includes("MAC");
        const mod = isMac ? e.metaKey : e.ctrlKey;

        // Save: Ctrl/Cmd + S
        if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          onSaveRef.current?.();
          return true;
        }

        // Take over conflicting browser shortcuts so Vim handles them without browser interference
        if (mod && !e.altKey) {
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

        return false;
      },
    });

    // 2. Guard normal mode against arbitrary direct text insertions without entering insert mode
    const normalModeInputGuard = EditorView.inputHandler.of(
      (view, _from, _to, text) => {
        const cm = getCM(view);
        const vimState = cm?.state?.vim;
        if (vimState && !vimState.insertMode && !cm?.curOp?.isVimOp) {
          if (text === "\0\0") return true;
          return true; // Block unhandled text insertions in normal/visual mode
        }
        return false;
      },
    );

    const themeExtension = EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "var(--app-bg)",
        color: "var(--text-primary)",
      },
      ".cm-content": {
        caretColor: "var(--accent)",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--accent)",
      },
      "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--selection-bg, rgba(74, 144, 226, 0.25))",
      },
      ".cm-gutters": {
        backgroundColor: "var(--panel-bg)",
        color: "var(--text-muted)",
        borderRight: "1px solid var(--border-color)",
      },
    });

    const view = new EditorView({
      doc: value,
      extensions: [
        vimKeyInterceptor,
        normalModeInputGuard,
        vim({ status: true }),
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        updateListener,
        themeExtension,
      ],
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Mounted once per note/mode switch

  // Sync external changes (conflict reload / external reload)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc && value !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = value;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="note-web-vim-editor" />;
});

VimMarkdownEditor.displayName = "VimMarkdownEditor";
