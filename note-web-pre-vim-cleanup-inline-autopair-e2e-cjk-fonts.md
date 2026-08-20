# Note Web Pre-Vim Cleanup：Vditor 最后一轮收尾返修

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 当前远端 `main`：
>
> `94042fb34cc88dbecb270d6111f0b7eced3eb469`
>
> 相关提交：
>
> ```text
> fdaeea0b839bc265788dabf9003a9006f75f58f1
> fix(editor): close remaining IR and file-tree UX gaps
>
> 94042fb34cc88dbecb270d6111f0b7eced3eb469
> feat(settings): add Maple Mono CN NF font preset
> ```
>
> 本轮性质：
>
> **进入 CodeMirror 6 + Vim Mode 之前，对 Vditor IR / E2E / 中文字体做最后一次小范围收尾。**
>
> 本轮完成后：
>
> > **停止继续扩 Vditor 编辑能力。**
>
> 下一阶段单独开发：
>
> ```text
> CodeMirror 6
> +
> @replit/codemirror-vim
> +
> Vim Markdown Source Mode
> ```

---

# 0. 本轮只处理 4 项

只修：

```text
1. Bold / Italic 等 inline marker 在 caret 离开后没有立即收起
2. Auto Pair E2E 实际没有证明自动补全、caret、skip-close、selection-wrap
3. Folder Rename E2E 污染 tracked fixture，且没有真正验证 dirty flush
4. 中文字体支持和字体 fallback 设计不理想
```

不要再增加：

```text
Vim
CodeMirror
Outline
Focus Mode
Typewriter Mode
Tabs
Backlinks
Graph
Git
n8n
Memos
Notion
AI
Plugin System
Command Registry
```

---

# 1. 当前已经通过，不要返工

以下项目已经可以视为通过：

```text
Folder Rename 不再自动添加 .md
Rename parent folder 前会 flush 当前 descendant note
openNote.path 会在 folder rename 后 remap
expandedFolders 会 remap
Sidebar root context menu 已从整个 sidebar 缩到 sidebar-content
Context Menu 基础文件管理方向正确
Note Copy/Paste 使用 internal clipboard
Folder delete 保持 empty-only
Autosave / revision / conflict 主链正常
Sidebar resize 正常
Settings 基础结构正常
```

不要再重构这些部分。

---

# 2. P1：当前 Bold 测试并没有证明真实用户问题被修复

`fdaeea0` 对比上一提交实际没有修改：

```text
VditorEditor.tsx
vditor-overrides.css
```

主要只是增加了新的 E2E。

所以：

> 如果之前真实浏览器中仍存在 `**` marker 不立即收起，那么这次 commit 本身没有产品代码能够改变这个行为。

---

# 3. 当前 E2E 只证明 `<strong>` 存在

现测试大致：

```ts
await page.keyboard.press("Control+b");
await page.keyboard.type("细粒度");

const collapsedBoldEl =
  page.locator(".vditor-ir strong");

await expect(
  collapsedBoldEl.filter({
    hasText: "细粒度"
  })
).toBeVisible();
```

这只能证明：

```text
IR DOM 中已经生成 strong node
```

不能证明：

```text
** marker 已经立即隐藏
```

而真实反馈是：

> 行内加粗虽然实际已经生效，但 Markdown marker 会持续显示，往往刷新后才恢复正常视觉状态。

---

# 4. 当前 CSS 甚至主动允许 expand 状态显示 marker

现在：

```css
.vditor-ir__marker--bi {
  display: inline-block !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  font-size: 0 !important;
  opacity: 0 !important;
}

.vditor-ir__node--expand
  > .vditor-ir__marker--bi {
  display: inline !important;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
  font-size: 0.85em !important;
  opacity: 0.45 !important;
}
```

所以只要：

```text
vditor-ir__node--expand
```

没有及时撤掉：

```text
**
*
~~
```

就会继续显示。

---

# 5. 本轮必须把问题重新定义正确

不要再把问题定义为：

```text
Bold 有没有 parse
```

真正要验证：

> **caret 离开对应 inline node 后，该 node 是否立即退出 expand 状态，marker 是否立即隐藏。**

---

# 6. 必须建立精确 Inline Marker E2E

## Case A：Collapsed Ctrl+B

原文：

```text
神经网络不同层
```

将 caret 放在：

```text
神经网|络不同层
```

执行：

```text
Ctrl+B
type 细粒度
```

Markdown 必须：

```md
神经网**细粒度**络不同层
```

然后：

```text
ArrowRight / End / 点击另一段
```

离开 Bold inline node。

---

# 7. Bold 视觉验收必须同时检查两件事

## A. strong node 仍存在

例如：

```ts
await expect(
  page
    .locator(".vditor-ir strong")
    .filter({ hasText: "细粒度" })
).toBeVisible();
```

---

## B. 对应 `**` marker 已不可见

必须根据真实 DOM 找到该 strong node 对应：

```text
.vditor-ir__marker--bi
```

然后断言：

```text
not visible
```

或者：

```text
computed width == 0
font-size == 0
opacity == 0
```

根据 Vditor 实际 DOM 选择最稳定方式。

---

# 8. 不要只用 `strong` 断言

以下测试不足：

```ts
expect(strong).toBeVisible();
```

因为：

```text
strong 可见
+
** marker 也可见
```

这正是用户当前不满意的状态。

---

# 9. Manual Markdown 也必须测 marker collapse

输入：

```md
这是**中文加粗**测试
```

然后：

```text
移动 caret 到下一段
```

要求：

```text
中文加粗
```

仍然为 strong。

同时：

```text
**
```

不能继续视觉显示。

不能 reload。

---

# 10. Italic / Strike 同样做一次轻量回归

不要求新增大量测试。

至少人工确认：

```md
*斜体*
~~删除线~~
```

caret 离开后：

```text
marker 立即收起
```

如果 Bold 的根因修复自然适用于：

```text
em
s
```

不需要额外复杂实现。

---

# 11. 不允许刷新式修复

禁止：

```text
blur -> reload
format -> reload
save -> reload
```

禁止：

```ts
editor.setValue(
  editor.getValue()
);
```

禁止：

```text
离开 inline
→ 全文 setValue
```

这些会破坏：

```text
selection
undo
IR incremental state
```

---

# 12. 先确认 Vditor 原生 marker collapse 行为

建立 standalone Vditor 3.11.3：

```ts
new Vditor("editor", {
  mode: "ir",
  cache: {
    enable: false,
  },
  toolbar: [
    "bold",
    "italic",
    "strike",
    "inline-code",
  ],
});
```

执行：

```text
Ctrl+B
输入
离开 inline
```

观察：

```text
.vditor-ir__node--expand
```

是否自行撤销。

---

# 13. 如果 standalone 正常

则 Note Web 中有东西让：

```text
expand state
```

没有及时更新。

重点排查：

```text
自定义 CSS
capture keydown
React focus/selection
local value sync
MutationObserver
```

修项目层。

---

# 14. 如果 standalone 本身也持续显示 marker

则明确报告：

```text
Standalone reproduction: YES
```

然后再做最窄 Note Web 视觉 override。

---

# 15. 最窄视觉 override 原则

如果确定 Vditor 原生 expand 行为和用户需求不同：

可以针对：

```text
strong
em
s
```

这种简单 emphasis：

> 即使 node 处于 expand，也继续隐藏外侧 marker。

但：

不要一刀切：

```css
.vditor-ir__marker {
  display: none;
}
```

否则会破坏：

```text
link
image
math
code
heading
```

编辑。

---

# 16. Inline Code 不一定强制隐藏反引号

用户当前主要反馈是：

```text
Bold / Italic
```

Inline Code 的：

```text
`
```

有时在编辑中保留 marker 反而有价值。

不要为了统一视觉把所有 inline marker 都隐藏。

---

# 17. P1：Auto Pair 当前 E2E 没有证明自动补全存在

现在类似：

```ts
press("(");
press(")");
type("RoundText");

expect(...).toContainText("()RoundText");
```

这个测试即使：

```text
Auto Pair 代码完全不存在
```

也能通过。

因为用户手动输入：

```text
(
)
RoundText
```

本来就得到：

```text
()RoundText
```

---

# 18. Auto Pair Test A：真正证明 auto-close

必须：

```ts
await page.keyboard.press("(");
await page.keyboard.type("RoundText");
```

**不要手工输入 `)`。**

最终必须：

```text
(RoundText)
```

这同时证明：

```text
自动插入 )
+
caret 位于 pair 中间
```

---

# 19. 方括号

只输入：

```text
[
```

然后：

```text
SquareText
```

最终：

```text
[SquareText]
```

不能手动输入：

```text
]
```

---

# 20. 大括号

只输入：

```text
{
```

然后：

```text
CurlyText
```

最终：

```text
{CurlyText}
```

---

# 21. Auto Pair 测试必须精确匹配

不要：

```ts
toContainText("(RoundText)")
```

如果实际得到：

```text
((RoundText))
```

也可能产生误判。

优先验证：

```text
完整当前 paragraph text
```

或者：

```text
Vditor getValue()
```

中的精确 Markdown。

---

# 22. Test B：Skip Existing Close

流程：

```text
(
→ 自动 ()
→ caret 在中间
→ type abc
→ type )
```

最终必须：

```text
(abc)|
```

不能：

```text
(abc))|
```

---

同样测试：

```text
[abc]
{abc}
```

---

# 23. Test C：Selection Wrap

必须真正创建选区。

例如：

```text
abc
```

选中：

```text
abc
```

输入：

```text
(
```

必须：

```text
(abc)
```

---

同样：

```text
[abc]
{abc}
```

---

# 24. 当前 selection wrap 实现有潜在格式丢失问题

现代码：

```ts
const selectedText = range.toString();

document.execCommand(
  "insertText",
  false,
  `${openChar}${selectedText}${closeChar}`,
);
```

如果用户选中的是 IR 中已经格式化的：

```md
**bold**
```

视觉文本可能只是：

```text
bold
```

`range.toString()`：

```text
bold
```

再插入：

```text
(bold)
```

可能直接丢掉：

```md
** **
```

---

# 25. 必须验证格式化 selection

准备：

```md
**bold**
```

选中视觉上的：

```text
bold
```

输入：

```text
(
```

期望至少不能发生：

```text
Bold 格式被静默剥掉
```

---

# 26. 对格式化 selection 的建议

如果 Vditor IR 本身无法安全对复杂 selection 进行 DOM-preserving wrap：

那么：

> Selection Wrap 第一版只支持纯文本 selection。

对于跨 inline node / 富格式 selection：

```text
不要拦截
让 Vditor/浏览器原生处理
```

比静默丢格式更好。

---

# 27. 不要为 Pair 开发 DOM editor framework

禁止：

```text
AST selection mapper
Markdown source offset mapper
custom range serializer
```

当前目标只是：

```text
() [] {}
```

简单 IDE 式输入。

---

# 28. P1：Folder Rename E2E 会污染 tracked fixture

当前：

```text
test-vault/projects/example.md
```

是 tracked fixture：

```md
# Project Example

This is a project notes markdown file.
```

新 E2E：

```text
open projects/example.md
↓
type Flush-Token-...
↓
rename projects
↓
rename back
```

但 afterEach 只恢复：

```text
test-vault/inbox/welcome.md
```

没有恢复：

```text
projects/example.md
```

---

# 29. 必须保存并恢复 example.md

类似：

```ts
const exampleFixturePath =
  path.resolve(
    process.cwd(),
    "test-vault/projects/example.md",
  );

let originalExampleContent:
  string | null = null;
```

beforeAll：

```ts
if (
  fs.existsSync(
    exampleFixturePath
  )
) {
  originalExampleContent =
    fs.readFileSync(
      exampleFixturePath,
      "utf8",
    );
}
```

---

# 30. afterEach 必须恢复

注意 folder 可能暂时叫：

```text
renamed_projects
```

所以 cleanup 顺序应该稳妥：

```text
1. 如果 renamed_projects 存在，恢复为 projects
2. 再恢复 projects/example.md 原始内容
```

不要反过来。

---

# 31. 不允许测试成功后留下 dirty worktree

执行：

```bash
npm run test:e2e
```

后：

```bash
git status --short
```

必须为空。

这是本轮明确验收。

---

# 32. 当前 folder-rename test 也没有真正验证 flush

测试虽然叫：

```text
flushes dirty open note
```

但最终只检查：

```text
folder renamed
open note path remapped
```

没有检查：

```text
Flush-Token
```

真的保存到文件。

---

# 33. 必须验证 dirty flush

流程：

```text
open projects/example.md
↓
type unique Flush-Token
↓
不要等 autosave 自然结束
↓
立刻 rename parent folder
```

rename 成功后：

通过：

```text
API
或
磁盘 fixture
```

确认：

```text
renamed_projects/example.md
```

包含：

```text
Flush-Token
```

这样才能证明：

```text
folder rename 前 flush
```

真的发生。

---

# 34. Rename 后继续编辑也要验证一次

rename 后：

```text
openNote.path
=
renamed_projects/example.md
```

继续输入：

```text
After-Rename-Token
```

等待：

```text
已保存
```

确认：

```text
renamed_projects/example.md
```

包含新 token。

这样同时证明：

```text
openNote path remap
+
后续 autosave
```

没有 stale path。

---

# 35. 中文字体支持：当前默认值本身不适合中文

当前默认：

```ts
editorFont:
  '"Georgia", "Cambria",
   "Times New Roman", serif'
```

这套主要是西文字体。

中文字符会：

```text
fallback 到系统临时 CJK 字体
```

导致：

```text
中英文粗细不统一
字符高度不协调
标点风格不一致
不同平台差异很大
```

---

# 36. Maple Mono CN NF preset 目前只是字体名

当前 preset：

```css
"Maple Mono CN NF",
"Maple Mono",
ui-monospace,
SFMono-Regular,
Menlo,
Monaco,
Consolas,
monospace
```

注意：

> 应用没有真正加载 Maple 字体。

如果客户端没有安装：

```text
Maple Mono CN NF
```

浏览器会自动 fallback。

---

# 37. 不要把 preset 描述成“应用内置字体”

设置 UI 中应该保持真实语义。

建议 label：

```text
Maple Mono CN NF（本机已安装）
```

或者：

```text
Maple Mono CN NF (Local)
```

不要让用户误以为：

```text
选择后一定有该字体
```

---

# 38. 不分发字体文件

本项目继续：

```text
不打包
不上传
不复制
不分发
```

字体文件。

用户如果已经通过：

```text
系统安装
custom.css
自有 static/font 配置
```

加载字体即可。

---

# 39. 增加真正 CJK-aware 的字体 preset

至少增加：

## CJK Sans

```css
"PingFang SC",
"Hiragino Sans GB",
"Microsoft YaHei",
"Noto Sans CJK SC",
"Noto Sans SC",
"WenQuanYi Micro Hei",
sans-serif
```

label：

```text
中文无衬线 (CJK Sans)
```

---

# 40. CJK Serif

```css
"Songti SC",
"STSong",
"SimSun",
"Noto Serif CJK SC",
"Noto Serif SC",
serif
```

label：

```text
中文衬线 (CJK Serif)
```

---

# 41. CJK Mono / Coding

建议：

```css
"Maple Mono CN NF",
"Maple Mono CN",
"Sarasa Mono SC",
"Noto Sans Mono CJK SC",
"Microsoft YaHei Mono",
ui-monospace,
monospace
```

label：

```text
中文等宽 / 编程字体
```

注意：

```text
这些字体未必每台机器都有
```

但比：

```text
Menlo + 临时 CJK fallback
```

更合理。

---

# 42. 默认正文字体建议改成 CJK-first

当前系统明显以中文笔记为主要使用场景。

建议 DEFAULT：

```ts
editorFont:
  '"PingFang SC",
   "Hiragino Sans GB",
   "Microsoft YaHei",
   "Noto Sans CJK SC",
   "Noto Sans SC",
   sans-serif'
```

---

# 43. 为什么默认用 CJK Sans

好处：

```text
Windows
macOS
Linux
```

都有合理 fallback。

中文不会依赖：

```text
Georgia 缺字后的临时字体匹配
```

英文也可以由 CJK 字体自身或后续 fallback 正常显示。

---

# 44. 如果更偏 Markdown 书写感，也可以选 CJK Serif

但默认建议：

```text
CJK Sans
```

原因：

```text
UI + 长时间屏幕阅读
更稳定
```

Serif 保留为用户选项。

---

# 45. UI Font 同样应该 CJK-aware

当前：

```ts
uiFont:
  -apple-system
  BlinkMacSystemFont
  Segoe UI
  Roboto
  ...
```

macOS 和 Windows 通常会自行选中文 fallback，但 Linux 容易差异较大。

可以新增：

```text
系统中文 UI
```

preset。

---

# 46. Mono Font 需要明确 CJK coding fallback

当前 mono：

```text
Menlo
Monaco
Consolas
```

都不保证完整中文。

改成：

```css
"Maple Mono CN NF",
"Maple Mono CN",
"Sarasa Mono SC",
"Noto Sans Mono CJK SC",
ui-monospace,
SFMono-Regular,
Menlo,
Monaco,
Consolas,
monospace
```

作为：

```text
CJK Mono
```

preset。

---

# 47. 不需要检测字体文件是否真的存在

不要写：

```text
FontFace API
font availability scanner
font manager
```

第一版没必要。

如果用户选择：

```text
Maple Mono CN NF
```

但本机没有：

```text
正常 fallback
```

即可。

---

# 48. 可以简单提示 Local Font

UI 旁边小字：

```text
需要系统或浏览器环境中已安装该字体
```

足够。

不要做字体安装检测。

---

# 49. Settings custom font 继续保留

用户仍可输入：

```css
"Maple Mono CN NF", "Noto Sans CJK SC", sans-serif
```

不要限制。

---

# 50. 不要上传 Font

本轮禁止增加：

```text
Font Upload
Font Manager
woff2 hosting
Font directory browser
```

---

# 51. Maple preset 可以保留

不要删除。

只把它从：

```text
唯一所谓中文字体解决方案
```

变成：

```text
一个本机高级字体预设
```

即可。

---

# 52. 本轮建议修改文件

主要：

```text
apps/web/src/styles/vditor-overrides.css
apps/web/src/components/editor/VditorEditor.tsx
apps/web/src/components/settings/SettingsDialog.tsx
apps/web/src/hooks/useSettings.ts
e2e/note-edit.spec.ts
```

可能不需要全部修改。

根据真实 Bold root cause 决定。

---

# 53. 不需要改 Server

本轮原则上：

```text
apps/server/
```

完全不动。

因为：

```text
Inline marker
Auto Pair
E2E cleanup
Fonts
```

都是前端问题。

---

# 54. Inline root-cause 返回要求

Agent 最终必须写：

```text
Inline Marker Root Cause:

Standalone Vditor:
PASS / FAIL

Note Web:
...

Why <strong> existed while ** marker
still remained visible:
...

Final fix:
...
```

不能只说：

```text
fixed bold rendering
```

---

# 55. Auto Pair 返回要求

必须明确：

```text
() auto insert:
PASS

() caret inside:
PASS

() skip close:
PASS

() selection wrap:
PASS

[] auto insert:
PASS

[] caret inside:
PASS

[] skip close:
PASS

[] selection wrap:
PASS

{} auto insert:
PASS

{} caret inside:
PASS

{} skip close:
PASS

{} selection wrap:
PASS
```

---

# 56. Fixture 返回要求

必须：

```text
welcome.md restored:
PASS

projects/example.md restored:
PASS

renamed_projects cleanup:
PASS

npm run test:e2e
followed by
git status --short:
CLEAN
```

---

# 57. Folder Rename Flush 验收

必须：

```text
dirty token before rename:
PERSISTED

openNote path after rename:
CORRECT

new edit after rename:
PERSISTED

rename back:
PASS
```

---

# 58. Fonts 返回要求

明确：

```text
CJK Sans preset:
ADDED

CJK Serif preset:
ADDED

CJK Mono preset:
ADDED

Default editor font CJK-aware:
YES

Maple Mono marked as local/system-installed:
YES

No font file bundled:
YES
```

---

# 59. 必须运行测试

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

# 60. E2E 后必须检查 Git

运行：

```bash
git status --short
```

必须：

```text
空
```

如果存在：

```text
modified test-vault/...
```

任务不算完成。

---

# 61. 不要因为 Bold 难修就切 WYSIWYG

仍然：

```ts
mode: "ir"
```

禁止：

```text
改 WYSIWYG
改 SV
```

逃避问题。

---

# 62. 不要升级 Vditor，除非 standalone 明确证明版本 bug

如果：

```text
Standalone Vditor 3.11.3
```

也稳定存在同一 bug，并且 newer release 明确修复：

才可以考虑升级。

否则：

```text
不要 npm update
```

---

# 63. 如果必须升级 Vditor

报告必须写：

```text
Old:
3.11.3

New:
x.x.x

Reason:
...

Upstream fix:
...
```

并重新跑：

```text
Inline
Image
Autosave
E2E
```

---

# 64. 不要改变 Markdown source-of-truth

完成后磁盘仍然：

```md
**加粗**
*斜体*
~~删除~~
```

不要：

```html
<strong>
```

写入 Markdown 文件。

---

# 65. 不改变当前数据架构

继续：

```text
Vditor
↓
draftContent string
↓
useAutosave
↓
Thin File API
↓
Markdown
```

---

# 66. 本轮提交建议

```text
fix(editor): finish IR marker behavior and CJK font support
```

或者：

```text
fix(ux): close pre-vim editor and test gaps
```

---

# 67. Agent 返回格式

## Root Cause

```text
Inline marker root cause:
...

Standalone result:
...

Auto-pair existing behavior:
...

Fixture pollution root cause:
...

CJK font issue:
...
```

---

## Changes

```text
VditorEditor.tsx
- ...

vditor-overrides.css
- ...

SettingsDialog.tsx
- ...

useSettings.ts
- ...

note-edit.spec.ts
- ...
```

---

## Fixed

```text
[ ] Bold strong renders immediately
[ ] Bold marker hides immediately after caret leaves
[ ] Italic marker hides after caret leaves
[ ] Strike marker hides after caret leaves
[ ] Manual Chinese **bold** needs no reload
[ ] () really auto-closes
[ ] [] really auto-closes
[ ] {} really auto-closes
[ ] caret stays inside all three pairs
[ ] skip-close works
[ ] selection wrap is genuinely tested
[ ] formatted selection does not silently lose formatting
[ ] example.md fixture is restored
[ ] E2E leaves git status clean
[ ] folder rename dirty flush is truly verified
[ ] autosave works after folder rename
[ ] CJK Sans preset added
[ ] CJK Serif preset added
[ ] CJK Mono preset added
[ ] default editor font is CJK-aware
[ ] Maple Mono preset is clearly local-font dependent
[ ] no font files are bundled
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

git status --short after E2E:
CLEAN / DIRTY
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

# 68. 最终停止条件

这四项完成：

```text
Inline marker
Auto Pair test credibility
E2E fixture / flush credibility
CJK font support
```

然后：

> **停止 Vditor 主线返修。**

不要再增加 Vditor editor features。

下一阶段单独开启：

```text
UX Pass 4
CodeMirror 6
+
@replit/codemirror-vim
+
Vim Markdown Source Mode
```

这样可以让：

```text
IR Mode
```

继续负责：

```text
Typora-like Markdown visual editing
```

而：

```text
Vim Mode
```

负责：

```text
真正 modal raw Markdown editing
```

两者共享：

```text
同一个 draftContent
同一个 autosave
同一个 Markdown Vault
```

这次收尾完成后，再进入 Vim。
