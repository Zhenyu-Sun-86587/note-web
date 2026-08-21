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

  it("triggers onQuickOpen on Ctrl+P (App-owned shortcut) and prevents default", () => {
    const onQuickOpen = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onQuickOpen }));

    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(onQuickOpen).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  it("triggers onNewNote on Ctrl+N (App-owned shortcut) and prevents default", () => {
    const onNewNote = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewNote }));

    const event = new KeyboardEvent("keydown", {
      key: "n",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(onNewNote).toHaveBeenCalledTimes(1);
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

  it("handles Escape in modal dialogs while leaving editor Escape alone", () => {
    const onEscape = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onEscape }));

    // Modal element allows Escape
    const modal = document.createElement("div");
    modal.className = "modal-content";
    document.body.appendChild(modal);

    const escapeInModal = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    modal.dispatchEvent(escapeInModal);
    expect(onEscape).toHaveBeenCalledTimes(1);

    // Escape inside Vim editor does NOT trigger onEscape (Escape belongs to Vim)
    const vimEditor = document.createElement("div");
    vimEditor.className = "note-web-vim-editor";
    document.body.appendChild(vimEditor);

    const escapeInVim = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    vimEditor.dispatchEvent(escapeInVim);
    expect(onEscape).toHaveBeenCalledTimes(1);

    modal.remove();
    vimEditor.remove();
  });
});
