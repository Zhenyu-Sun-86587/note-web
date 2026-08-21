import { describe, it, expect } from "vitest";
import {
  isAsciiPrintable,
  isNonPrintableOrControlKey,
  createVimImeState,
} from "../utils/vim-ime";

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
});
