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
  beforeEach(() => {
    localStorage.clear();
    const existing = document.getElementById("note-web-runtime-settings");
    existing?.remove();
  });

  afterEach(() => {
    localStorage.clear();
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
    });

    expect(result.current.settings.editorFontSize).toBe(18);
    expect(result.current.settings.theme).toBe("light");
    expect(result.current.effectiveTheme).toBe("light");

    const savedRaw = localStorage.getItem(SETTINGS_KEY);
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved.editorFontSize).toBe(18);
    expect(saved.theme).toBe("light");

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });
});
