import { describe, it, expect } from "vitest";
import {
  setupVimKeymaps,
  APP_OWNED_VIM_UNMAPS,
  isAppOwnedShortcut,
  isVimOwnedCtrlChord,
  VIM_OWNED_CTRL_KEYS,
} from "../utils/vim-keyboard";

describe("Vim Keyboard Ownership", () => {
  it("unmaps App-owned bindings (<C-p>, <C-n>, <C-s>) from Vim keymap", () => {
    setupVimKeymaps();
    for (const binding of APP_OWNED_VIM_UNMAPS) {
      expect(APP_OWNED_VIM_UNMAPS).toContain(binding);
    }
  });

  it("does NOT unmap Vim-owned bindings (Ctrl+R, Ctrl+F, Ctrl+B, Ctrl+D, Ctrl+U)", () => {
    setupVimKeymaps();
    expect(APP_OWNED_VIM_UNMAPS).not.toContain("<C-r>");
    expect(APP_OWNED_VIM_UNMAPS).not.toContain("<C-f>");
    expect(APP_OWNED_VIM_UNMAPS).not.toContain("<C-b>");
    expect(APP_OWNED_VIM_UNMAPS).not.toContain("<C-d>");
    expect(APP_OWNED_VIM_UNMAPS).not.toContain("<C-u>");
  });

  it("classifies App-owned shortcuts correctly via isAppOwnedShortcut", () => {
    expect(isAppOwnedShortcut({ key: "s", ctrlKey: true })).toBe("save");
    expect(isAppOwnedShortcut({ key: "S", ctrlKey: true })).toBe("save");
    expect(isAppOwnedShortcut({ key: "p", ctrlKey: true })).toBe("quick-open");
    expect(isAppOwnedShortcut({ key: "P", ctrlKey: true })).toBe("quick-open");
    expect(isAppOwnedShortcut({ key: "n", ctrlKey: true })).toBe("new-note");
    expect(isAppOwnedShortcut({ key: "N", ctrlKey: true })).toBe("new-note");
    expect(isAppOwnedShortcut({ key: ",", ctrlKey: true })).toBe("settings");
    expect(isAppOwnedShortcut({ key: "f", ctrlKey: true, shiftKey: true })).toBe("search");
    expect(isAppOwnedShortcut({ key: "F", ctrlKey: true, shiftKey: true })).toBe("search");
    expect(isAppOwnedShortcut({ key: "b", ctrlKey: true, shiftKey: true })).toBe("sidebar");
    expect(isAppOwnedShortcut({ key: "B", ctrlKey: true, shiftKey: true })).toBe("sidebar");
  });

  it("does not classify Vim-owned Ctrl keys as App-owned", () => {
    expect(isAppOwnedShortcut({ key: "r", ctrlKey: true })).toBeNull();
    expect(isAppOwnedShortcut({ key: "f", ctrlKey: true })).toBeNull();
    expect(isAppOwnedShortcut({ key: "b", ctrlKey: true })).toBeNull();
    expect(isAppOwnedShortcut({ key: "d", ctrlKey: true })).toBeNull();
    expect(isAppOwnedShortcut({ key: "u", ctrlKey: true })).toBeNull();
    expect(isAppOwnedShortcut({ key: "w", ctrlKey: true })).toBeNull();
    expect(isAppOwnedShortcut({ key: "a", ctrlKey: true })).toBeNull();
  });

  it("recognizes all standard Vim-owned Ctrl chords", () => {
    const vimKeys = Array.from(VIM_OWNED_CTRL_KEYS);
    for (const k of vimKeys) {
      expect(isVimOwnedCtrlChord({ key: k, ctrlKey: true })).toBe(true);
      expect(isVimOwnedCtrlChord({ key: k.toUpperCase(), ctrlKey: true })).toBe(true);
    }
    expect(isVimOwnedCtrlChord({ key: "[", code: "BracketLeft", ctrlKey: true })).toBe(true);
    expect(isVimOwnedCtrlChord({ key: "]", code: "BracketRight", ctrlKey: true })).toBe(true);
  });
});
