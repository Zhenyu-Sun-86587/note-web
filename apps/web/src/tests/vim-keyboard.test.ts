import { describe, it, expect } from "vitest";
import {
  NOTE_WEB_APP_SHORTCUTS,
  isAppOwnedShortcut,
  isVimOwnedCtrlChord,
  VIM_OWNED_CTRL_KEYS,
} from "../utils/vim-keyboard";

describe("Vim Keyboard Ownership", () => {
  it("defines safe Ctrl+Alt App-owned shortcuts", () => {
    expect(NOTE_WEB_APP_SHORTCUTS.length).toBe(6);
    const keys = NOTE_WEB_APP_SHORTCUTS.map((s) => s.key);
    expect(keys).toContain("s");
    expect(keys).toContain("p");
    expect(keys).toContain("n");
    expect(keys).toContain("f");
    expect(keys).toContain("b");
    expect(keys).toContain(",");
  });

  it("classifies App-owned shortcuts correctly via isAppOwnedShortcut (Ctrl+Alt+...)", () => {
    expect(isAppOwnedShortcut({ key: "s", ctrlKey: true, altKey: true })).toBe("save");
    expect(isAppOwnedShortcut({ key: "S", ctrlKey: true, altKey: true })).toBe("save");
    expect(isAppOwnedShortcut({ key: "p", ctrlKey: true, altKey: true })).toBe("quick-open");
    expect(isAppOwnedShortcut({ key: "P", ctrlKey: true, altKey: true })).toBe("quick-open");
    expect(isAppOwnedShortcut({ key: "n", ctrlKey: true, altKey: true })).toBe("new-note");
    expect(isAppOwnedShortcut({ key: "N", ctrlKey: true, altKey: true })).toBe("new-note");
    expect(isAppOwnedShortcut({ key: "f", ctrlKey: true, altKey: true })).toBe("search");
    expect(isAppOwnedShortcut({ key: "F", ctrlKey: true, altKey: true })).toBe("search");
    expect(isAppOwnedShortcut({ key: "b", ctrlKey: true, altKey: true })).toBe("sidebar");
    expect(isAppOwnedShortcut({ key: "B", ctrlKey: true, altKey: true })).toBe("sidebar");
    expect(isAppOwnedShortcut({ key: ",", ctrlKey: true, altKey: true })).toBe("settings");
  });

  it("does not classify plain Ctrl shortcuts as App-owned (without Alt)", () => {
    expect(isAppOwnedShortcut({ key: "s", ctrlKey: true, altKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "p", ctrlKey: true, altKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "n", ctrlKey: true, altKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "f", ctrlKey: true, altKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "b", ctrlKey: true, altKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "r", ctrlKey: true, altKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "w", ctrlKey: true, altKey: false })).toBeNull();
  });

  it("recognizes all standard Vim-owned Ctrl chords (without Alt)", () => {
    const vimKeys = Array.from(VIM_OWNED_CTRL_KEYS);
    for (const k of vimKeys) {
      expect(isVimOwnedCtrlChord({ key: k, ctrlKey: true })).toBe(true);
      expect(isVimOwnedCtrlChord({ key: k.toUpperCase(), ctrlKey: true })).toBe(true);
      // If Alt is pressed, it is not a pure Vim Ctrl chord
      expect(isVimOwnedCtrlChord({ key: k, ctrlKey: true, altKey: true })).toBe(false);
    }
    expect(isVimOwnedCtrlChord({ key: "[", code: "BracketLeft", ctrlKey: true })).toBe(true);
    expect(isVimOwnedCtrlChord({ key: "]", code: "BracketRight", ctrlKey: true })).toBe(true);
  });
});
