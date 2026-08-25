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

  it("supports new theme presets and computes effectiveColorScheme correctly", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSetting("theme", "tokyo-night");
    });
    expect(result.current.settings.theme).toBe("tokyo-night");
    expect(result.current.effectiveTheme).toBe("tokyo-night");
    expect(result.current.effectiveColorScheme).toBe("dark");

    act(() => {
      result.current.updateSetting("theme", "everforest-light");
    });
    expect(result.current.settings.theme).toBe("everforest-light");
    expect(result.current.effectiveTheme).toBe("everforest-light");
    expect(result.current.effectiveColorScheme).toBe("light");

    act(() => {
      result.current.updateSetting("theme", "catppuccin-mocha");
    });
    expect(result.current.effectiveColorScheme).toBe("dark");

    act(() => {
      result.current.updateSetting("theme", "nord-light");
    });
    expect(result.current.effectiveColorScheme).toBe("light");
  });

  it("applies background image settings and variables", () => {
    applySettings(
      {
        ...DEFAULT_SETTINGS,
        bgImage: "data:image/png;base64,mockImage",
        bgOpacity: 0.5,
        bgBlur: 10,
        bgBrightness: 120,
        bgGrayscale: 15,
        bgFit: "cover",
      },
      "tokyo-night",
      "dark",
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("tokyo-night");
    expect(document.documentElement.getAttribute("data-color-scheme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-has-bg")).toBe("true");
    expect(document.documentElement.getAttribute("data-bg-glassmorphism")).toBe("true");

    const styleEl = document.getElementById("note-web-runtime-settings");
    expect(styleEl?.textContent).toContain('--app-bg-image: url("data:image/png;base64,mockImage")');
    expect(styleEl?.textContent).toContain("--app-bg-opacity: 0.5");
    expect(styleEl?.textContent).toContain("--app-bg-blur: 10px");
    expect(styleEl?.textContent).toContain("--app-bg-brightness: 120%");
    expect(styleEl?.textContent).toContain("--app-bg-grayscale: 15%");
    expect(styleEl?.textContent).toContain("--app-bg-size: cover");
  });

  it("sets data-bg-glassmorphism to false when disabled", () => {
    applySettings(
      {
        ...DEFAULT_SETTINGS,
        bgImage: "data:image/png;base64,mockImage",
        bgGlassmorphism: false,
      },
      "tokyo-night",
      "dark",
    );

    expect(document.documentElement.getAttribute("data-has-bg")).toBe("true");
    expect(document.documentElement.getAttribute("data-bg-glassmorphism")).toBe("false");
  });

  it("removes data-has-bg when bgImage is null or empty", () => {
    applySettings(
      {
        ...DEFAULT_SETTINGS,
        bgImage: null,
      },
      "light",
      "light",
    );

    expect(document.documentElement.getAttribute("data-has-bg")).toBeNull();
    const styleEl = document.getElementById("note-web-runtime-settings");
    expect(styleEl?.textContent).toContain("--app-bg-image: none");
  });

  it("verifies code block and syntax variables exist in theme files", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const themesDir = path.resolve(__dirname, "../styles/themes");
    const files = fs.readdirSync(themesDir).filter((f) => f.endsWith(".css"));

    expect(files.length).toBeGreaterThanOrEqual(14);
    const requiredVars = [
      "--code-bg",
      "--code-text",
      "--code-border",
      "--code-inline-bg",
      "--code-inline-text",
      "--syntax-keyword",
      "--syntax-string",
      "--syntax-number",
      "--syntax-comment",
      "--syntax-variable",
      "--syntax-function",
      "--syntax-operator",
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(themesDir, file), "utf-8");
      for (const v of requiredVars) {
        expect(content, `${file} is missing ${v}`).toContain(v);
      }
    }
  });
});

