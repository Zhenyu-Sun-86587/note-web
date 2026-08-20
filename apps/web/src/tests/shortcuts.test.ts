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
});
