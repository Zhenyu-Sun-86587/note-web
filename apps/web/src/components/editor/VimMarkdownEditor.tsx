import {
  useState,
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
import { EditorState, Transaction, Compartment, Prec } from "@codemirror/state";
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
  forwardKeyToVim,
} from "../../utils/vim-ime";
import {
  isVimOwnedCtrlChord,
} from "../../utils/vim-keyboard";
import {
  vimCompanion,
  type VimNativeInputState,
} from "../../utils/vim-companion";
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
    vimCompanion.restoreTextInput();
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

    const [companionState, setCompanionState] = useState<VimNativeInputState>(
      vimCompanion.getInputState(),
    );

    // Keep active instance callbacks up to date
    useEffect(() => {
      activeVimInstance = {
        save: () => onSaveRef.current?.(),
        switchToIR: () => {
          vimCompanion.restoreTextInput();
          onSwitchToIRRef.current?.();
        },
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

    const syncFocus = () => {
      if (!viewRef.current) return;
      const view = viewRef.current;
      const currentCm = getCM(view);
      const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
      const isDialog = isVimDialogActive(currentCm, view);
      const compState = vimCompanion.getInputState();

      if (isInsertOrReplace) {
        proxyRef.current?.blur();
        if (document.activeElement !== view.contentDOM) {
          view.focus();
        }
        return;
      }

      if (isDialog) {
        return;
      }

      // Normal / Visual mode:
      if (compState === "normal-ready") {
        proxyRef.current?.blur();
        if (document.activeElement !== view.contentDOM) {
          view.focus();
        }
      } else {
        proxyRef.current?.focus();
        updateProxyPosition(view, proxyRef.current, containerRef.current);
      }
    };

    const updateEditableState = () => {
      if (!viewRef.current) return;
      const currentCm = getCM(viewRef.current);
      const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
      const compState = vimCompanion.getInputState();
      const shouldBeEditable = isInsertOrReplace || compState === "normal-ready";

      viewRef.current.dispatch({
        effects: vimEditableCompartment.reconfigure(
          EditorView.editable.of(shouldBeEditable),
        ),
      });
    };

    // Subscribe to Companion state changes to immediately route focus when ASCII ready
    useEffect(() => {
      return vimCompanion.subscribe(() => {
        const nextState = vimCompanion.getInputState();
        setCompanionState(nextState);
        updateEditableState();
        syncFocus();
      });
    }, []);

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
          syncFocus();
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

      let wasDialogActive = false;

      const syncVimDialogState = () => {
        if (!viewRef.current) return;
        const currentCm = getCM(viewRef.current);
        const isDialog = isVimDialogActive(currentCm, viewRef.current);
        const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);

        if (!wasDialogActive && isDialog) {
          wasDialogActive = true;
          vimCompanion.restoreTextInput();
        } else if (wasDialogActive && !isDialog) {
          wasDialogActive = false;
          if (!isInsertOrReplace) {
            vimCompanion.switchToCommandInput();
            updateEditableState();
            syncFocus();
          }
        }
      };

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.viewportChanged) {
          const compState = vimCompanion.getInputState();
          if (compState !== "normal-ready") {
            updateProxyPosition(
              update.view,
              proxyRef.current,
              containerRef.current,
            );
          }
        }
        if (update.docChanged) {
          const docString = update.state.doc.toString();
          lastEmittedValueRef.current = docString;
          onChangeRef.current(docString);
        }
        syncVimDialogState();
      });

      // DOM event handlers for CodeMirror (Prec.highest ensures Vim Ctrl chords are unconditionally prevented from leaking to browser)
      const vimDomHandlers = Prec.highest(
        EditorView.domEventHandlers({
          focus: (_e, view) => {
            const currentCm = getCM(view);
            const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
            const compState = vimCompanion.getInputState();
            if (
              !isInsertOrReplace &&
              !isVimDialogActive(currentCm, view) &&
              compState !== "normal-ready"
            ) {
              proxyRef.current?.focus();
              updateProxyPosition(view, proxyRef.current, containerRef.current);
            }
            return false;
          },
          click: (_e, view) => {
            const currentCm = getCM(view);
            const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
            const compState = vimCompanion.getInputState();
            if (
              !isInsertOrReplace &&
              !isVimDialogActive(currentCm, view) &&
              compState !== "normal-ready"
            ) {
              proxyRef.current?.focus();
              updateProxyPosition(view, proxyRef.current, containerRef.current);
            }
            return false;
          },
          keydown: (e, view) => {
            if (e.key === "q" || e.key === "Escape") {
              queueMicrotask(persistVimSession);
            }

            const currentCm = getCM(view);
            const isInsert = Boolean(currentCm?.state?.vim?.insertMode);
            const isDialog = isVimDialogActive(currentCm, view);

            // In NORMAL or VISUAL mode: Unconditionally intercept Vim-owned Ctrl chords
            // (Ctrl+R Redo, Ctrl+F PageDown, Ctrl+B PageUp, Ctrl+D/U HalfPage, Ctrl+W, etc.)
            // so browser never intercepts with page refresh, find, bookmarks, or closing tab.
            if (!isInsert && !isDialog && isVimOwnedCtrlChord(e)) {
              e.preventDefault();
              e.stopPropagation();
              forwardKeyToVim(view, e);
              return true;
            }

            return false;
          },
        }),
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

      const initialCompState = vimCompanion.getInputState();
      const initialEditable = initialCompState === "normal-ready";

      const view = new EditorView({
        doc: value,
        extensions: [
          vimEditableCompartment.of(EditorView.editable.of(initialEditable)),
          vimDomHandlers,
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
        if (isInsertOrReplace) {
          vimCompanion.restoreTextInput();
        } else {
          vimCompanion.switchToCommandInput();
        }

        updateEditableState();
        syncFocus();
      };
      (cm as any)?.on?.("vim-mode-change", handleModeChange);

      // On initial mount, switch to command input if in normal mode
      const initialIsInsert = Boolean(cm?.state?.vim?.insertMode);
      if (initialIsInsert) {
        vimCompanion.restoreTextInput();
      } else {
        vimCompanion.switchToCommandInput();
      }

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
        syncVimDialogState();
        const currentCm = getCM(view);
        const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
        const compState = vimCompanion.getInputState();
        if (
          !isInsertOrReplace &&
          !isVimDialogActive(currentCm, view) &&
          compState !== "normal-ready"
        ) {
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

      const handleFocusOut = () => {
        queueMicrotask(syncVimDialogState);
      };
      document.addEventListener("focusout", handleFocusOut);

      const panelObserver = new MutationObserver(() => {
        syncVimDialogState();
      });
      panelObserver.observe(view.dom, { childList: true, subtree: true });

      const handleVisibilityOrFocus = () => {
        if (document.visibilityState === "visible") {
          if (!viewRef.current) return;
          const currentCm = getCM(viewRef.current);
          const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
          const isDialog = isVimDialogActive(currentCm, viewRef.current);
          if (!isInsertOrReplace && !isDialog) {
            vimCompanion.switchToCommandInput();
          }
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityOrFocus);
      window.addEventListener("focus", handleVisibilityOrFocus);

      queueMicrotask(() => {
        updateEditableState();
        syncFocus();
      });

      return () => {
        vimCompanion.restoreTextInput();
        document.removeEventListener("focusin", handleFocusIn);
        document.removeEventListener("focusout", handleFocusOut);
        document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
        window.removeEventListener("focus", handleVisibilityOrFocus);
        panelObserver.disconnect();
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

    const refocusIfFallback = () => {
      const view = viewRef.current;
      if (!view) return;
      const currentCm = getCM(view);
      const isInsertOrReplace = Boolean(currentCm?.state?.vim?.insertMode);
      const isDialog = isVimDialogActive(currentCm, view);
      const compState = vimCompanion.getInputState();
      if (!isInsertOrReplace && !isDialog && compState !== "normal-ready") {
        proxyRef.current?.focus();
        updateProxyPosition(
          view,
          proxyRef.current,
          containerRef.current,
        );
      }
    };

    const getCompanionStatusText = (state: VimNativeInputState) => {
      switch (state) {
        case "normal-ready":
          return "VIM · IME Auto";
        case "normal-pending":
          return "VIM · IME…";
        case "unavailable":
          return "VIM · IME Fallback";
        case "error":
          return "VIM · IME Error";
        default:
          return "VIM · IME Auto";
      }
    };

    return (
      <div
        ref={containerRef}
        className="note-web-vim-editor"
        onPointerDown={refocusIfFallback}
        onPointerUp={refocusIfFallback}
        onClick={refocusIfFallback}
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
        <div className="note-web-vim-ime-status" aria-live="polite">
          {getCompanionStatusText(companionState)}
        </div>
      </div>
    );
  },
);

VimMarkdownEditor.displayName = "VimMarkdownEditor";
