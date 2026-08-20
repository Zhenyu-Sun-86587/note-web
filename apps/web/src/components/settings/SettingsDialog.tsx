import React, { useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { Button } from "../common/Button";
import { IconButton } from "../common/IconButton";
import type { AppSettings, ThemePreference } from "../../hooks/useSettings";
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
    label: "衬线体 (Serif)",
    value: '"Georgia", "Cambria", "Times New Roman", serif',
  },
  {
    label: "无衬线体 (Sans)",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    label: "等宽字体 (Mono)",
    value:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
];

const UI_FONT_PRESETS: { label: string; value: string }[] = [
  {
    label: "系统默认 (System)",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    label: "现代无衬线 (Sans)",
    value: '"Inter", "Helvetica Neue", Arial, sans-serif',
  },
];

const MONO_FONT_PRESETS: { label: string; value: string }[] = [
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
              <div className="settings-label">主题模式</div>
              <select
                className="settings-select"
                value={settings.theme}
                onChange={(e) =>
                  onUpdateSetting("theme", e.target.value as ThemePreference)
                }
              >
                <option value="system">跟随系统 (System)</option>
                <option value="light">浅色 (Light)</option>
                <option value="dark">深色 (Dark)</option>
              </select>
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
