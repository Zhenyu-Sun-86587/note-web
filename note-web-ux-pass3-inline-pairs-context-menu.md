# Note Web UX Pass 3：彻底修复行内 IR、完整括号成对输入、文件树右键管理

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 当前远端 `main` 基线：
>
> `2ffabb3314ff363beff0ea9f499a75d173da9ad6`
>
> 提交：
>
> `feat(editor): fix inline rendering and add editor ergonomics`
>
> 本轮来源：真实浏览器使用反馈。
>
> 当前截图已经证明：
>
> - Sidebar resize 已经存在；
> - Settings 已经存在；
> - 快捷键布局已经开始调整；
> - 但 **Vditor IR 行内加粗问题仍未真正解决**；
> - Auto Pair 只实现了 `()`，需求实际是 `() [] {}`；
> - 文件树缺少常见右键文件管理能力。

---

# 0. 本轮任务范围

只处理三组实际问题：

1. **彻底定位并修复 Vditor IR 行内格式不能正确即时呈现的问题**；
2. **实现 `() [] {}` 三类 IDE 式成对输入**；
3. **给文件树增加简单、可靠的右键文件管理菜单**。

同时顺手修正已经确认的快捷键提示文字错误。

不要继续开发：

```text
Outline
Vim
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
Command Framework
```

---

# 1. 第一优先级：行内 Bold / Italic / Strike / Inline Code 仍然没有修好

上一轮假设：

```text
React value echo
→ editor.setValue()
→ 打断 Vditor IR incremental DOM
```

因此加入：

```ts
lastEmittedValueRef
```

这个修复可以保留，因为 external value sync 需要区分 local echo。

但是：

> **真实截图说明，这并不是完整根因。**

所以本轮禁止继续围绕：

```text
lastEmittedValueRef
```

反复加更多 flag。

---

# 2. 当前截图给出的重要线索

截图中同时出现了两类现象。

## 现象 A

类似：

```md
细节**丰富受环境影响严重的VIS**结合起来
```

Markdown marker `**` 仍然可见。

---

## 现象 B

出现了：

```text
神经网****络不同层
```

即：

```md
****
```

作为一个空 Bold pair 留在正文中，而后续输入没有进入 pair 中间。

这说明至少需要分开排查：

1. **已有内容被 `**...**` 包裹后，IR 是否已经生成 strong node，但 marker 只是没有隐藏；**
2. **Collapsed caret 下点击 Bold / Ctrl+B 后，caret 是否真的进入 `****` 中间；**
3. **直接键入 Markdown marker 时，Vditor 是否重新 Spin 当前 block。**

不能把这三个情况当成同一个 bug。

---

# 3. 先理解 Vditor IR 的真实 DOM 模型

Vditor IR 并不是简单：

```html
<strong>text</strong>
```

它内部会保留 Markdown marker。

Vditor 官方 IR CSS：

```text
.vditor-ir__marker
```

正常情况下：

```text
width: 0
height: 0
overflow: hidden
```

只有当前 IR node 被标成：

```text
.vditor-ir__node--expand
```

时，marker 才可能重新显示。

所以：

> **看到 `**` 不一定代表 Markdown 没 parse。**

必须先检查 DOM。

---

# 4. 本轮必须建立 Debug Matrix

不要先改代码。

在真实 Note Web 页面建立下面 4 组实验。

---

## Case A：选中文字后 Toolbar Bold

文本：

```text
hello world
```

选中：

```text
world
```

点击：

```text
Bold
```

记录：

```text
editor.getValue()
IR DOM
selection
对应 node class
```

---

## Case B：选中文字后 Ctrl/Cmd+B

同样：

```text
hello world
```

选中：

```text
world
```

按：

```text
Ctrl/Cmd+B
```

记录同样的数据。

---

## Case C：Collapsed caret + Bold

正文：

```text
神经网络
```

caret 放在：

```text
神经网|络
```

点击 Bold 或：

```text
Ctrl/Cmd+B
```

此时预期：

```md
神经网**|**络
```

然后输入：

```text
不同层
```

必须最终：

```md
神经网**不同层**络
```

而不是：

```md
神经网****络不同层
```

---

## Case D：直接键入 Markdown

依次手动输入：

```md
**bold**
*italic*
~~strike~~
`code`
```

然后：

```text
ArrowRight
ArrowDown
点击下一段
```

不能刷新。

记录：

```text
Markdown value
IR DOM
visual state
```

---

# 5. Debug 时必须判断三种实际状态

## State 1：已经 parse，只是 marker 可见

例如 DOM 已经存在：

```html
<span data-type="strong" ...>
```

或者 Vditor 3.11.3 对 strong 使用的实际 inline node。

内容本身已经 bold。

但是祖先有：

```text
vditor-ir__node--expand
```

导致：

```text
**
```

可见。

这种情况：

> 这是 IR presentation / marker 展开问题。

不要调用：

```ts
setValue()
```

修。

---

## State 2：根本没有 strong node

DOM 只是普通文本：

```text
**bold**
```

这种情况才属于：

> Vditor 当前 block 没有重新 parse。

需要查：

```text
input event
composition
selection
custom keydown
Vditor processToolbar
```

---

## State 3：生成 `****`，但 caret 不在中间

这种情况属于：

> Toolbar/caret insertion bug。

重点查：

```text
processToolbar
wbr
selection
focus/blur
项目自己的 capture keydown
```

不要把它当成 CSS 问题。

---

# 6. 必须把诊断结果写进 Agent 返回

最终不能只说：

```text
fixed inline rendering
```

必须明确写：

```text
Case A root cause:
...

Case B root cause:
...

Case C root cause:
...

Case D root cause:
...
```

如果不同 Case 根因不同，分别说明。

---

# 7. Standalone Vditor 对照测试变成强制要求

上一轮只是建议。

这一轮：

> **必须执行。**

建立一个极小 standalone 页面：

```html
<div id="vditor"></div>
```

仅：

```ts
new Vditor("vditor", {
  mode: "ir",
  cache: { enable: false },
  toolbar: [
    "bold",
    "italic",
    "strike",
    "inline-code"
  ]
});
```

使用项目 lockfile 实际版本：

```text
Vditor 3.11.3
```

然后执行：

```text
Case A
Case C
Case D
```

---

# 8. 根据 standalone 结果决定修复位置

## 如果 standalone 正常

则 bug 一定在 Note Web：

```text
React wrapper
event listener
CSS
value sync
selection/focus lifecycle
```

修项目代码。

---

## 如果 standalone 同样失败

说明这是：

```text
Vditor 3.11.3 IR 原生行为 / bug
```

这时不要假装是 Note Web wrapper。

必须在报告中明确：

```text
Standalone reproduction: YES
```

然后再选择最小 workaround。

---

# 9. 不允许继续猜

禁止：

```text
可能是 React
所以再加一个 ref
```

禁止：

```text
可能是 CSS
所以强制 font-weight
```

禁止：

```text
可能是解析
所以每次 setValue
```

必须先根据 DOM 和 standalone 结果判断。

---

# 10. 如果是“marker 展开”问题

如果实际结果证明：

```text
strong node 已经存在
content 已经 bold
只是 `**` marker 在当前 inline node 可见
```

而用户需求明确是：

> 像 Typora 一样，行内格式应保持视觉效果，不应该长时间暴露 `**`。

则允许增加一个非常窄的 Note Web CSS override。

目标：

```text
Bold / Italic / Strike marker
```

即使当前 node expand，也尽量隐藏。

---

## 注意

只隐藏：

```text
bold
italic
strike
```

这类简单 inline emphasis marker。

不要一刀切隐藏所有：

```text
.vditor-ir__marker
```

否则会破坏：

```text
link URL 编辑
code marker
heading
math
image
```

---

## 选择器

不要猜 selector。

先在真实 DOM 中确认：

```text
strong
em
s
```

对应的：

```text
data-type
marker class
```

然后写最小 CSS。

---

# 11. 如果是 collapsed Bold caret 问题

目标必须满足：

```text
text|
Ctrl+B
```

结果：

```text
text**|**
```

之后输入：

```text
abc
```

结果：

```text
text**abc**
```

---

## 不允许

不能用：

```ts
setDraftContent(
  content.slice(0, pos) + "****" + ...
)
```

因为 React 字符串位置和 IR DOM range 不同。

---

## 优先

继续让：

```text
Vditor processToolbar
```

负责 Markdown insertion。

修：

```text
selection
focus
event interference
```

---

# 12. 注意当前项目新增了 capture keydown

当前 `VditorEditor.tsx`：

```ts
hostEl.addEventListener(
  "keydown",
  handleKeyDown,
  true
);
```

这里：

```text
true
```

表示 capture phase。

当前 listener 虽然只主动处理：

```text
(
)
```

但本轮扩成：

```text
() [] {}
```

前必须非常小心：

> 不要破坏 Vditor 自己的 keydown / hotkey / selection lifecycle。

---

# 13. Auto Pair 建议优先接入 Vditor `keydown` option

Vditor 自己支持：

```ts
keydown(event)
```

callback。

优先研究是否可以把 Note Web 的补充 pair logic 放在：

```text
Vditor options.keydown
```

而不是：

```text
host capture listener
```

这样事件顺序更可控。

如果实际测试证明 capture listener 没有副作用，也可以保留。

但必须有依据。

---

# 14. 第二组需求：完整 Auto Pair

用户明确要求：

```text
()
[]
{}
```

不是只有：

```text
()
```

---

# 15. 三类 Pair 行为必须一致

定义：

```ts
const PAIRS = {
  "(": ")",
  "[": "]",
  "{": "}",
};
```

但不要机械实现。

先验证 Vditor 3.11.3 原生行为。

---

# 16. 先测试 Vditor 原生

分别测试：

```text
(
[
{
```

在：

```text
collapsed caret
selected text
```

下的表现。

Vditor 历史上已经实现过一部分：

```text
[
{
"
'
`
```

自动包裹逻辑。

所以：

> 已经原生正常的 pair 不要重复拦截。

否则可能得到：

```text
[[]]
{{}}
```

---

# 17. 最终必须保证 `() [] {}` 都有这些行为

## Empty caret

输入：

```text
(
```

得到：

```text
(|)
```

---

输入：

```text
[
```

得到：

```text
[|]
```

---

输入：

```text
{
```

得到：

```text
{|}
```

---

# 18. Selection wrap

选中：

```text
hello
```

输入：

```text
(
```

得到：

```text
(hello)
```

输入：

```text
[
```

得到：

```text
[hello]
```

输入：

```text
{
```

得到：

```text
{hello}
```

---

# 19. Skip closing pair

当前：

```text
(|)
```

输入：

```text
)
```

应该只是：

```text
()|
```

不是：

```text
())|
```

---

同理：

```text
[|]
→ type ]
→ []|
```

```text
{|}
→ type }
→ {}|
```

---

# 20. 可选：empty-pair Backspace

如果能在很少代码内完成：

```text
(|)
Backspace
→ |
```

同理：

```text
[|]
{|}
```

可以做。

如果需要明显复杂化：

> 本轮不做。

---

# 21. 不做尖括号

禁止自动：

```text
<>
```

Markdown / HTML 场景容易冲突。

---

# 22. 第三组需求：文件树右键菜单

用户要求：

> 右键应该有一定文件管理能力。

当前 FileTree：

```text
folder hover:
new note
new folder
delete empty folder

note:
只有 click open
```

没有标准 context menu。

本轮增加。

---

# 23. Context Menu 第一版目标

## Note 右键

菜单：

```text
打开
重命名
移动到...
复制
────────
删除
```

---

## Folder 右键

菜单：

```text
新建笔记
新建子目录
重命名
粘贴
────────
删除
```

---

## Sidebar 空白区域右键

菜单：

```text
新建笔记
新建目录
粘贴
刷新
```

---

# 24. 本轮不要做复杂 Explorer

不要：

```text
多选
Ctrl+Click
Shift range
drag & drop
批量复制
批量删除
标签
收藏
文件属性
权限
```

---

# 25. Context Menu 组件

建议新增：

```text
apps/web/src/components/sidebar/FileContextMenu.tsx
```

状态可以放在：

```text
Sidebar
```

或：

```text
App
```

看现有 props 哪个更简单。

不要引入 context-menu library。

---

# 26. Context Menu state

简单：

```ts
type ContextTarget =
  | {
      type: "note";
      path: string;
      x: number;
      y: number;
    }
  | {
      type: "folder";
      path: string;
      x: number;
      y: number;
    }
  | {
      type: "root";
      path: "";
      x: number;
      y: number;
    };
```

---

# 27. onContextMenu

在 Tree item：

```ts
onContextMenu={(event) => {
  event.preventDefault();

  openContextMenu({
    type: node.type,
    path: node.path,
    x: event.clientX,
    y: event.clientY,
  });
}}
```

---

# 28. Menu positioning

用：

```css
position: fixed;
```

坐标：

```text
clientX
clientY
```

但必须避免出 viewport。

简单 clamp：

```text
right edge
bottom edge
```

即可。

---

# 29. Menu close behavior

以下情况关闭：

```text
点击菜单外
Escape
执行某一菜单项
窗口 resize
Sidebar scroll
```

不需要 focus trap。

---

# 30. Rename Note

复用现有：

```text
RenameDialog
```

不要再写 inline rename input。

从 context menu 触发时：

```text
rename target
```

不能假设：

```text
target == openNote
```

---

# 31. 当前 App 的 Rename 只能操作 openNote

现在：

```ts
handleRenameNote(newPath)
```

内部直接：

```ts
openNote.path
```

这不足以支持：

```text
右键另一个未打开的 note
→ rename
```

因此需要把 rename target 抽成：

```ts
renameTarget:
{
  type: "note" | "folder",
  path: string
}
```

---

# 32. Rename 未打开 Note

调用：

```text
renameOrMoveNote(targetPath, newPath)
```

然后：

```text
loadTree()
```

如果被 rename 的恰好是：

```text
openNote
```

再同步：

```text
openNote.path
```

---

# 33. Folder Rename

当前后端只有：

```text
POST /api/folder
DELETE /api/folder
```

没有：

```text
PATCH /api/folder
```

本轮增加一个最小：

```text
PATCH /api/folder
```

Body：

```json
{
  "newPath": "new/folder"
}
```

Query：

```text
?path=old/folder
```

---

# 34. Folder rename server

在：

```text
apps/server/src/vault/folder-files.ts
```

增加：

```ts
renameFolder(vaultRoot, from, to)
```

逻辑：

```text
resolve existing source folder
resolve new target folder
target must not exist
fs.rename()
```

继续复用现有 path containment。

不要建立新的 FS abstraction。

---

# 35. Folder rename 后 openNote path

例如：

```text
folder:
研初复习

open note:
研初复习/Paper.md
```

folder rename：

```text
研初复习
→ 研究复习
```

则：

```text
openNote.path
```

也必须变成：

```text
研究复习/Paper.md
```

否则下一次 autosave 会写旧路径并失败。

---

# 36. expandedFolders 也应简单 remap

如果 rename folder：

```text
a
→ b
```

则：

```text
a
a/sub
a/sub/deep
```

应该映射：

```text
b
b/sub
b/sub/deep
```

不要全部 collapse。

一个 prefix replace 即可。

---

# 37. Delete Note

右键 Note → Delete：

复用现有：

```text
ConfirmDeleteDialog
```

如果 delete target 是当前 open note：

继续：

```text
flushCurrentNote()
```

再 delete。

不要绕过已有安全逻辑。

---

# 38. Delete Folder

当前 server 设计是：

> 只允许删除空目录。

本轮建议保持。

右键 Folder → Delete：

如果非空：

```text
显示“目录非空，当前版本仅支持删除空目录”
```

或者让 server 返回现有错误并显示用户可读提示。

不要本轮突然增加：

```text
recursive rm -rf
```

因为这属于更危险的行为变化。

---

# 39. Copy / Paste：先实现 Note 文件

为了保持简单，本轮：

> **Copy / Paste 第一版只复制 Markdown Note。**

Folder menu 中的：

```text
粘贴
```

表示：

> 把内部 clipboard 中的 Note 复制到该 folder。

不做：

```text
整个目录递归 copy
```

这一点必须在 UI/代码中明确。

这样可以避免为了一个右键菜单引入复杂 recursive copy / symlink / attachments 行为。

---

# 40. 内部 Clipboard

App state：

```ts
interface FileClipboard {
  operation: "copy";
  type: "note";
  sourcePath: string;
}
```

第一版只有：

```text
copy
```

不要先实现：

```text
cut
```

---

# 41. Copy Note

右键：

```text
Copy
```

只设置：

```ts
clipboard = {
  operation: "copy",
  type: "note",
  sourcePath,
};
```

不需要立即读取正文。

---

# 42. Paste Note

右键 Folder：

```text
Paste
```

执行：

1. 如果 source note 是当前 dirty open note：

```text
flushCurrentNote()
```

失败则终止。

2.：

```ts
fetchNote(sourcePath)
```

3. 计算目标文件名；

4.：

```ts
createNote(targetPath, source.content)
```

5.：

```text
loadTree()
expand target folder
```

---

# 43. Paste 到 Root

Sidebar 空白区域：

```text
Paste
```

target folder：

```text
""
```

即可。

---

# 44. Paste 到 Note

如果用户右键 Note：

可以有：

```text
Paste Here
```

其 target folder 为：

```text
dirname(note.path)
```

这是可选。

如果会增加菜单混乱：

> 不做。

---

# 45. Copy filename 规则

源：

```text
Paper.md
```

粘到不同目录且没有重名：

```text
Paper.md
```

如果目标已有：

```text
Paper.md
```

则：

```text
Paper copy.md
```

再冲突：

```text
Paper copy 2.md
Paper copy 3.md
```

---

# 46. 不覆盖现有文件

Paste 永远不能：

```text
overwrite
```

必须生成新名字。

---

# 47. 相对图片说明

普通文件管理器复制 Markdown 到另一个目录：

```text
不会自动重写 Markdown 内部相对链接。
```

本轮保持同样语义。

不要为了 Copy Note 开发：

```text
Markdown AST link rewrite
attachment duplication
image path rebasing
```

如果用户后续需要“复制笔记并复制附件”，另开功能。

---

# 48. Move

Note context menu 的：

```text
移动到...
```

复用当前：

```text
MoveDialog
```

同样不能假设：

```text
target == openNote
```

改成：

```text
moveTargetPath
```

---

# 49. 当前 Sidebar tooltip 仍有旧快捷键文字

当前最新 `Sidebar.tsx` 仍写：

```text
全文搜索 (Ctrl+K)
```

但是实际快捷键已经改为：

```text
Ctrl/Cmd+Shift+F
```

本轮顺手改正确。

---

# 50. 快捷键回归要求

必须继续保证：

```text
Ctrl/Cmd+B
→ Bold
```

```text
Ctrl/Cmd+I
→ Italic
```

```text
Ctrl/Cmd+K
→ Link
```

```text
Ctrl/Cmd+S
→ Save
```

```text
Ctrl/Cmd+P
→ Quick Open
```

```text
Ctrl/Cmd+Shift+F
→ Search
```

```text
Ctrl/Cmd+Shift+B
→ Sidebar
```

```text
Ctrl/Cmd+,
→ Settings
```

---

# 51. Ctrl+B 必须测试两种模式

不仅：

```text
select text
Ctrl+B
```

还必须：

```text
collapsed caret
Ctrl+B
type text
```

第二种正是当前截图出现：

```text
****
```

空 pair 的高风险场景。

---

# 52. Inline Test：必须使用中文上下文

不要只测试：

```text
hello **world**
```

本轮必须加：

```text
这是**中文加粗**测试
```

以及：

```text
神经网|络
Ctrl+B
输入：
不同层
```

最终：

```md
神经网**不同层**络
```

因为真实 bug 就发生在：

```text
中文 + 英文混合
中文邻接 marker
```

场景。

---

# 53. Inline E2E 不允许 reload

测试：

```text
Bold
Italic
Strike
Inline Code
```

都必须：

```text
操作
↓
移动 caret / 点击别段
↓
立即检查 DOM
```

禁止：

```ts
page.reload()
```

作为 render 触发条件。

---

# 54. E2E 必须同时检查 Markdown 和视觉 DOM

例如 Bold：

## Markdown

```text
editor.getValue()
```

应包含：

```md
**中文加粗**
```

---

## DOM

必须已经存在正确 inline rendered node。

不能只验证：

```text
有 **
```

---

# 55. Auto Pair E2E

依次：

```text
(
[
{
```

验证：

```text
()
[]
{}
```

且 caret 位于中间。

---

# 56. Auto Pair selection E2E

选中：

```text
abc
```

分别输入：

```text
(
[
{
```

验证：

```text
(abc)
[abc]
{abc}
```

---

# 57. Context Menu E2E

至少一个：

```text
right click note
↓
menu visible
↓
contains:
重命名
移动到
复制
删除
```

---

# 58. Copy / Paste E2E

准备：

```text
inbox/source.md
```

右键：

```text
Copy
```

右键另一个 folder：

```text
Paste
```

确认：

```text
target/source.md
```

出现且正文相同。

再复制一次：

```text
source copy.md
```

出现。

---

# 59. Rename from context menu E2E

必须测试：

> 被 rename 的 note **不是当前打开 note**。

因为当前代码最大风险就是 action 与：

```text
openNote
```

绑定。

例如：

```text
open A.md
right-click B.md
rename B.md -> C.md
```

必须：

```text
A 仍然打开
B 消失
C 出现
```

---

# 60. Folder rename test

例如：

```text
folder/a.md
```

打开：

```text
folder/a.md
```

右键 folder：

```text
rename folder -> renamed
```

必须：

```text
openNote.path =
renamed/a.md
```

继续输入并保存：

```text
成功
```

不能 stale old path。

---

# 61. 不要做系统 Clipboard

本轮的：

```text
Copy / Paste
```

是 Note Web 内部文件管理 clipboard。

不要使用：

```text
navigator.clipboard
```

写：

```text
文件内容
```

也不要读取系统文件剪贴板。

---

# 62. Context Menu 样式

保持当前 UI。

简单：

```css
.file-context-menu {
  position: fixed;
  min-width: 180px;
  ...
}
```

item：

```text
icon
label
shortcut(optional)
```

Danger：

```text
Delete
```

红色。

不要引 UI library。

---

# 63. Context Menu accessibility

至少：

```text
role="menu"
role="menuitem"
```

Escape 关闭。

够了。

不要做复杂 roving tabindex。

---

# 64. 本轮建议新增文件

```text
apps/web/src/components/sidebar/FileContextMenu.tsx
apps/web/src/utils/copy-name.ts
```

如果 pair logic 超过约 50 行：

```text
apps/web/src/editor/autoPair.ts
```

否则继续放：

```text
VditorEditor.tsx
```

不要过度拆分。

---

# 65. 预计需要修改

```text
apps/web/src/components/editor/VditorEditor.tsx
apps/web/src/components/sidebar/FileTree.tsx
apps/web/src/components/sidebar/FileTreeItem.tsx
apps/web/src/components/sidebar/Sidebar.tsx
apps/web/src/components/sidebar/FileContextMenu.tsx
apps/web/src/App.tsx
apps/web/src/api/client.ts
apps/web/src/styles/app.css
apps/web/src/styles/vditor-overrides.css
```

Folder rename 后端：

```text
apps/server/src/http/routes/folders.ts
apps/server/src/vault/folder-files.ts
apps/server/src/tests/...
```

---

# 66. 不需要新增后端 Copy API

因为本轮 Copy/Paste：

> 只复制 Note。

已有：

```text
fetchNote
createNote
```

足够。

不要新建：

```text
/api/fs
/api/copy
storage service
```

---

# 67. 只有 Folder Rename 需要后端新增能力

增加：

```text
PATCH /api/folder
```

即可。

不要扩成：

```text
generic filesystem mutation endpoint
```

---

# 68. 不实现 recursive folder copy

本轮明确不做。

如果 Agent 因“File Manager 要完整”开始写：

```text
fs.cp recursive
symlink scanner
folder clipboard
recursive duplicate
```

立即停止。

这是过度实现。

---

# 69. 不实现 recursive folder delete

继续保持：

```text
empty folder only
```

本轮只是给已有能力增加右键入口。

---

# 70. Vditor mode 不得切换

仍然：

```ts
mode: "ir"
```

禁止改：

```text
wysiwyg
sv
```

来回避 inline 问题。

---

# 71. 不允许刷新式 workaround

禁止：

```text
format click
→ reload
```

禁止：

```text
save
→ reload
```

禁止：

```text
blur
→ editor.setValue(editor.getValue())
```

禁止：

```text
interval full re-render
```

---

# 72. 如果最终确认是 Vditor 原生 IR bug

必须返回：

```text
Standalone reproduction:
YES

Vditor version:
3.11.3

Exact reproduction:
...
```

然后才能实现最窄 workaround。

---

# 73. 最窄 workaround 原则

如果原生 bug只影响：

```text
collapsed Bold
```

则只修：

```text
collapsed Bold
```

不要写整套自定义 Markdown inline engine。

---

# 74. Tests

完成后必须：

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

全部 PASS。

---

# 75. 真实人工验收

## Bold existing selection

```text
选中文本
Ctrl+B
```

立即视觉 Bold。

---

## Bold collapsed caret

```text
神经网|络
Ctrl+B
type 不同层
```

结果：

```text
神经网不同层络
```

其中：

```text
不同层
```

为 Bold。

磁盘：

```md
神经网**不同层**络
```

---

## Manual Markdown

直接输入：

```md
这是**加粗**测试
```

移开 caret。

立即 Bold。

---

## Pairs

```text
(
[
{
```

分别自动：

```text
()
[]
{}
```

---

## Right Click Note

可：

```text
Rename
Move
Copy
Delete
```

---

## Right Click Folder

可：

```text
New Note
New Folder
Rename
Paste
Delete
```

---

# 76. Agent 返回必须包含 Root Cause

格式：

```text
Inline Rendering Diagnosis

Case A - Selected Toolbar Bold:
Root cause:
DOM before:
DOM after:
Standalone result:

Case B - Selected Ctrl+B:
...

Case C - Collapsed Ctrl+B:
...

Case D - Manual **text**:
...
```

如果只是写：

```text
fixed Vditor rendering
```

视为没有完成诊断。

---

# 77. Agent 返回 UX Fixed

```text
[ ] selected Bold renders without reload
[ ] collapsed-caret Bold puts caret inside markers
[ ] manual **bold** renders after caret leaves node
[ ] Italic immediate
[ ] Strike immediate
[ ] Inline Code immediate
[ ] () auto pair
[ ] [] auto pair
[ ] {} auto pair
[ ] closing pair skip works
[ ] selected text wrapping works
[ ] right-click note menu exists
[ ] note rename works for unopened note
[ ] note move works for unopened note
[ ] note copy/paste works
[ ] duplicate paste gets safe copy name
[ ] right-click folder menu exists
[ ] folder rename works
[ ] open note path updates after parent folder rename
[ ] folder delete keeps empty-only behavior
[ ] Ctrl+B remains Bold
[ ] Ctrl+K remains Link
[ ] Search tooltip shows Ctrl+Shift+F
```

---

# 78. Verification 返回

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

# 79. Git

完成后：

```text
branch:
commit:
push:
git status:
```

建议 commit：

```text
fix(editor): correct inline IR behavior and add file context actions
```

---

# 80. 最终停止条件

本轮完成：

```text
Inline IR
+
() [] {}
+
File Context Menu
```

之后停止。

不要继续顺手实现完整 Explorer。

当前目标是：

> **让 Markdown 编辑动作即时可信，让文件树拥有一个正常个人笔记工具应有的最低限度文件操作能力。**

