import { describe, it, expect, vi } from "vitest";
import {
  isAsciiPrintable,
  isNonPrintableOrControlKey,
  createVimImeState,
  attachVimImeProxy,
} from "../utils/vim-ime";
import { isVimOwnedCtrlChord, isAppOwnedShortcut } from "../utils/vim-keyboard";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { vim } from "@replit/codemirror-vim";

describe("Vim IME Isolation Utilities", () => {
  describe("isAsciiPrintable", () => {
    it("recognizes single ASCII printable characters", () => {
      expect(isAsciiPrintable("a")).toBe(true);
      expect(isAsciiPrintable("Z")).toBe(true);
      expect(isAsciiPrintable("0")).toBe(true);
      expect(isAsciiPrintable(" ")).toBe(true);
      expect(isAsciiPrintable(":")).toBe(true);
      expect(isAsciiPrintable("/")).toBe(true);
      expect(isAsciiPrintable("~")).toBe(true);
    });

    it("rejects non-ASCII, multi-character, or empty strings", () => {
      expect(isAsciiPrintable("中")).toBe(false);
      expect(isAsciiPrintable("你好")).toBe(false);
      expect(isAsciiPrintable("nihao")).toBe(false);
      expect(isAsciiPrintable("")).toBe(false);
      expect(isAsciiPrintable("\n")).toBe(false);
      expect(isAsciiPrintable("\t")).toBe(false);
    });
  });

  describe("isVimCtrlChord / isVimOwnedCtrlChord", () => {
    it("recognizes all specified Vim Ctrl chords", () => {
      const vimChords = [
        "r", "f", "b", "d", "u", "w", "a", "e", "y", "v",
        "[", "]", "c", "h", "j", "k", "l", "g", "t", "i", "m", "q",
        "o", "x",
      ];

      for (const key of vimChords) {
        expect(isVimOwnedCtrlChord({ key, ctrlKey: true })).toBe(true);
        expect(isVimOwnedCtrlChord({ key: key.toUpperCase(), ctrlKey: true })).toBe(true);
      }

      expect(isVimOwnedCtrlChord({ key: "[", code: "BracketLeft", ctrlKey: true })).toBe(true);
      expect(isVimOwnedCtrlChord({ key: "]", code: "BracketRight", ctrlKey: true })).toBe(true);
    });

    it("does not treat App-owned shortcuts (Ctrl+S, Ctrl+P, Ctrl+N) as generic Vim Ctrl chords", () => {
      expect(isAppOwnedShortcut({ key: "s", ctrlKey: true })).toBe("save");
      expect(isAppOwnedShortcut({ key: "p", ctrlKey: true })).toBe("quick-open");
      expect(isAppOwnedShortcut({ key: "n", ctrlKey: true })).toBe("new-note");
    });
  });

  describe("isNonPrintableOrControlKey", () => {
    it("recognizes navigation and control keys", () => {
      const makeEvent = (key: string, ctrl = false) =>
        ({
          key,
          ctrlKey: ctrl,
          altKey: false,
          metaKey: false,
        }) as KeyboardEvent;

      expect(isNonPrintableOrControlKey(makeEvent("Escape"))).toBe(true);
      expect(isNonPrintableOrControlKey(makeEvent("Enter"))).toBe(true);
      expect(isNonPrintableOrControlKey(makeEvent("Backspace"))).toBe(true);
      expect(isNonPrintableOrControlKey(makeEvent("Delete"))).toBe(true);
      expect(isNonPrintableOrControlKey(makeEvent("ArrowDown"))).toBe(true);
      expect(isNonPrintableOrControlKey(makeEvent("r", true))).toBe(true); // Ctrl+R
      expect(isNonPrintableOrControlKey(makeEvent("f", true))).toBe(true); // Ctrl+F
      expect(isNonPrintableOrControlKey(makeEvent("b", true))).toBe(true); // Ctrl+B
      expect(isNonPrintableOrControlKey(makeEvent("d", true))).toBe(true); // Ctrl+D
      expect(isNonPrintableOrControlKey(makeEvent("u", true))).toBe(true); // Ctrl+U
    });

    it("does not treat plain printable keys as non-printable or control keys", () => {
      const makeEvent = (key: string) =>
        ({
          key,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
        }) as KeyboardEvent;

      expect(isNonPrintableOrControlKey(makeEvent("i"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("a"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("o"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("h"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("j"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("k"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("l"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("G"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent(":"))).toBe(false);
      expect(isNonPrintableOrControlKey(makeEvent("/"))).toBe(false);
    });
  });

  describe("createVimImeState", () => {
    it("creates initial clean state", () => {
      const state = createVimImeState();
      expect(state.composing).toBe(false);
      expect(state.suppressCommit).toBe(false);
      expect(state.pendingPrintableKey).toBeNull();
    });
  });

  describe("attachVimImeProxy fallback interception", () => {
    it("prevents default and stops propagation for Vim-owned Ctrl chords in fallback mode", () => {
      const container = document.createElement("div");
      const textarea = document.createElement("textarea");
      container.appendChild(textarea);
      document.body.appendChild(container);

      const view = new EditorView({
        state: EditorState.create({
          doc: "Initial line 1\nInitial line 2\nInitial line 3",
          extensions: [vim()],
        }),
        parent: container,
      });

      const onSave = vi.fn();
      const proxy = attachVimImeProxy(view, textarea, container, { onSave });

      const vimKeys = ["r", "f", "d", "u", "b", "w"];
      for (const k of vimKeys) {
        let prevented = false;
        let stopped = false;
        const event = new KeyboardEvent("keydown", {
          key: k,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        event.preventDefault = () => {
          prevented = true;
        };
        event.stopPropagation = () => {
          stopped = true;
        };

        textarea.dispatchEvent(event);
        expect(prevented).toBe(true);
        expect(stopped).toBe(true);
      }

      // Test Ctrl+S triggers onSave
      let savePrevented = false;
      const saveEvent = new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      saveEvent.preventDefault = () => {
        savePrevented = true;
      };
      textarea.dispatchEvent(saveEvent);
      expect(savePrevented).toBe(true);
      expect(onSave).toHaveBeenCalledTimes(1);

      proxy.cleanup();
      view.destroy();
      container.remove();
    });
  });
});
