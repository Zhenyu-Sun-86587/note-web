import { describe, it, expect } from "vitest";
import {
  NOTE_WEB_APP_SHORTCUTS,
  isAppOwnedShortcut,
  isVimOwnedCtrlChord,
  VIM_OWNED_CTRL_KEYS,
} from "../utils/vim-keyboard";

describe("Vim Keyboard Ownership", () => {
  it("defines safe App-owned shortcuts", () => {
    expect(NOTE_WEB_APP_SHORTCUTS.length).toBe(8);
    const keys = NOTE_WEB_APP_SHORTCUTS.map((s) => s.key);
    expect(keys).toContain("s");
    expect(keys).toContain("p");
    expect(keys).toContain("n");
    expect(keys).toContain("f");
    expect(keys).toContain("b");
    expect(keys).toContain(",");
    expect(keys).toContain("o");
    expect(keys).toContain("v");
  });

  it("classifies App-owned shortcuts correctly via isAppOwnedShortcut (Ctrl+Shift+... and Ctrl+Alt+...)", () => {
    expect(isAppOwnedShortcut({ key: "s", ctrlKey: true, shiftKey: true })).toBe("save");
    expect(isAppOwnedShortcut({ key: "S", ctrlKey: true, shiftKey: true })).toBe("save");
    expect(isAppOwnedShortcut({ key: "p", ctrlKey: true, shiftKey: true })).toBe("quick-open");
    expect(isAppOwnedShortcut({ key: "P", ctrlKey: true, shiftKey: true })).toBe("quick-open");
    expect(isAppOwnedShortcut({ key: "n", ctrlKey: true, shiftKey: true })).toBe("new-note");
    expect(isAppOwnedShortcut({ key: "N", ctrlKey: true, shiftKey: true })).toBe("new-note");
    expect(isAppOwnedShortcut({ key: "f", ctrlKey: true, shiftKey: true })).toBe("search");
    expect(isAppOwnedShortcut({ key: "F", ctrlKey: true, shiftKey: true })).toBe("search");
    expect(isAppOwnedShortcut({ key: "b", ctrlKey: true, shiftKey: true })).toBe("sidebar");
    expect(isAppOwnedShortcut({ key: "B", ctrlKey: true, shiftKey: true })).toBe("sidebar");
    expect(isAppOwnedShortcut({ key: ",", ctrlKey: true, shiftKey: true })).toBe("settings");
    expect(isAppOwnedShortcut({ key: "<", code: "Comma", ctrlKey: true, shiftKey: true })).toBe("settings");
    expect(isAppOwnedShortcut({ key: "o", ctrlKey: true, altKey: true })).toBe("toggle-outline");
    expect(isAppOwnedShortcut({ key: "O", ctrlKey: true, altKey: true })).toBe("toggle-outline");
    expect(isAppOwnedShortcut({ key: "v", ctrlKey: true, altKey: true })).toBe("toggle-vim-preview");
    expect(isAppOwnedShortcut({ key: "V", ctrlKey: true, altKey: true })).toBe("toggle-vim-preview");
  });

  it("does not classify plain Ctrl shortcuts as App-owned (without Shift)", () => {
    expect(isAppOwnedShortcut({ key: "s", ctrlKey: true, shiftKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "p", ctrlKey: true, shiftKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "n", ctrlKey: true, shiftKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "f", ctrlKey: true, shiftKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "b", ctrlKey: true, shiftKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "r", ctrlKey: true, shiftKey: false })).toBeNull();
    expect(isAppOwnedShortcut({ key: "w", ctrlKey: true, shiftKey: false })).toBeNull();
  });

  it("recognizes all standard Vim-owned Ctrl chords (without Shift/Alt)", () => {
    const vimKeys = Array.from(VIM_OWNED_CTRL_KEYS);
    for (const k of vimKeys) {
      expect(isVimOwnedCtrlChord({ key: k, ctrlKey: true })).toBe(true);
      expect(isVimOwnedCtrlChord({ key: k.toUpperCase(), ctrlKey: true })).toBe(true);
      // If Shift or Alt is pressed, it is not a pure Vim Ctrl chord
      expect(isVimOwnedCtrlChord({ key: k, ctrlKey: true, shiftKey: true })).toBe(false);
      expect(isVimOwnedCtrlChord({ key: k, ctrlKey: true, altKey: true })).toBe(false);
    }
    expect(isVimOwnedCtrlChord({ key: "[", code: "BracketLeft", ctrlKey: true })).toBe(true);
    expect(isVimOwnedCtrlChord({ key: "]", code: "BracketRight", ctrlKey: true })).toBe(true);
  });
});
