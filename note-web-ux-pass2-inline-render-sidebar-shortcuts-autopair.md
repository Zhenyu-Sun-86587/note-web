# Note Web UX Pass 2：行内即时渲染、可拖拽侧边栏、快捷键与 IDE 式成对输入

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 当前远端基线：
>
> `70e972737f24be837d95aea7d9be1f056b4f70e8`
>
> 提交：
>
> `feat(settings): add editor preferences and fix editor scrolling`
>
> 本轮来源：真实使用反馈。
>
> **注意：上一轮对第一个问题的理解有误。**
>
> 用户所说的“不会立即生效”不是 Settings 设置不能实时生效。
>
> 真正问题是：
>
> > **编辑正文时，Bold / Italic / Strike / Inline Code 等行内 Markdown 格式没有立即在 Vditor IR 中正确渲染，往往要刷新页面后才显示正确。**

本轮只处理 4 类体验问题：

1. 修复 Vditor IR 行内 Markdown 的即时渲染；
2. 左侧 Sidebar 支持鼠标拖拽调整宽度；
3. 整理并补全 Markdown / Save / Navigation 快捷键；
4. 增加 IDE 式成对符号输入，例如输入 `(` 自动得到 `()`。

不要把本轮扩成编辑器重构。

---

# 0. 当前架构继续保持

不要修改：

```text
React
Vite
TypeScript
Vditor IR
Express
Markdown Vault
Autosave
Revision conflict
Thin File API
```

不要更换：

```text
Milkdown
TipTap
CodeMirror
Monaco
```

Vditor IR 仍是当前编辑器。

---

# 1. 第一优先级：修复“行内格式必须刷新才生效”

## 1.1 用户实际症状

例如正文输入：

```md
这是 **加粗**
这是 *斜体*
这是 ~~删除线~~
这是 `行内代码`
```

或者：

1. 选中文字；
2. 点击 Toolbar 的 Bold / Italic / Strike / Inline Code；

当前可能出现：

```text
Markdown 内容已经改变
↓
autosave 甚至已经保存
↓
IR 页面仍显示 **text** / *text* / ~~text~~
↓
刷新浏览器
↓
才正确显示加粗 / 斜体 / 删除线
```

这是本轮最高优先级 bug。

---

# 2. 不要误把 Vditor IR 的“当前节点 marker 展开”当成 bug

Vditor IR 本身有一个正常行为：

> 光标位于某个 Markdown inline 节点内部时，可能显示其 Markdown marker，方便编辑。

例如光标正在 Bold 内部：

```text
**text**
```

可能暂时显示 marker。

这是 IR 的正常编辑体验。

真正验收要求是：

```text
输入 / Toolbar 操作完成
↓
光标移出该 inline 节点
或点击另一段
↓
格式必须立即成为 IR 渲染结果
```

绝不能要求：

```text
刷新页面
```

才能生效。

---

# 3. 当前最值得先排查的项目级原因：React value echo

当前 `VditorEditor.tsx` 有两条数据路径：

## Vditor → React

```ts
input: (val) => {
  onChangeRef.current(val);
}
```

然后：

```text
App draftContent 更新
```

---

## React → Vditor

当前又有：

```ts
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;

  const current = editor.getValue();

  if (current !== value) {
    syncingRef.current = true;
    editor.setValue(value);
    syncingRef.current = false;
  }
}, [value]);
```

这个逻辑本来是为了：

```text
外部磁盘修改
conflict reload
```

同步 Vditor。

但是：

> **本地 Vditor 输入本身也会让 `value` prop 更新。**

因此必须排除以下情况：

```text
Vditor IR 刚刚完成 incremental DOM processing
↓
input callback
↓
React setDraftContent
↓
value effect
↓
由于 Markdown normalization / timing 差异
current !== value
↓
editor.setValue(value)
↓
IR 当前 DOM / selection / marker 状态被重新灌入
```

这可能破坏 Vditor 自己的 incremental IR 生命周期。

---

# 4. 第一修复方向：区分 Local Echo 与 True External Update

不要删除 external value sync。

它对：

```text
Memos
Agent
外部编辑器
conflict reload
```

仍然重要。

正确做法是增加一个非常小的：

```ts
const lastEmittedValueRef = useRef(value);
```

---

## Local input

```ts
input: (val: string) => {
  if (syncingRef.current) return;

  lastEmittedValueRef.current = val;
  onChangeRef.current(val);
}
```

---

## External value effect

```ts
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;

  // 这是 Vditor 自己刚 emit 给 React 的内容，
  // 不要再 echo 回 Vditor。
  if (value === lastEmittedValueRef.current) {
    return;
  }

  const current = editor.getValue();

  if (current === value) {
    lastEmittedValueRef.current = value;
    return;
  }

  syncingRef.current = true;

  try {
    editor.setValue(value);
    lastEmittedValueRef.current = value;
  } finally {
    syncingRef.current = false;
  }
}, [value]);
```

允许按实际测试略微调整。

核心原则：

> **Local edit 不能被 React 再次 `setValue()` 回 Vditor。**

而：

> **真正的 external value 仍必须 `setValue()`。**

---

# 5. 不允许的“修复”

禁止：

```text
每次 input 后 editor.setValue(editor.getValue())
```

禁止：

```text
每次 Bold 后 setTimeout(setValue)
```

禁止：

```text
每 100ms 强制重新 parse 全文
```

禁止：

```text
保存成功后刷新页面
```

禁止：

```text
window.location.reload()
```

禁止：

```text
通过 React key 强制 destroy/recreate Vditor
```

这些只是把刷新问题藏起来。

---

# 6. Toolbar 行为应该继续由 Vditor 自己处理

不要自己实现：

```text
Bold button
Italic button
Strike button
Link button
```

Vditor IR Toolbar 已经有自己的：

```text
processToolbar()
```

路径。

项目只负责：

```text
初始化 Vditor
保存 Markdown
同步真正的 external value
```

不要包一层自制 Markdown toolbar engine。

---

# 7. 必须增加行内即时渲染 E2E

这是本轮必须新增的测试。

## Test A：Toolbar Bold

准备一个普通文本：

```text
hello world
```

选择：

```text
world
```

点击 Bold Toolbar。

检查：

```text
Markdown value
```

包含：

```md
**world**
```

然后点击另一段或移动 selection。

**不 reload 页面。**

验证 IR DOM 已表现为 Bold。

---

# 8. 如何判断“已经 Bold”

不要只检查：

```text
Markdown 中出现 **
```

因为当前 bug 正是：

```text
Markdown 已改变
但视觉没有渲染
```

必须检查 DOM / computed style。

优先：

```text
IR DOM 中对应 strong / data-type 节点存在
```

或者：

```ts
font-weight >= 600
```

根据 Vditor 3.11.3 实际 IR DOM 选择稳定断言。

---

# 9. Test B：直接输入 Markdown marker

在一个新段落中依次测试：

```md
**bold**
*italic*
~~strike~~
`code`
```

每项完成后：

```text
移动 caret 到别处
```

不允许 reload。

验证：

```text
Bold visually rendered
Italic visually rendered
Strike visually rendered
Inline code visually rendered
```

---

# 10. 如果 Local Echo 修复后仍然无法即时渲染

不要马上写 hack。

先做一个最小对照实验：

```text
同版本 Vditor 3.11.3
纯 standalone
mode: ir
相同 toolbar
无 React value sync
```

验证：

```text
Bold / Italic / Strike
```

是否正常即时渲染。

---

## 如果 standalone 正常

问题一定在：

```text
Note Web wrapper
CSS
event conflict
React sync
```

继续修 wrapper。

---

## 如果 standalone 本身也能稳定复现

再检查：

```text
当前 Vditor 官方版本
当前已知 issue
```

但不要擅自：

```text
降级到很旧版本
fork Vditor
修改 node_modules
```

如果需要升级 Vditor：

必须明确说明：

```text
old resolved version
new version
为什么升级
```

并重新跑 Markdown round-trip tests。

---

# 11. 第二个明确问题：全局快捷键正在与 Vditor 冲突

当前 Note Web 全局快捷键包含：

```text
Ctrl/Cmd+B -> Toggle Sidebar
Ctrl/Cmd+K -> Search
```

但是 Vditor 官方 Toolbar 本身使用：

```text
Ctrl/Cmd+B -> Bold
Ctrl/Cmd+K -> Link
```

因此这是直接冲突。

对于 Markdown 编辑器：

> **Markdown 编辑快捷键必须优先。**

---

# 12. 立即取消两个冲突

不要再使用：

```text
Ctrl/Cmd+B -> Sidebar
Ctrl/Cmd+K -> App Search
```

---

# 13. 推荐新的 App 快捷键

统一：

| 操作 | Windows/Linux | macOS |
|---|---|---|
| 保存 | Ctrl+S | Cmd+S |
| 新建笔记 | Ctrl+N | Cmd+N |
| 快速打开 | Ctrl+P | Cmd+P |
| 全文搜索 | Ctrl+Shift+F | Cmd+Shift+F |
| 切换 Sidebar | Ctrl+Shift+B | Cmd+Shift+B |
| 打开 Settings | Ctrl+, | Cmd+, |
| 关闭 Dialog | Esc | Esc |

---

# 14. Markdown 编辑快捷键交给 Vditor

必须保证这些在编辑器中可以正常使用：

```text
Ctrl/Cmd+B
Bold

Ctrl/Cmd+I
Italic

Ctrl/Cmd+K
Link

Ctrl/Cmd+Z
Undo

Ctrl/Cmd+Y
Redo
```

以及 Vditor 已存在的其他 Markdown hotkeys。

---

# 15. 不要在 window handler 中抢 Vditor 的格式快捷键

全局：

```ts
window.addEventListener("keydown", ...)
```

必须注意 target。

推荐：

```ts
const target = e.target as HTMLElement | null;

const insideVditor =
  target?.closest(".vditor") !== null;
```

对编辑格式相关 shortcut：

```text
insideVditor
→ 让 Vditor 自己处理
```

---

# 16. Save 快捷键例外

即使 focus 在 Vditor：

```text
Ctrl/Cmd+S
```

仍然应该：

```text
preventDefault()
saveNow()
```

因为浏览器默认是“保存网页”。

---

# 17. Quick Open / Search / Settings 可继续全局

例如：

```text
Ctrl+P
Ctrl+Shift+F
Ctrl+,
```

可以在 Vditor 内使用。

但必须确认没有和当前配置中的 Vditor Toolbar hotkey 冲突。

当前项目没有使用：

```text
both
preview
```

等对应 Ctrl+P Toolbar 项时，Ctrl+P 可以继续作为 Quick Open。

---

# 18. 快捷键不要做“自定义快捷键系统”

本轮不需要：

```text
Settings -> Keybindings
JSON keymap
command registry
command palette framework
```

只把常用固定快捷键整理正确即可。

---

# 19. Sidebar 必须支持鼠标拖拽调整宽度

当前：

```text
sidebar width
```

是固定：

```css
--sidebar-width: 280px;
```

用户希望像：

```text
IDE
VS Code
文件管理器
```

一样拖动边界。

---

# 20. Sidebar Resizer 目标

结构：

```text
┌──────────── Sidebar ────────────┐│ Main
│                                ││
│                                ││
└────────────────────────────────┘│
                                  ↑
                             drag handle
```

在：

```text
aside.sidebar-container
```

右侧增加：

```text
.sidebar-resizer
```

---

# 21. 推荐 Sidebar width 范围

```text
min = 200px
default = 280px
max = 520px
```

不要允许：

```text
0px
1500px
```

---

# 22. Sidebar 宽度应该持久化

当前已有：

```text
note-web-settings-v1
```

因此直接在：

```ts
AppSettings
```

增加：

```ts
sidebarWidth: number;
```

默认：

```ts
sidebarWidth: 280
```

---

# 23. Settings → CSS variable

增加：

```css
--sidebar-width: 280px;
```

由 runtime settings 设置：

```ts
--sidebar-width: ${settings.sidebarWidth}px;
```

---

# 24. Drag 实现保持简单

推荐使用：

```text
Pointer Events
```

不要同时分别写：

```text
mousedown
touchstart
mousemove
touchmove
```

---

## onPointerDown

记录：

```ts
startX
startWidth
```

---

## pointermove

```ts
const nextWidth = clamp(
  startWidth + event.clientX - startX,
  200,
  520,
);
```

实时更新视觉宽度。

---

## pointerup

持久化：

```ts
updateSetting("sidebarWidth", nextWidth);
```

---

# 25. 不要每移动 1px 就大量 localStorage 写

如果当前 `updateSetting()` 每次都会触发：

```text
React state
localStorage
applySettings
```

则拖拽时最好：

```text
pointermove
→ 只修改 CSS variable / local drag state

pointerup
→ 最终 updateSetting 一次
```

保持体验顺滑。

---

# 26. 可选：双击恢复默认 Sidebar Width

很容易的话：

```text
double click resizer
→ 280px
```

可以做。

不是必须。

不要增加 Sidebar preset 菜单。

---

# 27. Resizer CSS

建议：

```css
.sidebar-container {
  position: relative;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 20;
}

.sidebar-resizer:hover,
.sidebar-resizer.is-resizing {
  background: var(--accent);
}
```

不要让 handle 视觉一直很粗。

---

# 28. Sidebar collapsed 时禁用 Resizer

当：

```text
sidebar-collapsed
```

时：

```text
resizer
```

必须：

```text
pointer-events: none
```

或者不渲染。

---

# 29. 第四项：IDE 式成对符号输入

用户希望：

```text
输入 (
```

直接得到：

```text
()
```

Caret：

```text
(|)
```

---

# 30. 先验证 Vditor 已有能力

Vditor 自身已经实现过部分：

```text
[
`
{
"
'
```

的自动包裹/selection wrap。

因此：

> **不要重新实现 Vditor 已经存在的 pair。**

先在实际安装的：

```text
Vditor 3.11.3
```

中测试：

```text
(
[
{
"
'
`
```

分别表现如何。

---

# 31. 只补 Vditor 缺少的 pair

从用户反馈看，重点是：

```text
(
```

如果 Vditor 当前没有自动补：

```text
)
```

则只补：

```text
()
```

优先。

---

# 32. Parenthesis Auto Pair 最小行为

## 普通输入

用户输入：

```text
(
```

结果：

```text
()
```

Caret：

```text
(|)
```

---

## 有 selection

用户选中：

```text
hello
```

然后输入：

```text
(
```

结果：

```text
(hello)
```

---

## Skip closing pair

当前：

```text
(|)
```

用户输入：

```text
)
```

不要得到：

```text
())
```

而应该：

```text
()
 |
```

即移动到现有 `)` 后。

---

## Empty pair backspace

如果实现不复杂：

```text
(|)
```

Backspace：

```text
|
```

即同时删除：

```text
()
```

可以做。

如果会明显增加复杂度，可以本轮不做 pair delete。

---

# 33. 不要实现这些 pair

本轮不要自动配对：

```text
<>
```

因为 Markdown 中可能涉及：

```text
HTML
比较符号
URL
```

也不要做复杂：

```text
中文智能引号
数学括号匹配系统
LaTeX pair engine
```

---

# 34. Auto Pair 必须只作用于编辑器

不能在：

```text
Settings input
Search input
Rename dialog
New Note dialog
```

中拦截括号。

作用域必须：

```text
.vditor-ir .vditor-reset
```

---

# 35. Auto Pair 不要直接篡改 Markdown state

不要：

```ts
setDraftContent(...)
```

根据字符串位置自己拼 Markdown。

因为：

```text
DOM selection
IR AST
Markdown
```

会不同步。

应该让输入发生在：

```text
Vditor contenteditable
```

中，并让 Vditor 正常收到：

```text
input event
```

之后继续走：

```text
Vditor IR parse
→ input callback
→ React draft
→ autosave
```

---

# 36. Auto Pair 实现优先级

优先顺序：

1. 先确认 Vditor 本身是否能配置/已有；
2. 如果已有，不写任何代码；
3. 如果只缺 `()`，写一个很小的 Vditor-scoped keydown enhancement；
4. 不创建通用 editor extension framework。

---

# 37. Inline Rendering 和 Auto Pair 必须一起验证

例如输入：

```text
(
```

得到：

```text
()
```

然后中间输入：

```md
**hello**
```

必须：

```text
(**hello**)
```

在 caret 移开后立即渲染 Bold。

不能因为 auto-pair listener 又破坏 IR rendering。

---

# 38. 当前 Vditor Version

项目 `package.json`：

```json
"vditor": "^3.9.9"
```

当前 lock 实际解析：

```text
vditor 3.11.3
```

测试和诊断以：

```text
3.11.3
```

实际 runtime 为准。

不要根据 package range 误认为运行的是 3.9.9。

---

# 39. 不要顺手升级所有 npm dependencies

如果本轮不需要升级 Vditor：

```text
不要 npm update
```

不要让 lockfile 出现大量 unrelated update。

---

# 40. Settings 已经存在，本轮不要重做

当前已有：

```text
SettingsDialog
useSettings
theme
font
font size
line height
editor width
padding
UI font
mono font
```

用户本轮没有说 Settings 不能实时应用。

所以：

> **不要重新返工 Settings UI。**

只因为 Sidebar width 持久化需要：

```ts
sidebarWidth
```

可以扩展 AppSettings。

---

# 41. 编辑器滚轮问题上一轮已处理，本轮不要重做

当前已经增加：

```ts
height: "100%"
```

并调整 scroll viewport。

除非本轮改动导致 regression，否则不要继续改滚动 CSS。

---

# 42. 推荐实施顺序

## Phase 1：先复现 Inline Rendering Bug

不要一上来改代码。

先建立 E2E reproduction：

```text
select text
→ toolbar Bold
→ no reload
→ inspect IR DOM
```

以及：

```text
type **bold**
→ move caret away
→ no reload
→ inspect IR DOM
```

必须先有失败测试或明确人工复现步骤。

---

## Phase 2：修 Local Value Echo

修改：

```text
apps/web/src/components/editor/VditorEditor.tsx
```

增加：

```text
lastEmittedValueRef
```

确保：

```text
local Vditor edit
```

不会被：

```text
React value effect
```

再次 setValue。

---

## Phase 3：修快捷键冲突

修改：

```text
apps/web/src/hooks/useKeyboardShortcuts.ts
apps/web/src/App.tsx
```

把：

```text
Ctrl+B sidebar
Ctrl+K search
```

移走。

---

## Phase 4：Sidebar Resizer

修改：

```text
apps/web/src/components/layout/AppShell.tsx
apps/web/src/hooks/useSettings.ts
apps/web/src/styles/app.css
```

如需把 drag 逻辑单独放 hook：

```text
useSidebarResize.ts
```

只有逻辑超过约 50～70 行再拆。

不要提前抽象。

---

## Phase 5：Auto Pair

先测试 Vditor 原生 pair。

只补实际缺失的：

```text
()
```

不要重复实现已有功能。

---

## Phase 6：Tests

跑完整测试。

---

# 43. 必须保留的 Markdown 快捷键

至少人工验证：

```text
Ctrl/Cmd+B
→ Bold

Ctrl/Cmd+I
→ Italic

Ctrl/Cmd+K
→ Link

Ctrl/Cmd+Z
→ Undo

Ctrl/Cmd+Y
→ Redo
```

---

# 44. App 快捷键验收

```text
Ctrl/Cmd+S
→ immediate save

Ctrl/Cmd+N
→ new note

Ctrl/Cmd+P
→ quick open

Ctrl/Cmd+Shift+F
→ search

Ctrl/Cmd+Shift+B
→ sidebar toggle

Ctrl/Cmd+,
→ settings
```

---

# 45. 快捷键平台处理

继续：

```text
Windows/Linux = Ctrl
macOS = Cmd
```

不要用已弃用逻辑作为唯一判断。

如果当前：

```ts
navigator.platform
```

仍工作，可以暂时保留。

不需要为此专门重构 browser platform detection。

---

# 46. Toolbar Tooltips

Vditor Toolbar 本身会显示对应 hotkey。

不要再开发一套快捷键提示 UI。

如果项目按钮：

```text
Save
Settings
Quick Open
```

有 tooltip，可以在 label 里标出：

```text
保存 (Ctrl+S)
设置 (Ctrl+,)
```

这是可选小修。

---

# 47. Sidebar Resize E2E

增加一个高价值 E2E：

```text
initial width = 280
↓
drag resizer right
↓
width > 280
↓
reload
↓
width remains
```

允许 2～5px 浮动。

---

# 48. Inline Rendering E2E 是本轮最重要测试

必须做到：

```text
没有 page.reload()
```

的情况下通过。

如果测试代码里为了让 Bold 生效出现：

```ts
await page.reload()
```

本轮任务视为失败。

---

# 49. Auto Pair E2E

最少：

```text
click editor
type "("
```

断言编辑器 Markdown 最终包含：

```text
()
```

然后继续输入：

```text
hello
```

应该得到：

```text
(hello)
```

而不是：

```text
()hello
```

说明 caret 正确位于中间。

---

# 50. 不破坏 External Value Sync

修 Local Echo 后必须重新验证：

```text
浏览器 clean A
↓
外部修改 A
↓
focus refresh
↓
Vditor 显示 external 新内容
```

以及：

```text
conflict reload
↓
Vditor 立即显示 disk 内容
```

不能为了即时渲染把 external sync 删除。

---

# 51. 不破坏 Autosave

Inline toolbar 操作后：

```text
Bold
Italic
Strike
```

必须：

```text
draft dirty
↓
autosave
↓
Markdown file 保存对应 marker
```

例如：

```md
**bold**
```

仍然是磁盘 Markdown。

不要保存成 HTML：

```html
<strong>bold</strong>
```

---

# 52. 不允许把 editor mode 改成 WYSIWYG 来逃避问题

本轮不要：

```ts
mode: "wysiwyg"
```

来掩盖 IR incremental rendering bug。

当前目标仍是：

```text
Vditor IR
Typora-like
Markdown persistence
```

---

# 53. 不添加以下功能

本轮不要顺手做：

```text
Outline
Vim
Focus Mode
Typewriter Mode
Tabs
Backlinks
Graph
Git
Memos
Notion
AI
Command Palette framework
Custom keybindings editor
Plugin system
```

---

# 54. 建议修改文件范围

主要：

```text
apps/web/src/components/editor/VditorEditor.tsx
apps/web/src/hooks/useKeyboardShortcuts.ts
apps/web/src/components/layout/AppShell.tsx
apps/web/src/hooks/useSettings.ts
apps/web/src/App.tsx
apps/web/src/styles/app.css
```

测试：

```text
apps/web/src/tests/...
e2e/...
```

原则上：

```text
apps/server/
```

不需要改。

---

# 55. 测试命令

完成后必须：

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

全部 PASS。

---

# 56. 人工体验验收

## Inline Bold

```text
选中文本
→ Ctrl+B
→ 立即 Bold
```

---

## Inline Italic

```text
选中文本
→ Ctrl+I
→ 立即 Italic
```

---

## Link

```text
选中文本
→ Ctrl+K
→ Vditor Link 行为
```

绝不能再弹 Note Web Search。

---

## Sidebar

```text
鼠标拖右边界
→ Sidebar 变宽
```

```text
拖左
→ Sidebar 变窄
```

```text
reload
→ Width 保留
```

---

## Pair

```text
(
→ ()
```

caret 在中间。

---

## Save

```text
Ctrl+S
→ Save
```

不会触发浏览器 Save Page。

---

# 57. Git 提交

完成后只提交本轮相关改动。

建议：

```text
feat(editor): fix inline rendering and add editor ergonomics
```

不要 squash 前面的稳定 RC commit。

---

# 58. Agent 返回格式

## Root Cause

第一项必须明确回答：

```text
为什么 Bold/Italic IR 需要刷新？
```

不要只写：

```text
fixed rendering issue
```

必须说明实际观察到的原因，例如：

```text
React value echo caused setValue during local IR edits
```

或者：

```text
global shortcut intercepted Vditor hotkey
```

或者实际查到的其他原因。

---

## Changes

按文件列：

```text
VditorEditor.tsx
- ...

useKeyboardShortcuts.ts
- ...

AppShell.tsx
- ...

useSettings.ts
- ...

app.css
- ...

e2e
- ...
```

---

## UX Fixed

```text
[ ] Bold renders without reload
[ ] Italic renders without reload
[ ] Strike renders without reload
[ ] Inline code renders without reload
[ ] Ctrl+B belongs to Bold
[ ] Ctrl+K belongs to Link
[ ] Ctrl+S saves
[ ] Ctrl+P quick opens
[ ] Ctrl+Shift+F searches
[ ] Ctrl+Shift+B toggles sidebar
[ ] Ctrl+, opens settings
[ ] Sidebar is mouse-resizable
[ ] Sidebar width persists
[ ] "(" auto-pairs to "()"
[ ] Local edits do not echo setValue back into Vditor
[ ] External disk updates still sync into Vditor
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

# 59. 最终停止条件

以上 4 类体验问题修复后：

```text
Inline IR live formatting
Resizable Sidebar
Shortcuts
Auto Pair
```

完成即停止。

不要继续“顺便优化编辑器”。

本轮目标是：

> 从“可以写”推进到“编辑动作像正常桌面 Markdown 编辑器一样即时、自然”。

