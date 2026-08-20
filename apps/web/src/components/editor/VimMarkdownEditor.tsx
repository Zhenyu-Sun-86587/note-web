import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { EditorView, basicSetup } from "codemirror";
import { Transaction } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { vim, Vim } from "@replit/codemirror-vim";
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
        // App Save: Cmd+S on Mac, Ctrl+S elsewhere
        const isSave =
          (e.metaKey || e.ctrlKey) &&
          !e.shiftKey &&
          !e.altKey &&
          e.key.toLowerCase() === "s";
        if (isSave) {
          e.preventDefault();
          e.stopPropagation();
          onSaveRef.current?.();
          return true;
        }

        // Vim Control chords: ALWAYS e.ctrlKey (never metaKey / Mac Command)
        // Prevent conflicting browser shortcuts from hijacking Vim control chords.
        // Mac Command shortcuts (Cmd+R, Cmd+F, Cmd+W, Cmd+P, Cmd+Q) continue to be handled by the browser.
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

        return false;
      },
    });

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

  // Sync external changes (conflict reload / external reload) without polluting undo history
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      if (lastEmittedValueRef.current === value) {
        return;
      }
      lastEmittedValueRef.current = value;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [value]);

  return <div ref={containerRef} className="note-web-vim-editor" />;
});

VimMarkdownEditor.displayName = "VimMarkdownEditor";
