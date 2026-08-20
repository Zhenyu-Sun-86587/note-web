import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

describe("useKeyboardShortcuts hook", () => {
  it("triggers onSave on Ctrl+S and prevents default", () => {
    const onSave = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSave }));

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  it("triggers onOpenSettings on Ctrl+, and prevents default", () => {
    const onOpenSettings = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenSettings }));

    const event = new KeyboardEvent("keydown", {
      key: ",",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  it("triggers onToggleSidebar on Ctrl+Shift+B and prevents default", () => {
    const onToggleSidebar = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onToggleSidebar }));

    const event = new KeyboardEvent("keydown", {
      key: "B",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  it("triggers onSearch on Ctrl+Shift+F and prevents default", () => {
    const onSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearch }));

    const event = new KeyboardEvent("keydown", {
      key: "F",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  it("does NOT intercept Ctrl+B or Ctrl+K without Shift so editor formatting hotkeys work", () => {
    const onToggleSidebar = vi.fn();
    const onSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onToggleSidebar, onSearch }));

    const ctrlB = new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ctrlB);
    expect(onToggleSidebar).not.toHaveBeenCalled();

    const ctrlK = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ctrlK);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("preserves Vim keys when focused inside .note-web-vim-editor, but allows Ctrl+S and modal Escape", () => {
    const onSave = vi.fn();
    const onQuickOpen = vi.fn();
    const onEscape = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ onSave, onQuickOpen, onEscape }),
    );

    const vimContainer = document.createElement("div");
    vimContainer.className = "note-web-vim-editor";
    const vimEditor = document.createElement("div");
    vimEditor.className = "cm-editor";
    vimContainer.appendChild(vimEditor);
    document.body.appendChild(vimContainer);

    // 1. Ctrl+P inside Vim editor should NOT trigger onQuickOpen
    const ctrlP = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    vimEditor.dispatchEvent(ctrlP);
    expect(onQuickOpen).not.toHaveBeenCalled();

    // 2. Escape inside Vim editor should NOT trigger global onEscape
    const escapeKey = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    vimEditor.dispatchEvent(escapeKey);
    expect(onEscape).not.toHaveBeenCalled();

    // 3. Ctrl+S inside Vim editor SHOULD trigger onSave
    const ctrlS = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    vimEditor.dispatchEvent(ctrlS);
    expect(onSave).toHaveBeenCalledTimes(1);

    // 4. Modal element inside or outside should allow Escape
    const modal = document.createElement("div");
    modal.className = "modal-content";
    document.body.appendChild(modal);
    modal.dispatchEvent(escapeKey);
    expect(onEscape).toHaveBeenCalledTimes(1);

    vimContainer.remove();
    modal.remove();
  });

  it("handles Mac Cmd vs Vim Ctrl semantics properly", () => {
    const onSave = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSave }));

    const vimContainer = document.createElement("div");
    vimContainer.className = "note-web-vim-editor";
    const vimEditor = document.createElement("div");
    vimEditor.className = "cm-editor";
    vimContainer.appendChild(vimEditor);
    document.body.appendChild(vimContainer);

    // 1. Vim Ctrl+R inside Vim: intercepted and prevented from browser reload
    const vimCtrlR = new KeyboardEvent("keydown", {
      key: "r",
      ctrlKey: true,
      metaKey: false,
      bubbles: true,
      cancelable: true,
    });
    const preventedCtrlR = !vimEditor.dispatchEvent(vimCtrlR);
    expect(preventedCtrlR).toBe(true);

    // 2. Mac Cmd+R inside Vim: NOT prevented by useKeyboardShortcuts (delegated to browser)
    const macCmdR = new KeyboardEvent("keydown", {
      key: "r",
      ctrlKey: false,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventedCmdR = !vimEditor.dispatchEvent(macCmdR);
    expect(preventedCmdR).toBe(false);

    // 3. Mac Cmd+S inside Vim: triggers onSave and prevents default
    const macCmdS = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventedCmdS = !vimEditor.dispatchEvent(macCmdS);
    expect(onSave).toHaveBeenCalled();
    expect(preventedCmdS).toBe(true);

    vimContainer.remove();
  });
});
