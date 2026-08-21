import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { EditorState, Transaction, Compartment } from "@codemirror/state";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import {
  history,
  defaultKeymap,
  historyKeymap,
} from "@codemirror/commands";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  highlightSelectionMatches,
  searchKeymap,
} from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { vim, Vim, getCM } from "@replit/codemirror-vim";
import type { EditorHandle } from "./EditorHandle";
import {
  restoreVimSessionOnce,
  persistVimSession,
} from "../../utils/vim-session";
import {
  attachVimImeProxy,
  updateProxyPosition,
  isVimDialogActive,
  isNonPrintableOrControlKey,
  isAsciiPrintable,
  forwardKeyToVim,
} from "../../utils/vim-ime";
import "../../styles/vim-editor.css";

export interface VimMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onSwitchToIR?: () => void;
  onToggleZen?: () => void;
  theme?: "light" | "dark";
  vimRelativeLineNumbers?: boolean;
  vimLineWrapping?: boolean;
  vimJjEscape?: boolean;
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

class NumberMarker extends GutterMarker {
  constructor(readonly number: string) {
    super();
  }
  eq(other: NumberMarker) {
    return this.number === other.number;
  }
  toDOM() {
    return document.createTextNode(this.number);
  }
}

function createLineNumberGutter(relative: boolean) {
  return gutter({
    class: "cm-lineNumbers",
    renderEmptyElements: false,
    lineMarker(view, line) {
      const lineNo = view.state.doc.lineAt(line.from).number;
      if (!relative) {
        return new NumberMarker(String(lineNo));
      }
      const currentLine = view.state.doc.lineAt(
        view.state.selection.main.head,
      ).number;
      const text =
        lineNo === currentLine
          ? String(lineNo)
          : String(Math.abs(lineNo - currentLine));
      return new NumberMarker(text);
    },
    lineMarkerChange(update) {
      return update.docChanged || update.selectionSet;
    },
    initialSpacer(view) {
      return new NumberMarker(String(view.state.doc.lines));
    },
    updateSpacer(spacer, update) {
      const lines = update.view.state.doc.lines;
      const str = String(lines);
      return (spacer as NumberMarker).number === str
        ? spacer
        : new NumberMarker(str);
    },
  });
}

export const VimMarkdownEditor = forwardRef<
  EditorHandle,
  VimMarkdownEditorProps
>(
  (
    {
      value,
      onChange,
      onSave,
      onSwitchToIR,
      onToggleZen,
      vimRelativeLineNumbers = true,
      vimLineWrapping = true,
      vimJjEscape = false,
    },
    ref,
  ) => {
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

    const lineNumberCompartment = useRef(new Compartment()).current;
    const lineWrappingCompartment = useRef(new Compartment()).current;
    const vimEditableCompartment = useRef(new Compartment()).current;
    const proxyRef = useRef<HTMLTextAreaElement>(null);

    // Keep active instance callbacks up to date
    useEffect(() => {
      activeVimInstance = {
        save: () => onSaveRef.current?.(),
        switchToIR: () => onSwitchToIRRef.current?.(),
        toggleZen: () => onToggleZenRef.current?.(),
      };
    });

    // Handle jj -> Esc mapping setting
    useEffect(() => {
      try {
        Vim.unmap("jj", "insert");
      } catch {}
      if (vimJjEscape) {
        Vim.map("jj", "<Esc>", "insert");
      }
      return () => {
        try {
          Vim.unmap("jj", "insert");
        } catch {}
      };
    }, [vimJjEscape]);

    // Handle dynamic relative line numbers setting change
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: lineNumberCompartment.reconfigure(
          createLineNumberGutter(Boolean(vimRelativeLineNumbers)),
        ),
      });
    }, [vimRelativeLineNumbers, lineNumberCompartment]);

    // Handle dynamic line wrapping setting change
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: lineWrappingCompartment.reconfigure(
          vimLineWrapping ? EditorView.lineWrapping : [],
        ),
      });
    }, [vimLineWrapping, lineWrappingCompartment]);

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
          const currentCm = viewRef.current ? getCM(viewRef.current) : null;
          const isInsert = Boolean(currentCm?.state?.vim?.insertMode);
          if (
            isInsert ||
            (viewRef.current && isVimDialogActive(currentCm, viewRef.current))
          ) {
            viewRef.current?.focus();
          } else {
            proxyRef.current?.focus();
          }
        },
      }),
      [],
    );

    // Initialize CodeMirror 6 EditorView with Vim
    useEffect(() => {
      restoreVimSessionOnce();
      ensureExCommands();
      if (!containerRef.current) return;

      lastEmittedValueRef.current = value;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.viewportChanged) {
          updateProxyPosition(
            update.view,
            proxyRef.current,
            containerRef.current,
          );
        }
        if (update.docChanged) {
          const docString = update.state.doc.toString();
          lastEmittedValueRef.current = docString;
          onChangeRef.current(docString);
        }
      });

      // 1. Intercept Ctrl shortcuts and maintain proxy focus in NORMAL/VISUAL mode
      const vimKeyInterceptor = EditorView.domEventHandlers({
        focus: (_e, view) => {
          const currentCm = getCM(view);
          const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
          if (!isInsertOrReplace && !isVimDialogActive(currentCm, view)) {
            proxyRef.current?.focus();
            updateProxyPosition(view, proxyRef.current, containerRef.current);
          }
          return false;
        },
        click: (_e, view) => {
          const currentCm = getCM(view);
          const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
          if (!isInsertOrReplace && !isVimDialogActive(currentCm, view)) {
            proxyRef.current?.focus();
            updateProxyPosition(view, proxyRef.current, containerRef.current);
          }
          return false;
        },
        keydown: (e, _view) => {
          // Narrow fallback persist if recording macro q or Escape
          if (e.key === "q" || e.key === "Escape") {
            queueMicrotask(persistVimSession);
          }

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

      const baseExtensions = [
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
      ];

      const view = new EditorView({
        doc: value,
        extensions: [
          vimEditableCompartment.of(EditorView.editable.of(false)),
          vimKeyInterceptor,
          vim({ status: true }),
          lineNumberCompartment.of(
            createLineNumberGutter(Boolean(vimRelativeLineNumbers)),
          ),
          lineWrappingCompartment.of(
            vimLineWrapping ? EditorView.lineWrapping : [],
          ),
          baseExtensions,
          markdown(),
          updateListener,
          themeExtension,
        ],
        parent: containerRef.current,
      });

      viewRef.current = view;

      const cm = getCM(view);
      const persistAfterVimCommand = () => {
        persistVimSession();
      };
      (cm as any)?.on?.("vim-command-done", persistAfterVimCommand);
      (cm as any)?.on?.("vim-keypress", persistAfterVimCommand);

      const handleModeChange = (e: { mode: string; subMode?: string }) => {
        const globalState = (Vim as any).getVimGlobalState_?.();
        const isPlayingMacro = Boolean(globalState?.macroModeState?.isPlaying);
        if (isPlayingMacro) {
          return;
        }
        const isInsertOrReplace = e.mode === "insert" || e.mode === "replace";
        queueMicrotask(() => {
          if (!viewRef.current) return;
          view.dispatch({
            effects: vimEditableCompartment.reconfigure(
              EditorView.editable.of(isInsertOrReplace),
            ),
          });
          if (isInsertOrReplace) {
            proxyRef.current?.blur();
            view.focus();
          } else {
            const currentCm = getCM(view);
            if (!isVimDialogActive(currentCm, view)) {
              proxyRef.current?.focus();
              updateProxyPosition(view, proxyRef.current, containerRef.current);
            }
          }
        });
      };
      (cm as any)?.on?.("vim-mode-change", handleModeChange);

      let proxyCleanup: (() => void) | undefined;
      if (proxyRef.current && containerRef.current) {
        const attached = attachVimImeProxy(
          view,
          proxyRef.current,
          containerRef.current,
          {
            onSave: () => onSaveRef.current?.(),
          },
        );
        proxyCleanup = attached.cleanup;
      }

      const handleFocusIn = (e: FocusEvent) => {
        const currentCm = getCM(view);
        const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
        if (!isInsertOrReplace && !isVimDialogActive(currentCm, view)) {
          if (
            e.target === document.body ||
            e.target === view.dom ||
            (e.target as HTMLElement)?.classList?.contains("cm-content") ||
            (e.target as HTMLElement)?.classList?.contains("cm-editor") ||
            (e.target as HTMLElement)?.classList?.contains("note-web-vim-editor")
          ) {
            proxyRef.current?.focus();
            updateProxyPosition(view, proxyRef.current, containerRef.current);
          }
        }
      };
      document.addEventListener("focusin", handleFocusIn);

      const handleWindowKeyDown = (e: KeyboardEvent) => {
        if (e.target === proxyRef.current) return;
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === "INPUT" ||
            (target.tagName === "TEXTAREA" &&
              !target.classList.contains("note-web-vim-ime-proxy")))
        ) {
          return;
        }
        const currentCm = getCM(view);
        const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
        if (!isInsertOrReplace && !isVimDialogActive(currentCm, view)) {
          proxyRef.current?.focus();
          updateProxyPosition(view, proxyRef.current, containerRef.current);
          if (
            isNonPrintableOrControlKey(e) ||
            (e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              isAsciiPrintable(e.key))
          ) {
            e.preventDefault();
            e.stopPropagation();
            forwardKeyToVim(view, e);
          }
        }
      };
      window.addEventListener("keydown", handleWindowKeyDown, true);

      queueMicrotask(() => {
        proxyRef.current?.focus();
        updateProxyPosition(view, proxyRef.current, containerRef.current);
      });

      return () => {
        window.removeEventListener("keydown", handleWindowKeyDown, true);
        document.removeEventListener("focusin", handleFocusIn);
        proxyCleanup?.();
        (cm as any)?.off?.("vim-mode-change", handleModeChange);
        (cm as any)?.off?.("vim-command-done", persistAfterVimCommand);
        (cm as any)?.off?.("vim-keypress", persistAfterVimCommand);
        persistVimSession();
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

    const refocusProxyIfNormal = () => {
      const currentCm = viewRef.current ? getCM(viewRef.current) : null;
      const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
      if (
        !isInsertOrReplace &&
        viewRef.current &&
        !isVimDialogActive(currentCm, viewRef.current)
      ) {
        proxyRef.current?.focus();
        updateProxyPosition(
          viewRef.current,
          proxyRef.current,
          containerRef.current,
        );
      }
    };

    return (
      <div
        ref={containerRef}
        className="note-web-vim-editor"
        onPointerDown={refocusProxyIfNormal}
        onPointerUp={refocusProxyIfNormal}
        onClick={refocusProxyIfNormal}
      >
        <textarea
          ref={proxyRef}
          className="note-web-vim-ime-proxy"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    );
  },
);

VimMarkdownEditor.displayName = "VimMarkdownEditor";
