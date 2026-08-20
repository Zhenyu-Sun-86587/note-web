import { useState, useEffect, useCallback } from "react";

export type ThemePreference = "system" | "light" | "dark";

export interface AppSettings {
  theme: ThemePreference;
  editorFont: string;
  editorFontSize: number;
  editorLineHeight: number;
  editorMaxWidth: number | null;
  editorPaddingX: number;
  uiFont: string;
  monoFont: string;
  sidebarWidth: number;
}

export const SETTINGS_KEY = "note-web-settings-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  editorFont: '"Georgia", "Cambria", "Times New Roman", serif',
  editorFontSize: 16,
  editorLineHeight: 1.75,
  editorMaxWidth: 900,
  editorPaddingX: 48,
  uiFont:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  monoFont:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  sidebarWidth: 280,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function applySettings(
  settings: AppSettings,
  resolvedTheme: "light" | "dark",
) {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", resolvedTheme);

  let styleEl = document.getElementById(
    "note-web-runtime-settings",
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "note-web-runtime-settings";
    const customCssLink = document.querySelector('link[href*="custom.css"]');
    if (customCssLink && customCssLink.parentNode) {
      customCssLink.parentNode.insertBefore(styleEl, customCssLink);
    } else {
      document.head.appendChild(styleEl);
    }
  }

  const maxWidth =
    settings.editorMaxWidth === null ? "none" : `${settings.editorMaxWidth}px`;

  styleEl.textContent = `
:root {
  --font-ui: ${settings.uiFont};
  --font-editor: ${settings.editorFont};
  --font-mono: ${settings.monoFont};
  --editor-font-size: ${settings.editorFontSize}px;
  --editor-line-height: ${settings.editorLineHeight};
  --editor-max-width: ${maxWidth};
  --editor-padding-x: ${settings.editorPaddingX}px;
  --sidebar-width: ${settings.sidebarWidth}px;
}
  `;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const getSystemTheme = useCallback((): "light" | "dark" => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }, []);

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    getSystemTheme,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else if (
      (
        mediaQuery as unknown as {
          addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener
    ) {
      (
        mediaQuery as unknown as {
          addListener: (cb: (e: MediaQueryListEvent) => void) => void;
          removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener(handleChange);
      return () =>
        (
          mediaQuery as unknown as {
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener(handleChange);
    }
  }, []);

  const effectiveTheme: "light" | "dark" =
    settings.theme === "system" ? systemTheme : settings.theme;

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage write errors
    }
    applySettings(settings, effectiveTheme);
  }, [settings, effectiveTheme]);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    effectiveTheme,
    updateSetting,
    setSettings,
    resetSettings,
  };
}
