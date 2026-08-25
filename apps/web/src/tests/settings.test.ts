import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSettings,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  applySettings,
} from "../hooks/useSettings";

describe("useSettings and settings management", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    const existing = document.getElementById("note-web-runtime-settings");
    existing?.remove();
  });

  afterEach(() => {
    store = {};
    vi.restoreAllMocks();
  });

  it("loadSettings returns DEFAULT_SETTINGS when localStorage is empty", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("loadSettings merges stored settings with defaults", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        editorFontSize: 20,
        theme: "dark",
      }),
    );

    const loaded = loadSettings();
    expect(loaded.editorFontSize).toBe(20);
    expect(loaded.theme).toBe("dark");
    expect(loaded.editorLineHeight).toBe(DEFAULT_SETTINGS.editorLineHeight);
  });

  it("loadSettings falls back to DEFAULT_SETTINGS on malformed JSON", () => {
    localStorage.setItem(SETTINGS_KEY, "{invalid_json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("applySettings sets data-theme and creates runtime style tag", () => {
    applySettings(
      {
        ...DEFAULT_SETTINGS,
        editorFontSize: 22,
        editorMaxWidth: null,
        sidebarWidth: 320,
      },
      "dark",
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    const styleEl = document.getElementById("note-web-runtime-settings");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("--editor-font-size: 22px");
    expect(styleEl?.textContent).toContain("--editor-max-width: none");
    expect(styleEl?.textContent).toContain("--sidebar-width: 320px");
  });

  it("useSettings updates setting, persists to localStorage, and resets to defaults", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);

    act(() => {
      result.current.updateSetting("editorFontSize", 18);
      result.current.updateSetting("theme", "light");
      result.current.updateSetting("editorMode", "vim");
      result.current.updateSetting("startupNoteMode", "first");
    });

    expect(result.current.settings.editorFontSize).toBe(18);
    expect(result.current.settings.theme).toBe("light");
    expect(result.current.settings.editorMode).toBe("vim");
    expect(result.current.settings.startupNoteMode).toBe("first");
    expect(result.current.effectiveTheme).toBe("light");

    const savedRaw = localStorage.getItem(SETTINGS_KEY);
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved.editorFontSize).toBe(18);
    expect(saved.theme).toBe("light");
    expect(saved.editorMode).toBe("vim");
    expect(saved.startupNoteMode).toBe("first");

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("loadSettings ignores invalid startupNoteMode and falls back to default", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        startupNoteMode: "invalid_mode",
      }),
    );
    const loaded = loadSettings();
    expect(loaded.startupNoteMode).toBe("last");
  });

  it("persists and updates Vim settings (relativeLineNumbers, lineWrapping, jjEscape)", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.vimRelativeLineNumbers).toBe(true);
    expect(result.current.settings.vimLineWrapping).toBe(true);
    expect(result.current.settings.vimJjEscape).toBe(false);

    act(() => {
      result.current.updateSetting("vimRelativeLineNumbers", false);
      result.current.updateSetting("vimLineWrapping", false);
      result.current.updateSetting("vimJjEscape", true);
    });

    expect(result.current.settings.vimRelativeLineNumbers).toBe(false);
    expect(result.current.settings.vimLineWrapping).toBe(false);
    expect(result.current.settings.vimJjEscape).toBe(true);

    const savedRaw = localStorage.getItem(SETTINGS_KEY);
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved.vimRelativeLineNumbers).toBe(false);
    expect(saved.vimLineWrapping).toBe(false);
    expect(saved.vimJjEscape).toBe(true);
  });

  it("persists and updates custom shortcuts settings and resets to default", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.shortcuts).toBeDefined();
    expect(result.current.settings.shortcuts?.save).toEqual({
      key: "s",
      ctrl: true,
      shift: true,
    });

    act(() => {
      result.current.updateSetting("shortcuts", {
        ...result.current.settings.shortcuts,
        save: { key: "s", ctrl: true, alt: true },
      });
    });

    expect(result.current.settings.shortcuts?.save).toEqual({
      key: "s",
      ctrl: true,
      alt: true,
    });

    const savedRaw = localStorage.getItem(SETTINGS_KEY);
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved.shortcuts?.save).toEqual({
      key: "s",
      ctrl: true,
      alt: true,
    });

    // Resetting settings restores default shortcuts
    act(() => {
      result.current.resetSettings();
    });
    expect(result.current.settings.shortcuts?.save).toEqual({
      key: "s",
      ctrl: true,
      shift: true,
    });
  });
});
