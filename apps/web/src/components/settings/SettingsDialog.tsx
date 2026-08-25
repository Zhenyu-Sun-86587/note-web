import React, { useState, useEffect } from "react";
import { X, RotateCcw } from "lucide-react";
import { Button } from "../common/Button";
import { IconButton } from "../common/IconButton";
import type { AppSettings, ThemePreference } from "../../hooks/useSettings";
import {
  DEFAULT_APP_SHORTCUTS,
  SHORTCUT_INFO,
  formatShortcutBinding,
  type AppAction,
  type ShortcutBinding,
  type CustomShortcuts,
} from "../../utils/vim-keyboard";
import "../../styles/settings.css";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  onResetSettings: () => void;
}

const EDITOR_FONT_PRESETS: { label: string; value: string }[] = [
  {
    label: "服务器中文字体（推荐）",
    value:
      '"NoteWeb CJK", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  },
  {
    label: "中文无衬线 (CJK Sans)",
    value:
      '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif',
  },
  {
    label: "中文衬线 (CJK Serif)",
    value:
      '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Noto Serif SC", serif',
  },
  {
    label: "中文等宽 / 编程 (CJK Mono)",
    value:
      '"NoteWeb Mono CJK", "Maple Mono CN", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "Microsoft YaHei Mono", ui-monospace, monospace',
  },
  {
    label: "Maple Mono CN NF（本机）",
    value:
      '"Maple Mono CN NF", "Maple Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    label: "西文衬线 (Western Serif)",
    value: '"Georgia", "Cambria", "Times New Roman", serif',
  },
  {
    label: "西文无衬线 (Western Sans)",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    label: "西文等宽 (Western Mono)",
    value:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
];

const UI_FONT_PRESETS: { label: string; value: string }[] = [
  {
    label: "服务器中文字体（推荐）",
    value:
      '"NoteWeb CJK", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    label: "系统默认 (System CJK)",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    label: "现代无衬线 (Sans)",
    value:
      '"Inter", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
  },
  {
    label: "Maple Mono CN NF（本机）",
    value: '"Maple Mono CN NF", "Maple Mono", ui-monospace, monospace',
  },
];

const MONO_FONT_PRESETS: { label: string; value: string }[] = [
  {
    label: "服务器等宽字体（推荐）",
    value:
      '"NoteWeb Mono CJK", "Maple Mono CN", "Sarasa Mono SC", "Noto Sans Mono CJK SC", ui-monospace, monospace',
  },
  {
    label: "中文等宽 (CJK Mono)",
    value:
      '"Maple Mono CN", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "Microsoft YaHei Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    label: "Maple Mono CN NF（本机）",
    value: '"Maple Mono CN NF", "Maple Mono", ui-monospace, monospace',
  },
  {
    label: "系统等宽 (System Mono)",
    value:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
];

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
  onResetSettings,
}) => {
  const [customEditorFont, setCustomEditorFont] = useState(
    () =>
      EDITOR_FONT_PRESETS.some((p) => p.value === settings.editorFont)
        ? ""
        : settings.editorFont,
  );

  const [customUiFont, setCustomUiFont] = useState(
    () =>
      UI_FONT_PRESETS.some((p) => p.value === settings.uiFont)
        ? ""
        : settings.uiFont,
  );

  const [customMonoFont, setCustomMonoFont] = useState(
    () =>
      MONO_FONT_PRESETS.some((p) => p.value === settings.monoFont)
        ? ""
        : settings.monoFont,
  );

  const [recordingAction, setRecordingAction] = useState<AppAction | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingAction) return;

    const handleKeyCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        setRecordingAction(null);
        setConflictNotice(null);
        return;
      }

      // Ignore bare modifier keydown
      if (
        e.key === "Control" ||
        e.key === "Shift" ||
        e.key === "Alt" ||
        e.key === "Meta"
      ) {
        return;
      }

      const hasMod = Boolean(e.ctrlKey || e.metaKey);
      const hasAlt = Boolean(e.altKey);
      const hasShift = Boolean(e.shiftKey);

      let key = e.key.toLowerCase();
      if (e.code === "Comma" || e.key === "<") {
        key = ",";
      }

      const isFunctionKey = /^f\d+$/i.test(key);
      if (!hasMod && !hasAlt && !hasShift && !isFunctionKey) {
        setConflictNotice(
          "快捷键必须包含 Ctrl/Cmd、Alt、Shift 或为功能键（F1-F12）",
        );
        return;
      }

      const newBinding: ShortcutBinding = {
        key,
        ctrl: hasMod,
        alt: hasAlt,
        shift: hasShift,
      };

      const currentShortcuts: CustomShortcuts = {
        ...DEFAULT_APP_SHORTCUTS,
        ...settings.shortcuts,
      } as CustomShortcuts;

      let conflictActionName: string | null = null;
      for (const [otherAction, otherBinding] of Object.entries(
        currentShortcuts,
      ) as [AppAction, ShortcutBinding][]) {
        if (otherAction === recordingAction) continue;
        if (
          otherBinding.key.toLowerCase() === key &&
          Boolean(otherBinding.ctrl) === hasMod &&
          Boolean(otherBinding.alt) === hasAlt &&
          Boolean(otherBinding.shift) === hasShift
        ) {
          conflictActionName =
            SHORTCUT_INFO[otherAction]?.label || otherAction;
          break;
        }
      }

      const nextShortcuts = {
        ...currentShortcuts,
        [recordingAction]: newBinding,
      };

      onUpdateSetting("shortcuts", nextShortcuts);
      setRecordingAction(null);
      if (conflictActionName) {
        setConflictNotice(`提示：已与「${conflictActionName}」使用相同按键`);
        setTimeout(() => setConflictNotice(null), 3000);
      } else {
        setConflictNotice(null);
      }
    };

    window.addEventListener("keydown", handleKeyCapture, true);
    return () => {
      window.removeEventListener("keydown", handleKeyCapture, true);
    };
  }, [recordingAction, settings.shortcuts, onUpdateSetting]);

  if (!isOpen) return null;

  const isEditorFontCustom = !EDITOR_FONT_PRESETS.some(
    (p) => p.value === settings.editorFont,
  );
  const isUiFontCustom = !UI_FONT_PRESETS.some(
    (p) => p.value === settings.uiFont,
  );
  const isMonoFontCustom = !MONO_FONT_PRESETS.some(
    (p) => p.value === settings.monoFont,
  );

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-content settings-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">设置</h3>
          <IconButton
            icon={<X size={18} />}
            label="关闭"
            onClick={onClose}
            size="sm"
          />
        </div>

        <div className="settings-body">
          {/* Appearance Section */}
          <div className="settings-section">
            <div className="settings-section-title">外观 (Appearance)</div>
            <div className="settings-row">
              <div className="settings-label">主题配色 (Theme)</div>
              <select
                className="settings-select"
                value={settings.theme}
                onChange={(e) =>
                  onUpdateSetting("theme", e.target.value as ThemePreference)
                }
              >
                <optgroup label="基础主题 (Standard)">
                  <option value="system">跟随系统 (System)</option>
                  <option value="light">经典浅色 (Classic Light)</option>
                  <option value="dark">经典深色 (Classic Dark)</option>
                </optgroup>
                <optgroup label="Tokyo Night (东京之夜)">
                  <option value="tokyo-night">Tokyo Night Dark (夜间)</option>
                  <option value="tokyo-night-light">Tokyo Night Day (日间)</option>
                </optgroup>
                <optgroup label="Everforest (常青森林)">
                  <option value="everforest-dark">Everforest Dark (森绿深色)</option>
                  <option value="everforest-light">Everforest Light (森绿浅色)</option>
                </optgroup>
                <optgroup label="Catppuccin">
                  <option value="catppuccin-mocha">Catppuccin Mocha (摩卡深色)</option>
                  <option value="catppuccin-latte">Catppuccin Latte (拿铁浅色)</option>
                </optgroup>
                <optgroup label="Nord (极光北欧)">
                  <option value="nord">Nord Dark (极光深色)</option>
                  <option value="nord-light">Nord Light (雪原浅色)</option>
                </optgroup>
                <optgroup label="Gruvbox">
                  <option value="gruvbox-dark">Gruvbox Dark (复古深色)</option>
                  <option value="gruvbox-light">Gruvbox Light (复古浅色)</option>
                </optgroup>
                <optgroup label="精选配色 (Featured)">
                  <option value="rose-pine">Rosé Pine (暗香蔷薇)</option>
                  <option value="one-dark">One Dark (Atom 经典)</option>
                </optgroup>
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-label">默认编辑器</div>
              <select
                className="settings-select"
                value={settings.editorMode || "ir"}
                onChange={(e) =>
                  onUpdateSetting(
                    "editorMode",
                    e.target.value as "ir" | "vim",
                  )
                }
              >
                <option value="ir">即时渲染 (IR)</option>
                <option value="vim">Vim Markdown</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-label">启动时打开</div>
              <select
                className="settings-select"
                value={settings.startupNoteMode || "last"}
                onChange={(e) =>
                  onUpdateSetting(
                    "startupNoteMode",
                    e.target.value as "last" | "first" | "none",
                  )
                }
              >
                <option value="last">上次打开的笔记（默认）</option>
                <option value="first">第一篇笔记</option>
                <option value="none">不自动打开</option>
              </select>
            </div>
          </div>

          {/* Background Image Section */}
          <div className="settings-section">
            <div className="settings-section-title">背景壁纸与效果 (Background)</div>
            <div className="settings-row">
              <div className="settings-label">
                <div>背景壁纸</div>
                <div className="settings-sublabel">支持上传本地图片 (自动保持毛玻璃与高对比度文字)</div>
              </div>
              <div className="settings-bg-actions">
                <label className="settings-file-upload-btn">
                  选择图片
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 8 * 1024 * 1024) {
                        alert("图片大小不能超过 8MB");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const result = event.target?.result as string;
                        if (result) onUpdateSetting("bgImage", result);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {settings.bgImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUpdateSetting("bgImage", null)}
                  >
                    清除壁纸
                  </Button>
                )}
              </div>
            </div>

            {settings.bgImage && (
              <>
                <div className="settings-bg-preview-row">
                  <div
                    className="settings-bg-preview-thumbnail"
                    style={{
                      backgroundImage: `url(${settings.bgImage})`,
                      filter: `blur(${settings.bgBlur ?? 0}px) brightness(${settings.bgBrightness ?? 100}%) grayscale(${settings.bgGrayscale ?? 0}%)`,
                      opacity: settings.bgOpacity ?? 0.35,
                    }}
                  />
                  <div className="settings-bg-preview-info">
                    <div className="settings-bg-preview-title">自定义背景已启用</div>
                    <div className="settings-bg-preview-hint">各面板自动启用毛玻璃半透明透显效果</div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <div>不透明度 (Opacity)</div>
                    <div className="settings-sublabel">调节背景画面的浓淡程度</div>
                  </div>
                  <div className="settings-slider-wrapper">
                    <input
                      type="range"
                      min="0.05"
                      max="1.0"
                      step="0.05"
                      className="settings-slider"
                      value={settings.bgOpacity ?? 0.35}
                      onChange={(e) =>
                        onUpdateSetting("bgOpacity", parseFloat(e.target.value))
                      }
                    />
                    <span className="settings-slider-val">
                      {Math.round((settings.bgOpacity ?? 0.35) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <div>模糊度 (Blur)</div>
                    <div className="settings-sublabel">添加高斯模糊，让笔记文字更清晰</div>
                  </div>
                  <div className="settings-slider-wrapper">
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="1"
                      className="settings-slider"
                      value={settings.bgBlur ?? 0}
                      onChange={(e) =>
                        onUpdateSetting("bgBlur", parseInt(e.target.value, 10))
                      }
                    />
                    <span className="settings-slider-val">
                      {settings.bgBlur ?? 0}px
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <div>亮度与清晰度 (Brightness)</div>
                    <div className="settings-sublabel">微调背景画面的明暗高光</div>
                  </div>
                  <div className="settings-slider-wrapper">
                    <input
                      type="range"
                      min="30"
                      max="180"
                      step="5"
                      className="settings-slider"
                      value={settings.bgBrightness ?? 100}
                      onChange={(e) =>
                        onUpdateSetting(
                          "bgBrightness",
                          parseInt(e.target.value, 10),
                        )
                      }
                    />
                    <span className="settings-slider-val">
                      {settings.bgBrightness ?? 100}%
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <div>灰度调色 (Grayscale)</div>
                    <div className="settings-sublabel">降低画面色彩以减少视觉分散</div>
                  </div>
                  <div className="settings-slider-wrapper">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      className="settings-slider"
                      value={settings.bgGrayscale ?? 0}
                      onChange={(e) =>
                        onUpdateSetting(
                          "bgGrayscale",
                          parseInt(e.target.value, 10),
                        )
                      }
                    />
                    <span className="settings-slider-val">
                      {settings.bgGrayscale ?? 0}%
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">画面适应 (Fit Mode)</div>
                  <select
                    className="settings-select"
                    value={settings.bgFit || "cover"}
                    onChange={(e) =>
                      onUpdateSetting(
                        "bgFit",
                        e.target.value as "cover" | "contain" | "repeat",
                      )
                    }
                  >
                    <option value="cover">全屏拉伸铺满 (Cover)</option>
                    <option value="contain">完整保持比例 (Contain)</option>
                    <option value="repeat">平铺重复 (Repeat)</option>
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Vim Section */}
          <div className="settings-section">
            <div className="settings-section-title">Vim</div>
            <div className="settings-row">
              <div className="settings-label">相对行号</div>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.vimRelativeLineNumbers}
                  onChange={(e) =>
                    onUpdateSetting("vimRelativeLineNumbers", e.target.checked)
                  }
                />
                启用 (Hybrid Relative Numbers)
              </label>
            </div>
            <div className="settings-row">
              <div className="settings-label">自动换行</div>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.vimLineWrapping}
                  onChange={(e) =>
                    onUpdateSetting("vimLineWrapping", e.target.checked)
                  }
                />
                启用 (Line Wrapping)
              </label>
            </div>
            <div className="settings-row">
              <div className="settings-label">jj 退出插入模式</div>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.vimJjEscape}
                  onChange={(e) =>
                    onUpdateSetting("vimJjEscape", e.target.checked)
                  }
                />
                启用 (Map jj to Escape)
              </label>
            </div>
            <div
              className="settings-hint"
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "6px",
                lineHeight: "1.4",
              }}
            >
              寄存器与宏：当前浏览器标签页会话内保存；关闭标签页后清除。
            </div>
          </div>

          {/* Editor Section */}
          <div className="settings-section">
            <div className="settings-section-title">编辑器 (Editor)</div>

            {/* Editor Font */}
            <div className="settings-row-col">
              <div className="settings-row">
                <div className="settings-label">正文字体</div>
                <select
                  className="settings-select"
                  value={isEditorFontCustom ? "custom" : settings.editorFont}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "custom") {
                      const next = customEditorFont || settings.editorFont;
                      onUpdateSetting("editorFont", next);
                    } else {
                      onUpdateSetting("editorFont", val);
                    }
                  }}
                >
                  {EDITOR_FONT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">自定义 (Custom)...</option>
                </select>
              </div>
              {isEditorFontCustom && (
                <input
                  type="text"
                  className="settings-input"
                  placeholder="CSS font-family，如: 'Maple Mono', serif"
                  value={customEditorFont || settings.editorFont}
                  onChange={(e) => {
                    setCustomEditorFont(e.target.value);
                    onUpdateSetting("editorFont", e.target.value);
                  }}
                />
              )}
            </div>

            {/* Font Size */}
            <div className="settings-row">
              <div className="settings-label">正文字号</div>
              <div className="settings-slider-wrapper">
                <input
                  type="range"
                  min="12"
                  max="28"
                  step="1"
                  className="settings-slider"
                  value={settings.editorFontSize}
                  onChange={(e) =>
                    onUpdateSetting("editorFontSize", Number(e.target.value))
                  }
                />
                <span className="settings-slider-val">
                  {settings.editorFontSize} px
                </span>
              </div>
            </div>

            {/* Line Height */}
            <div className="settings-row">
              <div className="settings-label">行间距</div>
              <div className="settings-slider-wrapper">
                <input
                  type="range"
                  min="1.2"
                  max="2.4"
                  step="0.05"
                  className="settings-slider"
                  value={settings.editorLineHeight}
                  onChange={(e) =>
                    onUpdateSetting(
                      "editorLineHeight",
                      parseFloat(Number(e.target.value).toFixed(2)),
                    )
                  }
                />
                <span className="settings-slider-val">
                  {settings.editorLineHeight.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Editor Max Width */}
            <div className="settings-row-col">
              <div className="settings-row">
                <div className="settings-label">正文最大宽度</div>
                <label className="settings-checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.editorMaxWidth === null}
                    onChange={(e) => {
                      onUpdateSetting(
                        "editorMaxWidth",
                        e.target.checked ? null : 900,
                      );
                    }}
                  />
                  全宽显示 (Full Width)
                </label>
              </div>
              {settings.editorMaxWidth !== null && (
                <div className="settings-slider-wrapper" style={{ width: "100%" }}>
                  <input
                    type="range"
                    min="600"
                    max="1400"
                    step="50"
                    className="settings-slider"
                    value={settings.editorMaxWidth}
                    onChange={(e) =>
                      onUpdateSetting("editorMaxWidth", Number(e.target.value))
                    }
                  />
                  <span className="settings-slider-val">
                    {settings.editorMaxWidth} px
                  </span>
                </div>
              )}
            </div>

            {/* Horizontal Padding */}
            <div className="settings-row">
              <div className="settings-label">左右留白</div>
              <div className="settings-slider-wrapper">
                <input
                  type="range"
                  min="16"
                  max="96"
                  step="4"
                  className="settings-slider"
                  value={settings.editorPaddingX}
                  onChange={(e) =>
                    onUpdateSetting("editorPaddingX", Number(e.target.value))
                  }
                />
                <span className="settings-slider-val">
                  {settings.editorPaddingX} px
                </span>
              </div>
            </div>
          </div>

          {/* UI Section */}
          <div className="settings-section">
            <div className="settings-section-title">界面与代码 (UI & Code)</div>

            {/* UI Font */}
            <div className="settings-row-col">
              <div className="settings-row">
                <div className="settings-label">界面字体</div>
                <select
                  className="settings-select"
                  value={isUiFontCustom ? "custom" : settings.uiFont}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "custom") {
                      const next = customUiFont || settings.uiFont;
                      onUpdateSetting("uiFont", next);
                    } else {
                      onUpdateSetting("uiFont", val);
                    }
                  }}
                >
                  {UI_FONT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">自定义 (Custom)...</option>
                </select>
              </div>
              {isUiFontCustom && (
                <input
                  type="text"
                  className="settings-input"
                  placeholder="CSS font-family"
                  value={customUiFont || settings.uiFont}
                  onChange={(e) => {
                    setCustomUiFont(e.target.value);
                    onUpdateSetting("uiFont", e.target.value);
                  }}
                />
              )}
            </div>

            {/* Code Font */}
            <div className="settings-row-col">
              <div className="settings-row">
                <div className="settings-label">等宽/代码字体</div>
                <select
                  className="settings-select"
                  value={isMonoFontCustom ? "custom" : settings.monoFont}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "custom") {
                      const next = customMonoFont || settings.monoFont;
                      onUpdateSetting("monoFont", next);
                    } else {
                      onUpdateSetting("monoFont", val);
                    }
                  }}
                >
                  {MONO_FONT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">自定义 (Custom)...</option>
                </select>
              </div>
              {isMonoFontCustom && (
                <input
                  type="text"
                  className="settings-input"
                  placeholder="CSS font-family"
                  value={customMonoFont || settings.monoFont}
                  onChange={(e) => {
                    setCustomMonoFont(e.target.value);
                    onUpdateSetting("monoFont", e.target.value);
                  }}
                />
              )}
            </div>
            <div
              className="settings-hint"
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "6px",
                lineHeight: "1.4",
              }}
            >
              提示：特定字体（如 Maple Mono CN NF）需在本机操作系统中安装后方可直接渲染。
            </div>
          </div>

          {/* Shortcuts Section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-title">快捷键 (Shortcuts)</div>
              <button
                type="button"
                className="settings-link-btn"
                onClick={() =>
                  onUpdateSetting("shortcuts", { ...DEFAULT_APP_SHORTCUTS })
                }
                title="将所有快捷键重置为默认值"
              >
                重置全部
              </button>
            </div>
            <div className="settings-shortcuts-list">
              {(Object.keys(SHORTCUT_INFO) as AppAction[]).map((action) => {
                const info = SHORTCUT_INFO[action];
                const binding =
                  (settings.shortcuts && settings.shortcuts[action]) ||
                  DEFAULT_APP_SHORTCUTS[action];
                const defaultBinding = DEFAULT_APP_SHORTCUTS[action];
                const isCustomized =
                  binding.key !== defaultBinding.key ||
                  Boolean(binding.ctrl) !== Boolean(defaultBinding.ctrl) ||
                  Boolean(binding.alt) !== Boolean(defaultBinding.alt) ||
                  Boolean(binding.shift) !== Boolean(defaultBinding.shift);
                const isRecording = recordingAction === action;

                return (
                  <div
                    key={action}
                    className={`shortcut-item ${isRecording ? "recording" : ""}`}
                  >
                    <div className="shortcut-info">
                      <span className="shortcut-label">{info.label}</span>
                      <span className="shortcut-desc">{info.description}</span>
                    </div>
                    <div className="shortcut-actions">
                      <button
                        type="button"
                        className={`shortcut-key-btn ${isRecording ? "recording" : ""} ${isCustomized ? "customized" : ""}`}
                        onClick={() => {
                          if (isRecording) {
                            setRecordingAction(null);
                          } else {
                            setRecordingAction(action);
                          }
                        }}
                        title={
                          isRecording
                            ? "按下组合键进行设置，或按 Esc 取消"
                            : "点击以录制新快捷键"
                        }
                      >
                        {isRecording ? (
                          <span className="shortcut-recording-text">
                            请按组合键...
                          </span>
                        ) : (
                          <kbd className="shortcut-kbd">
                            {formatShortcutBinding(binding)}
                          </kbd>
                        )}
                      </button>
                      {isCustomized && (
                        <button
                          type="button"
                          className="shortcut-reset-btn"
                          onClick={() => {
                            onUpdateSetting("shortcuts", {
                              ...settings.shortcuts,
                              [action]: { ...defaultBinding },
                            });
                          }}
                          title="恢复此快捷键为默认值"
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {conflictNotice && (
              <div className="shortcut-conflict-notice">
                {conflictNotice}
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <Button
            variant="secondary"
            size="sm"
            onClick={onResetSettings}
            title="恢复默认设置"
          >
            <RotateCcw size={13} style={{ marginRight: 4 }} />
            恢复默认
          </Button>

          <Button variant="primary" size="sm" onClick={onClose}>
            完成
          </Button>
        </div>
      </div>
    </div>
  );
};
