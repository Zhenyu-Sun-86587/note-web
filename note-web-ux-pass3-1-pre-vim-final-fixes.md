# Note Web UX Pass 3.1：Vim 前最后一轮返修提示词

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 当前远端 `main` 基线：
>
> `86bf0c9113bf5b7b9f7d83f32f5f6b265afd2450`
>
> 当前提交：
>
> `fix(editor): correct inline IR behavior and add file context actions`
>
> 本轮性质：
>
> **Vim Pass 之前的最后一轮 Vditor / File Tree 收尾返修。**
>
> 本轮只修已经确认的 4 个问题：
>
> 1. Folder Rename 错误复用 Note RenameDialog，导致目录名可能被自动加 `.md`
> 2. Rename 当前打开笔记的父目录前没有 flush，存在 autosave / folder rename race
> 3. 行内 Bold 的真实 collapsed-caret 场景仍然没有被正确修复
> 4. `() [] {}` Auto Pair 测试不够严格，selection wrap / skip-close 并未真正验证
>
> 完成这 4 项后：
>
> **停止修改 Vditor 主线，准备进入下一阶段 CodeMirror 6 + Vim Mode。**

---

# 0. 不要再扩功能

本轮禁止增加：

```text
CodeMirror
Vim
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
Plugin system
Command registry
Custom keybinding editor
Recursive folder copy
Recursive folder delete
Drag & drop Explorer
```

现在只收尾现有 IR / 文件树。

---

# 1. P1：Folder RenameDialog 当前实现确定有 bug

当前 App 已经支持：

```ts
renameTarget: {
  type: "note" | "folder";
  path: string;
}
```

但是 Note 和 Folder 都复用：

```tsx
<RenameDialog
  currentPath={renameTarget.path}
  onSubmit={handleRenameSubmit}
/>
```

问题在于当前 `RenameDialog.tsx` 是按照“笔记重命名”写的。

其逻辑：

```ts
const base = getBasename(currentPath);
setName(removeMdExtension(base));
```

提交：

```ts
const newNameWithExt =
  ensureMdExtension(cleanName);
```

并且标题固定：

```tsx
title="重命名笔记"
```

因此 Folder：

```text
研究复习
```

如果用户输入：

```text
research
```

可能得到：

```text
research.md
```

这是错误行为。

---

# 2. Folder Rename 最小修法

不要再写一个完全独立的 Dialog。

直接让现有：

```text
RenameDialog
```

支持：

```ts
kind: "note" | "folder";
```

建议：

```ts
interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  kind: "note" | "folder";
  onSubmit: (newPath: string) => Promise<void>;
}
```

---

# 3. Note Rename 行为保持当前

当：

```ts
kind === "note"
```

打开：

```ts
setName(
  removeMdExtension(
    getBasename(currentPath)
  )
);
```

提交：

```ts
const finalName =
  ensureMdExtension(cleanName);
```

---

# 4. Folder Rename 行为

当：

```ts
kind === "folder"
```

打开：

```ts
setName(
  getBasename(currentPath)
);
```

不要：

```ts
removeMdExtension()
```

因为目录本身允许：

```text
foo.bar
research.v2
2026.08
```

这类名字。

---

提交 Folder：

```ts
const finalName = cleanName;
```

禁止：

```ts
ensureMdExtension()
```

---

# 5. Dialog 文案

Note：

```text
重命名笔记
文件名
```

Folder：

```text
重命名目录
目录名
```

按钮：

```text
保存
```

保持即可。

---

# 6. App 调用

修改：

```tsx
<RenameDialog
  ...
  kind={renameTarget.type}
/>
```

不要根据 path extension 猜类型。

使用：

```text
renameTarget.type
```

作为唯一依据。

---

# 7. Folder Rename 回归测试

至少测试：

```text
folder:
projects/research

rename:
research.v2
```

结果必须是：

```text
projects/research.v2
```

绝不能：

```text
projects/research.v2.md
```

---

# 8. P1：Rename 当前打开笔记的父目录前必须 flush

当前 Note rename 已经有：

```ts
if (openNote?.path === renameTarget.path) {
  if (!(await flushCurrentNote())) {
    return;
  }
}
```

这是正确的。

但是 Folder rename 当前没有同样保护。

---

# 9. 当前竞态

假设：

```text
openNote:
research/Paper.md
```

用户正在编辑：

```text
dirty / autosave in-flight
```

同时：

```text
right click research
→ rename
→ papers
```

后端执行：

```ts
fs.rename(
  /vault/research,
  /vault/papers
)
```

与此同时旧 save 可能仍在：

```text
/vault/research/Paper.md
```

下工作。

结果可能：

```text
save error
ENOENT
临时文件 rename 失败
UI error
```

虽然 draft 仍在内存中，但这是不必要的 race。

---

# 10. Folder Rename 正确条件

在：

```ts
handleRenameSubmit()
```

的 folder branch 中，先判断：

```ts
const affectsOpenNote =
  openNote !== null &&
  (
    openNote.path === renameTarget.path ||
    openNote.path.startsWith(
      `${renameTarget.path}/`
    )
  );
```

如果：

```ts
affectsOpenNote
```

则：

```ts
if (!(await flushCurrentNote())) {
  return;
}
```

然后才能：

```ts
await renameFolder(...);
```

---

# 11. 不要后端加 lock

禁止为此增加：

```text
mutex
file lock
folder lock
transaction
write queue
rename journal
```

前端 flush 足够。

---

# 12. Folder Rename 后 openNote path remap 保留

当前已经有：

```text
oldFolder/
↓
newFolder/
```

时：

```text
openNote.path prefix replace
expandedFolders prefix replace
```

这部分保持。

---

# 13. 必须测试“父目录包含当前打开笔记”

准备：

```text
projects/a.md
```

打开：

```text
projects/a.md
```

编辑成 dirty。

立即 rename：

```text
projects
→ papers
```

要求：

```text
先保存最新正文
↓
folder rename
↓
openNote.path = papers/a.md
↓
继续输入
↓
autosave 正常
```

最终磁盘：

```text
papers/a.md
```

存在且内容完整。

---

# 14. P1：Bold 的真实 bug 仍然没有闭环

目前所谓 “IR rendering fix” 主要增加了：

```css
.vditor-ir__marker--bi
```

显示/隐藏控制。

这只影响：

```text
Markdown marker 的视觉展开
```

不能证明：

```text
collapsed caret
```

下的 Bold 插入和 caret placement 正常。

---

# 15. 必须精确复现用户真实问题

不能只测试：

```text
空文档
↓
点击 Bold
↓
输入 livebold
```

必须测试：

```text
已有中文正文
```

例如：

```text
神经网络不同层的细粒度
```

将 caret 放在：

```text
神经网|络不同层的细粒度
```

按：

```text
Ctrl+B
```

或点击：

```text
Bold Toolbar
```

预期内部 Markdown：

```md
神经网**|**络不同层的细粒度
```

然后输入：

```text
新的
```

最终 Markdown：

```md
神经网**新的**络不同层的细粒度
```

---

# 16. 错误行为

当前用户已经真实看到过类似：

```md
神经网****络不同层
```

然后输入文本跑到：

```text
****
```

之外。

这说明：

> Bold markers 创建成功，但 caret 没留在 marker 中间。

这和“marker 是否隐藏”不是同一个问题。

---

# 17. 本轮必须做 DOM / Selection 诊断

对 collapsed Bold 场景记录：

```text
Before:
selection.anchorNode
selection.anchorOffset

After Ctrl+B:
selection.anchorNode
selection.anchorOffset

Markdown:
editor.getValue()

IR DOM:
相关 block innerHTML
```

必须回答：

```text
Ctrl+B 后，caret 到底在哪里？
```

不要继续猜：

```text
可能是 CSS
可能是 React
```

---

# 18. Standalone Vditor 对照继续要求执行

用当前 lockfile 的 Vditor 版本建立最小 standalone：

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

测试：

```text
神经网|络
Ctrl+B
输入 新的
```

---

# 19. 根据结果判断责任层

## Standalone 正常

则 bug 在 Note Web：

```text
focus lifecycle
event listener
selection mutation
React wrapper
auto-pair capture listener
其他 DOM listener
```

修 Note Web。

---

## Standalone 也失败

则明确报告：

```text
Vditor native IR behavior reproduced
```

然后做最窄 workaround。

不要假装是项目代码。

---

# 20. 必须重点检查当前 capture-phase keydown listener

当前代码：

```ts
hostEl.addEventListener(
  "keydown",
  handleKeyDown,
  true
);
```

`true` 表示：

```text
capture phase
```

虽然当前 handler 只显式处理：

```text
() [] {}
```

但它仍然运行在 Vditor 自己的 keydown 之前。

必须确认它没有影响：

```text
Ctrl+B
Toolbar click 后的 selection
keydown / keyup lifecycle
```

---

# 21. 不要使用全量 setValue 修 Bold

禁止：

```ts
editor.setValue(editor.getValue())
```

禁止：

```text
Ctrl+B
→ setTimeout
→ setValue
```

禁止：

```text
blur
→ reparse whole doc
```

禁止：

```text
reload
```

这些都会破坏：

```text
selection
undo history
IR incremental state
```

---

# 22. 如果问题是 selection 被 Toolbar click 丢失

如果真实诊断发现：

```text
click toolbar
↓
editor selection lost
↓
processToolbar 获取错误 range
```

优先检查：

```text
Vditor Toolbar 自己原本如何保存 selection
```

不要自己重新实现：

```text
**text**
```

字符串包裹。

---

# 23. 如果问题是项目自己的事件干扰

只删除/调整那一个干扰源。

不要重写：

```text
VditorEditor
```

---

# 24. Bold 必须验证 4 个场景

## A：Selected + Ctrl+B

```text
选中：
中文加粗

Ctrl+B
```

必须即时 Bold。

---

## B：Selected + Toolbar

同样必须即时。

---

## C：Collapsed + Ctrl+B

```text
神经网|络
Ctrl+B
type 新的
```

必须：

```md
神经网**新的**络
```

---

## D：Manual Markdown

输入：

```md
这是**中文加粗**测试
```

移动 caret 离开。

不能 reload。

必须正确渲染。

---

# 25. Italic / Strike / Inline Code 只需防回归

本轮主要根因针对 Bold collapsed-caret。

但必须确认：

```text
Ctrl+I
Toolbar Italic
Strike
Inline Code
```

没有被改坏。

---

# 26. P1：Auto Pair 测试目前是假强覆盖

当前测试名字：

```text
supports selection wrap and skip closing
```

但是实际只测试：

```text
(
type round

[
type square

{
type curly
```

没有测试：

```text
selection wrap
skip close
```

这是测试描述与实际覆盖不一致。

---

# 27. Auto Pair 必须改成精确测试

不要只：

```ts
toContainText("(round)")
```

因为：

```text
((round))
```

一样可能包含：

```text
(round)
```

---

# 28. 推荐检查 Markdown value

在 E2E 里获取：

```ts
editorInstance.getValue()
```

如果无法直接拿 Vditor instance，可以读取稳定 DOM / 当前 block text。

但首选：

```text
精确 Markdown string
```

---

# 29. Pair Test A：Empty caret

依次：

```text
(
[
{
```

要求最终精确：

```text
()
[]
{}
```

---

# 30. Pair Test B：Caret placement

输入：

```text
(
```

然后：

```text
abc
```

必须：

```text
(abc)
```

而不是：

```text
()abc
```

---

同理：

```text
[square]
{curly}
```

---

# 31. Pair Test C：Selection wrap

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

再分别：

```text
[abc]
{abc}
```

---

# 32. Pair Test D：Skip closing

当前：

```text
(|)
```

输入：

```text
)
```

结果必须：

```text
()|
```

绝不能：

```text
())|
```

---

同理：

```text
[|] + ]
{|} + }
```

---

# 33. 不要因为测试失败马上重写 Auto Pair

先确认：

```text
Vditor 原生是否已经处理 []
{}
```

因为当前项目又加了一层：

```text
capture keydown
+
document.execCommand
```

有可能与 Vditor 原生重复。

---

# 34. 只补缺失行为

如果 Vditor 已经原生支持：

```text
[]
{}
```

则 Note Web 不要再次处理。

可以让：

```text
PAIR_MAP
```

只保留实际缺失的 pair。

---

# 35. document.execCommand 先不要为了“现代化”重构

当前：

```ts
document.execCommand("insertText")
```

确实是老 API。

但本轮不要单纯为了 API 风格重写。

只有当实际测试证明它导致：

```text
selection
input event
Vditor undo
```

问题时才替换。

---

# 36. Sidebar Context Menu P2 小修

当前整个：

```text
.sidebar
```

都有 root：

```text
onContextMenu
```

只排除了：

```text
.tree-item
.tree-action-btn
```

这样可能导致用户在：

```text
Quick Open input
Sidebar Header
按钮空白区域
```

右键也弹：

```text
新建笔记
新建目录
粘贴
刷新
```

---

# 37. 最小修法

Root Context Menu 只放在：

```text
.sidebar-tree
```

真正文件树内容区。

不要挂：

```text
整个 sidebar
```

---

# 38. 输入框必须保留浏览器原生右键

这些区域：

```text
Quick Open input
Search input
Rename input
Settings input
```

不得被文件树 context menu 抢占。

---

# 39. Context Menu 已通过部分不要重构

当前 Note menu：

```text
打开
重命名
移动到
复制
删除
```

Folder：

```text
新建笔记
新建子目录
重命名
粘贴
删除
```

Root：

```text
新建
粘贴
刷新
```

方向是正确的。

不要新增：

```text
Cut
recursive folder copy
multi-select
permissions
properties
```

---

# 40. Copy/Paste Note 当前方向保留

继续：

```text
internal clipboard
fetchNote
createNote
```

不要改成系统 clipboard。

不要建立：

```text
/api/copy
```

---

# 41. Folder Delete 继续 empty-only

不要因为加右键就修改成：

```text
rm -rf
```

保持服务器当前：

```text
FOLDER_NOT_EMPTY
```

逻辑。

---

# 42. Backend Folder Rename 继续保持最小

现有：

```ts
resolveExistingFolderPath()
resolveNewFolderPath()
fs.rename()
```

即可。

不要为 Folder Rename 新建：

```text
FileManagerService
VaultTransaction
MoveProvider
```

---

# 43. 一个测试遗漏：Folder Rename 必须加测试 UI 语义

当前 server test 已经覆盖：

```text
PATCH folder
```

但需要一个 web/E2E test 覆盖：

```text
Folder Rename Dialog
```

确保：

```text
目录不会被自动加 .md
```

---

# 44. E2E：Unopened Note Rename

保留或补：

```text
Open A.md
right click B.md
rename B -> C
```

必须：

```text
A 仍打开
B 不存在
C 存在
```

这能证明 context-menu target 没错误绑定 openNote。

---

# 45. E2E：Folder Rename + Open Descendant

必须新增：

```text
open projects/a.md
↓
right click projects
↓
rename projects -> papers
```

确认：

```text
open path:
papers/a.md
```

然后继续输入：

```text
test-after-folder-rename
```

等待 autosave。

最后：

```text
papers/a.md
```

磁盘包含最新内容。

---

# 46. 当前 Autosave 不需要继续修改

最新：

```text
revision sync
in-flight save
saveAgain
conflict
flush
```

主链没有发现新的 blocker。

不要借 Folder Rename race 再改：

```text
useAutosave.ts
```

除非测试真实暴露 bug。

---

# 47. Vim 前的架构停止线

本轮完成后：

> **停止继续增强 Vditor 键盘编辑能力。**

后续如果需要：

```text
正统 Vim
```

将单独引入：

```text
CodeMirror 6
+
@replit/codemirror-vim
```

作为：

```text
Vim Markdown Source Mode
```

不要在 Vditor IR 上继续堆：

```text
Normal Mode
Visual Mode
hjkl
operator-motion
register
macro
```

---

# 48. 本轮建议修改文件

主要：

```text
apps/web/src/components/dialogs/RenameDialog.tsx
apps/web/src/App.tsx
apps/web/src/components/editor/VditorEditor.tsx
apps/web/src/components/sidebar/Sidebar.tsx
e2e/note-edit.spec.ts
```

可能：

```text
apps/web/src/tests/...
```

原则上后端：

```text
apps/server/
```

只在新增 server regression test 时修改。

不要重写 folder API。

---

# 49. 返修顺序

## Phase 1

修：

```text
RenameDialog kind
```

和：

```text
folder rename flush
```

---

## Phase 2

真实复现：

```text
collapsed caret Bold
```

做 standalone Vditor 对照。

明确 root cause。

---

## Phase 3

只修实际 Bold 根因。

---

## Phase 4

强化：

```text
() [] {}
```

测试。

如果发现现实现与 Vditor 原生冲突，再做最小修正。

---

## Phase 5

缩小：

```text
root context menu
```

到 tree area。

---

## Phase 6

运行完整测试。

---

# 50. 必须运行

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

必须全部 PASS。

---

# 51. Inline Bold 验收必须真实

最终 Agent 必须明确回答：

```text
Standalone Vditor result:
PASS / FAIL

Note Web selected Ctrl+B:
PASS / FAIL

Note Web selected Toolbar Bold:
PASS / FAIL

Note Web collapsed Ctrl+B:
PASS / FAIL

Note Web manual Chinese **bold**:
PASS / FAIL
```

---

# 52. Collapsed Bold 最终验收字符串

必须使用真实类似场景：

原文：

```text
神经网络不同层
```

caret：

```text
神经网|络不同层
```

执行：

```text
Ctrl+B
type 细粒度
```

最终 Markdown 精确为：

```md
神经网**细粒度**络不同层
```

不接受：

```md
神经网****络不同层细粒度
```

---

# 53. Pair 最终验收

必须明确：

```text
() empty caret:
PASS

[] empty caret:
PASS

{} empty caret:
PASS

() selection wrap:
PASS

[] selection wrap:
PASS

{} selection wrap:
PASS

) skip existing close:
PASS

] skip existing close:
PASS

} skip existing close:
PASS
```

---

# 54. Folder Rename 最终验收

必须明确：

```text
Folder rename preserves raw folder name:
PASS

Folder rename does not append .md:
PASS

Rename parent folder flushes dirty open note:
PASS

Open note path remapped:
PASS

Autosave continues after parent folder rename:
PASS
```

---

# 55. Context Menu 最终验收

```text
Right-click note:
PASS

Right-click folder:
PASS

Right-click tree blank area:
PASS

Right-click Quick Open input keeps browser context menu:
PASS
```

---

# 56. Agent 返回格式

## Root Cause

必须写：

```text
Collapsed Bold root cause:
...

Standalone reproduction:
YES / NO

Why previous CSS/local-echo fix was insufficient:
...
```

---

## Changes

```text
RenameDialog.tsx
- ...

App.tsx
- ...

VditorEditor.tsx
- ...

Sidebar.tsx
- ...

note-edit.spec.ts
- ...
```

---

## Fixed

```text
[ ] Folder rename no longer appends .md
[ ] Folder rename flushes dirty descendant note
[ ] Open descendant path remaps after folder rename
[ ] Collapsed Ctrl+B puts caret inside bold markers
[ ] Selected Ctrl+B works
[ ] Toolbar Bold works
[ ] Manual Chinese **bold** renders without reload
[ ] () exact auto-pair works
[ ] [] exact auto-pair works
[ ] {} exact auto-pair works
[ ] selection wrap works for all 3
[ ] skip-close works for all 3
[ ] Root context menu is limited to tree area
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

完成后：

```text
branch:
commit:
push:
git status:
```

建议 commit：

```text
fix(editor): close remaining IR and file-tree UX gaps
```

---

# 57. 最终停止条件

本轮完成后：

```text
Folder Rename
Collapsed Bold
Auto Pair exact behavior
Context Menu scope
```

全部通过。

然后：

> **停止 Vditor UX 返修主线。**

下一阶段再单独开发：

```text
UX Pass 4
CodeMirror 6
+
@replit/codemirror-vim
+
Vim Markdown Source Mode
```

不要把 Vim 混进当前 commit。

