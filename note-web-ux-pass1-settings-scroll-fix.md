# Note Web UX Pass 1 修复任务

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 分支：`main`
>
> 当前远端基线：
>
> `48395ea04cc437893f68da8301445fb855915311`
>
> 当前版本状态：
>
> - 数据正确性 RC 已通过；
> - Markdown Vault / autosave / conflict / symlink / E2E 已完成前几轮返修；
> - 本轮开始处理实际使用中的编辑体验问题。
>
> 本轮只处理：
>
> 1. 增加 Settings 设置界面；
> 2. 修复编辑器无法通过鼠标滚轮自由滚动的问题。
>
> 不做其他功能扩展。

---

# 0. 任务性质

这是 **UX Pass 1**。

不是：

- 新架构；
- 后端配置系统；
- 数据库配置中心；
- 大规模 UI redesign；
- 编辑器替换；
- 安全加固；
- PKM 功能开发。

当前基础架构保持不变：

```text
React
Vite
TypeScript
Vditor IR
Express
Markdown Vault
localStorage
CSS variables
```

本轮目标是：

> 在不改变 Markdown 数据路径的前提下，把“可长期写作”的基本设置和滚动体验补齐。

---

# 1. 问题一：缺少统一 Settings 设置界面

当前已经存在一些可配置能力，但都散落在代码里：

```text
Theme:
light / dark
存储于 localStorage

CSS variables:
--font-ui
--font-editor
--font-mono
--editor-max-width
--editor-font-size
--editor-line-height
```

说明：

> 设置能力已经具备基础，不需要新增后端配置 API。

本轮应该做一个：

```text
Settings Dialog
+
useSettings()
+
localStorage
+
CSS Variables
```

即可。

---

# 2. 设置系统设计原则

## 2.1 设置只属于 WebUI

设置不写进 Markdown。

设置不写进 Vault。

设置不写入数据库。

设置不需要服务器同步。

第一版直接：

```text
浏览器 localStorage
```

即可。

---

## 2.2 单一 localStorage key

统一使用：

```text
note-web-settings-v1
```

不要拆成十几个 key。

---

# 3. Settings 数据结构

建议：

```ts
export type ThemePreference =
  | "system"
  | "light"
  | "dark";

export interface AppSettings {
  theme: ThemePreference;

  editorFont: string;
  editorFontSize: number;
  editorLineHeight: number;
  editorMaxWidth: number | null;
  editorPaddingX: number;

  uiFont: string;
  monoFont: string;
}
```

---

# 4. 默认值

建议默认：

```ts
export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",

  editorFont:
    '"Georgia", "Cambria", "Times New Roman", serif',

  editorFontSize: 16,

  editorLineHeight: 1.75,

  editorMaxWidth: 900,

  editorPaddingX: 48,

  uiFont:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',

  monoFont:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};
```

不要搞设备 profile。

不要搞 responsive preset。

---

# 5. 第一版 Settings UI 必须包含

至少：

## Appearance

### Theme

```text
跟随系统
浅色
深色
```

---

## Editor

### Editor Font

提供预设：

```text
Serif
Sans
Mono
```

并允许：

```text
Custom font-family
```

自定义只保存 CSS font-family 字符串。

不要上传字体文件。

不要复制字体文件。

---

### Font Size

范围建议：

```text
12px – 28px
```

step：

```text
1px
```

---

### Line Height

范围建议：

```text
1.2 – 2.4
```

step：

```text
0.05
```

---

### Editor Width

建议：

```text
600 – 1400px
```

step：

```text
50px
```

以及一个：

```text
无限宽 / Full width
```

选项。

实现可以：

```ts
editorMaxWidth: null
```

---

### Horizontal Padding

建议：

```text
16 – 96px
```

step：

```text
4px
```

---

## UI

### UI Font

预设：

```text
System
Sans
Custom
```

---

### Code Font

预设：

```text
System Mono
Custom
```

---

## Reset

按钮：

```text
恢复默认设置
```

点击后：

```text
恢复 DEFAULT_SETTINGS
```

不需要确认弹窗。

---

# 6. 不要在第一版设置中加入

本轮明确不要加：

```text
Vim mode
行号
Typewriter Mode
Focus Mode
Outline
Toolbar customization
autosave interval
Git settings
Memos settings
Notion settings
AI settings
快捷键编辑
语言选择
账号
服务器设置
Vault path
附件目录设置
```

这些不是当前 UX Pass 1。

---

# 7. 建议代码结构

只新增少量文件。

```text
apps/web/src/
├── components/
│   └── settings/
│       └── SettingsDialog.tsx
│
├── hooks/
│   └── useSettings.ts
│
├── styles/
│   └── settings.css
│
└── ...
```

如果需要类型单独放：

```text
apps/web/src/types/settings.ts
```

但不是必须。

不要创建：

```text
settings/
  store/
  reducer/
  services/
  repository/
  providers/
  adapters/
```

---

# 8. useSettings 设计

推荐：

```ts
export function useSettings() {
  const [settings, setSettings] =
    useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings),
    );

    applySettings(settings);
  }, [settings]);

  const updateSetting = ...;
  const resetSettings = ...;

  return {
    settings,
    updateSetting,
    resetSettings,
  };
}
```

---

# 9. localStorage 读取必须简单容错

读取：

```ts
try {
  const raw =
    localStorage.getItem(SETTINGS_KEY);

  if (!raw) return DEFAULT_SETTINGS;

  const parsed = JSON.parse(raw);

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
  };
} catch {
  return DEFAULT_SETTINGS;
}
```

不要引入 schema validation library。

不要引入 Zod 只为了几项 UI settings。

---

# 10. Theme 处理

当前已有：

```text
useTheme.ts
```

不要保留：

```text
useTheme + useSettings
```

两套独立 theme source。

应该让：

```text
settings.theme
```

成为唯一 theme preference。

---

# 11. ThemePreference 规则

如果：

```text
settings.theme = "light"
```

应用：

```html
<html data-theme="light">
```

如果：

```text
dark
```

应用：

```html
<html data-theme="dark">
```

如果：

```text
system
```

根据：

```js
window.matchMedia(
  "(prefers-color-scheme: dark)"
)
```

计算当前实际主题。

---

# 12. system theme 应监听系统变化

如果用户选择：

```text
跟随系统
```

则系统从：

```text
Light → Dark
```

时界面应该自动切换。

只需要：

```js
matchMedia.addEventListener(
  "change",
  handler
)
```

不要建立主题服务。

---

# 13. TopBar 设置入口

当前 TopBar 右侧已经有：

```text
保存
更多操作
Theme toggle
```

建议：

> 用 Gear 设置按钮替代“单独 Theme toggle”作为主要入口。

可以保留快速明暗按钮，但不是必须。

更推荐：

```text
[保存] [更多] [⚙]
```

Gear：

```ts
<Settings size={18} />
```

点击：

```text
setSettingsOpen(true)
```

---

# 14. Settings Dialog

继续使用项目现有 modal 样式。

不要引入新的 UI component library。

结构：

```text
Settings
├── Appearance
│   └── Theme
├── Editor
│   ├── Font
│   ├── Font Size
│   ├── Line Height
│   ├── Width
│   └── Horizontal Padding
├── UI
│   ├── UI Font
│   └── Code Font
└── Reset Defaults
```

---

# 15. 设置必须实时预览

例如拖动：

```text
Font Size
```

编辑器应该立即变化。

调整：

```text
Line Height
```

立即变化。

调整：

```text
Editor Width
```

立即变化。

不要：

```text
Save Settings
→ reload
```

设置本身可以立即保存到 localStorage。

---

# 16. CSS Variable 映射

现有 CSS 已经使用：

```css
--font-ui
--font-editor
--font-mono
--editor-max-width
--editor-font-size
--editor-line-height
```

新增：

```css
--editor-padding-x
```

然后：

```css
.vditor-reset {
  padding:
    32px
    var(--editor-padding-x)
    !important;
}
```

---

# 17. Settings 到 CSS Variables

例如：

```ts
root.style.setProperty(
  "--font-editor",
  settings.editorFont,
);

root.style.setProperty(
  "--editor-font-size",
  `${settings.editorFontSize}px`,
);

root.style.setProperty(
  "--editor-line-height",
  String(settings.editorLineHeight),
);

root.style.setProperty(
  "--editor-padding-x",
  `${settings.editorPaddingX}px`,
);
```

Editor width：

```ts
if (settings.editorMaxWidth === null) {
  ...
} else {
  ...
}
```

---

# 18. custom.css 优先级必须保留

项目已经支持：

```text
custom.css
```

作为高级用户最终覆盖层。

不要让 Settings runtime style 永远压过 custom.css。

理想 CSS 顺序：

```text
variables.css
theme.css
app.css
vditor-overrides.css
runtime settings
custom.css
```

也就是说：

```text
GUI Settings
```

是普通用户配置。

```text
custom.css
```

仍然是高级用户最终 override。

---

# 19. 推荐 runtime style 实现

可以创建：

```html
<style id="note-web-runtime-settings">
```

动态更新：

```css
:root {
  --editor-font-size: 18px;
  --editor-line-height: 1.8;
  ...
}
```

然后确保：

```text
/custom.css
```

仍然最后加载。

如果当前 DOM/CSS 结构更适合直接：

```js
document.documentElement.style.setProperty()
```

也可以用，但必须验证 `custom.css` 还能覆盖。

不要为了这个建立 theme compiler。

---

# 20. 问题二：鼠标滚轮不能自由滚动

用户当前真实行为：

```text
书写过程中
鼠标滚轮无法自由向上/向下浏览
只能随着光标位置变化
```

这是编辑器基本交互 bug。

必须修。

---

# 21. 当前布局问题

现在多个外层容器都使用：

```css
overflow: hidden;
```

包括：

```text
.app-shell
.main-container
.editor-pane
.editor-wrapper
```

而：

```css
.editor-container {
  height: 100%;
  width: 100%;
}
```

Vditor 本身创建时没有明确：

```ts
height: "100%"
```

因此可能出现：

```text
Vditor content 自身扩张
+
外层全部 overflow hidden
+
没有一个真正承担滚动的 viewport
```

结果：

```text
页面无法正常 wheel scroll
```

---

# 22. 修复原则

不要监听：

```text
wheel
```

不要：

```js
preventDefault()
scrollBy()
```

不要自己实现滚轮。

不要做 JS 滚动补丁。

正确方式：

> 建立一个正常的 CSS scroll viewport。

---

# 23. Vditor 配置

创建 Vditor 时明确：

```ts
height: "100%",
```

即：

```ts
new Vditor(hostId, {
  mode: "ir",
  height: "100%",
  ...
});
```

---

# 24. Editor 布局

目标：

```text
editor-pane
└── editor-wrapper
    └── editor-container
        └── .vditor
            ├── toolbar
            └── .vditor-content
                └── .vditor-ir
                    └── .vditor-reset
```

---

# 25. CSS 最小修法

建议：

```css
.editor-pane {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-container {
  height: 100%;
  width: 100%;
  min-height: 0;
}

.editor-container > .vditor {
  height: 100% !important;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vditor-toolbar {
  flex-shrink: 0;
}

.vditor-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.vditor-ir {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto !important;
  overflow-x: hidden;
  overscroll-behavior: contain;
}
```

---

# 26. `.vditor-reset` 不承担滚动

`.vditor-reset` 只负责：

```text
正文宽度
字体
字号
行高
padding
```

不要给它：

```css
overflow-y: auto
height: 100%
```

滚动 viewport 应该是：

```text
.vditor-ir
```

或通过实际 DOM 验证后选择 Vditor 的直接内容 scroll container。

原则：

> 一个滚动层即可。

---

# 27. 验收：鼠标滚轮

必须手工验证：

## Case 1

打开长文档。

光标位于：

```text
文档末尾
```

鼠标滚轮向上。

必须：

```text
自由滚到文档顶部
```

光标不需要变化。

---

## Case 2

停在文档中间。

滚轮上下。

页面应该完全跟随：

```text
wheel
trackpad
```

而不是光标。

---

## Case 3

滚动到远离 caret 的地方后继续输入。

浏览器/Vditor 可以自然把 caret 重新带回可视区域。

这是正常编辑器行为。

---

## Case 4

滚动时 Toolbar 必须保持可用。

不能让：

```text
整个 Vditor 连 toolbar 一起滚掉
```

如果当前 Vditor DOM 实际设计就是整体滚动，则优先保证正常编辑体验，不必强行 sticky toolbar。

---

# 28. 不启用 Typewriter Mode 来解决滚动

当前 Vditor 没有显式：

```ts
typewriterMode: true
```

所以不能把当前问题解释成：

```text
Typewriter Mode
```

也不要增加：

```text
关闭 Typewriter Mode
```

设置来绕过滚动 bug。

先修正常 scroll viewport。

---

# 29. Settings 与滚动必须相互兼容

调整：

```text
font size
line height
editor width
padding
```

后：

```text
scroll height
```

必须自然重新计算。

不能出现：

```text
调字号后滚动失效
```

所以不要缓存：

```text
scrollHeight
```

也不要用 JS 固定正文高度。

---

# 30. Settings 第一版不需要后端测试

Settings 本质是 localStorage + CSS variables。

测试只需要少量 Web unit tests。

不要给 server 加 settings API。

---

# 31. 建议测试

## useSettings

测试：

```text
没有 localStorage
→ DEFAULT_SETTINGS
```

```text
localStorage 有值
→ merge defaults
```

```text
malformed JSON
→ fallback defaults
```

---

# 32. CSS settings 可以简单验证

如果测试方便：

```text
update editorFontSize
→ runtime style 包含 18px
```

即可。

不要测试浏览器 CSS engine。

---

# 33. Scroll E2E

建议增加一个小 E2E。

不要求模拟滚轮每个像素。

只验证：

```text
长文档
↓
editor scroll container
↓
scrollHeight > clientHeight
```

然后：

```js
element.scrollTop = 300;
```

断言：

```text
scrollTop > 0
```

如果 Playwright 的 wheel 稳定：

```ts
page.mouse.wheel(0, 500);
```

可额外检查：

```text
scrollTop 增加
```

不要为此引入新测试框架。

---

# 34. Settings E2E 非必须

如果很容易：

```text
打开 settings
→ 改字号
→ reload
→ 设置仍存在
```

可以做。

但不是必须。

重点是：

```text
滚轮修复
```

必须实际验证。

---

# 35. 不得破坏已有数据行为

完成 UX 修改后必须重新运行：

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

必须保持现有：

```text
autosave
sequential revision
conflict reload
external revision
asset symlink
edit/save/reload
```

测试全部通过。

---

# 36. 本轮不修改后端

原则上不需要改：

```text
apps/server/
```

因为：

```text
Settings = frontend localStorage
Scroll = frontend layout
```

如果发现后端完全无关，不要碰。

---

# 37. 本轮不修改 Markdown 数据模型

禁止：

```text
在 frontmatter 保存 UI settings
在 vault 根放 settings.json
写隐藏 .note-web 文件
```

当前设置属于：

```text
browser UI preference
```

不是 Markdown 数据。

---

# 38. 设置与 custom font

只允许用户输入：

```text
CSS font-family
```

例如：

```text
"Maple Mono", monospace
```

前提是字体已经通过：

```text
系统字体
custom.css
外部 /config/fonts CSS
```

可用。

不要实现：

```text
字体文件上传
字体文件复制
字体管理器
```

---

# 39. TopBar 改造建议

增加：

```text
Gear
```

Icon。

点击：

```text
SettingsDialog
```

主题 toggle 可以：

- 保留；
- 或移到 Settings。

建议保留快速 light/dark 切换也可以。

但是如果设置支持：

```text
system
```

则快速 toggle 的语义会变复杂。

更简单：

> Theme 完全进入 Settings，TopBar 只保留 Gear。

---

# 40. SettingsDialog 不需要 Apply/Cancel 事务

由于要求实时预览：

```text
调整
→ 立即生效
→ localStorage 保存
```

关闭 Settings 即可。

不要实现：

```text
Apply
Cancel
unsaved settings
settings draft transaction
```

---

# 41. Reset defaults

按钮：

```text
恢复默认
```

立即：

```ts
setSettings(DEFAULT_SETTINGS)
```

并立即更新界面。

足够。

---

# 42. Settings UI 推荐布局

桌面：

```text
┌───────────────────────────────┐
│ 设置                      ×   │
├───────────────────────────────┤
│ 外观                          │
│ 主题        [跟随系统 ▼]      │
│                               │
│ 编辑器                        │
│ 字体        [Serif ▼]         │
│ 字号        [16]              │
│ 行间距      [1.75]            │
│ 正文宽度    [900px]           │
│ 左右留白    [48px]            │
│                               │
│ 字体                          │
│ UI Font     [System]          │
│ Code Font   [System Mono]     │
│                               │
│ [恢复默认]                    │
└───────────────────────────────┘
```

不要做复杂 sidebar settings navigation。

现在设置数量太少。

---

# 43. Mobile

设置弹窗只需要：

```text
max-width
width: calc(100vw - margin)
max-height
overflow-y:auto
```

即可。

不要专门做 Mobile Settings page。

---

# 44. 推荐执行顺序

## Phase 1：Scroll Fix

先修滚动。

修改：

```text
apps/web/src/components/editor/VditorEditor.tsx
apps/web/src/styles/app.css
apps/web/src/styles/vditor-overrides.css
```

完成：

```text
height: 100%
正确 flex min-height: 0
.vditor-ir overflow-y: auto
```

先实际验证滚轮。

---

## Phase 2：Settings Core

新增：

```text
apps/web/src/hooks/useSettings.ts
```

定义：

```text
AppSettings
DEFAULT_SETTINGS
load
persist
apply
reset
```

---

## Phase 3：Settings Dialog

新增：

```text
apps/web/src/components/settings/SettingsDialog.tsx
apps/web/src/styles/settings.css
```

---

## Phase 4：App / TopBar

接：

```text
Gear
settingsOpen
SettingsDialog
```

将 theme 统一到 Settings。

---

## Phase 5：Tests

增加：

```text
useSettings test
scroll E2E
```

然后跑全套。

---

# 45. 代码约束

本轮禁止：

```text
Context + reducer
Zustand
Redux
MobX
settings backend API
database
React Query
theme library
new CSS framework
Tailwind migration
component library migration
```

当前普通 React state 足够。

---

# 46. 完成后的人工验收

必须实际执行：

## Settings

```text
修改主题
reload
仍保留
```

```text
修改字号
立即生效
reload
仍保留
```

```text
修改行高
立即生效
```

```text
修改 editor width
立即变化
```

```text
恢复默认
全部恢复
```

---

## Scroll

长笔记：

```text
鼠标滚轮上/下
```

正常。

Trackpad：

```text
两指滚动
```

正常。

滚动远离光标：

```text
不会马上自动跳回光标
```

只有继续输入时可以恢复 caret visibility。

---

# 47. 完成后的测试命令

必须运行：

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run test:e2e
```

全部 PASS。

---

# 48. Git 提交

完成后检查：

```bash
git diff
git status
```

确保只有 UX Pass 相关改动。

提交建议：

```text
feat(settings): add editor preferences and fix editor scrolling
```

如果当前工作流已经授权 push：

```text
push main
```

并返回：

```text
commit SHA
git status
push result
```

---

# 49. Agent 返回格式

## Changes

按文件：

```text
apps/web/src/hooks/useSettings.ts
- ...

apps/web/src/components/settings/SettingsDialog.tsx
- ...

apps/web/src/components/layout/TopBar.tsx
- ...

apps/web/src/components/editor/VditorEditor.tsx
- ...

apps/web/src/styles/...
- ...
```

---

## UX Fixed

```text
[ ] Settings dialog added
[ ] theme system/light/dark persisted
[ ] editor font configurable
[ ] editor font size configurable
[ ] line height configurable
[ ] editor max width configurable
[ ] horizontal padding configurable
[ ] UI font configurable
[ ] mono font configurable
[ ] reset defaults works
[ ] settings persist across reload
[ ] custom.css remains final override
[ ] mouse wheel scrolling works
[ ] trackpad scrolling works
[ ] scrolling can move away from caret
[ ] no JS wheel interception added
```

---

## Verification

```text
npm run typecheck:
PASS / FAIL

npm test:
PASS / FAIL

npm run build:
PASS / FAIL

npm run test:e2e:
PASS / FAIL
```

---

## Git

```text
branch:
commit:
push:
git status:
```

---

# 50. 最终停止条件

以上两个用户实际问题修复后：

```text
Settings
+
Free mouse-wheel scrolling
```

完成并通过测试。

然后停止。

不要顺手做：

```text
Vim
行号
Outline
Focus
Typewriter
Git
n8n
Memos
Notion
AI
```

这些以后根据真实使用反馈再排。

本轮只把：

> “能安全写”

推进到：

> “能舒服地写”。

