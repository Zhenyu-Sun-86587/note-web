# Note Web `45d367f` 远端复审与最小返修提示词

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 审查分支：`main`
>
> 当前远端 HEAD：
>
> `45d367ff9dda2df413f2496a293d8c87f7e4af25`
>
> 提交：
>
> `fix(remediation): round 2 fixes for sequential autosave revision, flush gates, e2e, and asset symlinks`
>
> 审查性质：**MVP Release Candidate 前最后一轮数据行为审查**
>
> 本轮只修确认存在的 autosave 状态问题。不要再扩功能、重构架构或扩大安全体系。

---

# 0. 远端状态已经确认

GitHub 远端 `main` 已经从：

```text
a943827
```

推进到：

```text
45d367ff9dda2df413f2496a293d8c87f7e4af25
```

该提交的 parent 正是：

```text
a943827b343e4e0101793fa7d31e247403a2dd37
```

Round 2 相对上一提交实际修改了：

```text
apps/server/src/tests/assets.test.ts
apps/server/src/vault/assets.ts
apps/web/src/App.tsx
apps/web/src/hooks/useAutosave.ts
apps/web/src/tests/autosave.test.ts
e2e/note-edit.spec.ts
playwright.config.ts
```

以及加入 Round 2 提示词文档。

因此这次审查已经完全基于 GitHub 远端代码，而不是 Agent 本地返回说明。

---

# 1. 本轮总体结论

Round 2 大部分返修是成功的。

已经通过代码审查的项目：

```text
[PASS] sequential save 第一笔成功后立即更新内部 revision
[PASS] sequential test 精确验证 rev-1 -> rev-2
[PASS] switch note 前 flush，并在失败时 return
[PASS] create note 前 flush，并在失败时 return
[PASS] rename 前 flush，并在失败时 return
[PASS] move 前 flush，并在失败时 return
[PASS] 删除当前 note 前 flush
[PASS] E2E selector 修成 .statusbar
[PASS] E2E 检查真实中文“已保存”
[PASS] E2E 恢复 test-vault fixture
[PASS] Playwright 改为独立 3030 端口
[PASS] Playwright VAULT_ROOT 改为绝对路径
[PASS] attachments symlink 在 mkdir 子目录之前检查
[PASS] asset symlink test 验证 outside dir 没有产生文件
```

目前**不要再修改以上模块的已通过逻辑**。

---

# 2. 当前仍然存在的 P0：同一路径 revision 更新没有同步到 hook

这是目前最重要的问题。

当前 `useAutosave.ts` 中：

```ts
const latestRevisionRef = useRef(revision);
const latestPathRef = useRef(path);

const prevPathRef = useRef(path);

if (path !== prevPathRef.current) {
  prevPathRef.current = path;
  latestPathRef.current = path;
  latestRevisionRef.current = revision;
  latestSavedContentRef.current = content;
  savingContentRef.current = null;
}
```

也就是说：

> `latestRevisionRef` 只有在 **path 改变** 时从 props 同步。

除此之外，只在本 hook 自己 save 成功后：

```ts
latestRevisionRef.current = doc.revision;
```

更新。

这漏掉一个本项目非常重要的场景：

> **同一个 Markdown 文件在磁盘上被外部程序修改，然后浏览器重新读取了新的 revision。**

---

# 3. 这个 bug 会真实发生在现有 App 中

当前 App 已经支持：

```text
浏览器 window focus
↓
重新 fetch 当前 note
↓
发现 disk revision 改变
```

如果当前页面没有 dirty：

```ts
setOpenNote(latest);
setDraftContent(latest.content);
```

注意：

```text
path 没变
revision 变了
content 变了
```

但是当前 hook 只检查：

```ts
if (path !== prevPathRef.current)
```

因此：

```text
openNote.revision = rev-2
```

已经更新，

但：

```text
latestRevisionRef.current
```

仍然可能是：

```text
rev-1
```

---

# 4. 结果：外部更新后下一次编辑会错误 409

完整流程：

```text
A.md
disk revision = rev-1

浏览器打开 A.md
hook revision ref = rev-1

外部 Memos / Agent / script 修改 A.md
disk revision = rev-2

浏览器重新 focus
↓
fetchNote(A.md)
↓
React:
openNote = rev-2
draft = disk 新内容

但是：
latestRevisionRef.current 仍然 = rev-1

用户继续编辑
↓
autosave

PUT A.md
baseRevision = rev-1

服务器当前 revision = rev-2

↓
409 REVISION_CONFLICT
```

这会导致：

> 明明浏览器已经成功自动重新加载最新磁盘版本，用户再编辑一次却立刻出现冲突。

对于本项目未来允许：

```text
Memos
Agent
n8n
Git/script
```

直接修改 Markdown Vault 的架构，这是 P0。

---

# 5. 更严重的现有场景：点击“重新加载磁盘版本”后仍可能继续冲突

当前 conflict handler：

```ts
const handleReloadConflict = async () => {
  const doc = await fetchNote(openNote.path);

  setOpenNote(doc);
  setDraftContent(doc.content);
  resetStatus("idle");
};
```

这里同样：

```text
path 没变
revision 变了
```

但 hook 不同步同 path 的 revision。

因此可能：

```text
旧 revision = rev-1
disk revision = rev-2

用户发生 conflict
↓
点击“重新加载磁盘版本”
↓
页面显示 rev-2 内容

用户开始重新编辑
↓
hook 仍用 rev-1
↓
再次 409
```

也就是说：

> 当前“重新加载磁盘版本”按钮可能无法真正退出 conflict。

这必须在挂真实 Vault 前修掉。

---

# 6. 当前 `resetStatus()` 还有第二个语义问题

现在：

```ts
const resetStatus = useCallback((newStatus = "idle") => {
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }

  saveAgainRef.current = false;

  latestRevisionRef.current =
    latestRevisionRef.current ?? revision;

  latestSavedContentRef.current =
    latestContentRef.current;

  savingContentRef.current = null;

  setStatus(newStatus);
}, [revision]);
```

这里最大的问题是：

```ts
latestSavedContentRef.current =
  latestContentRef.current;
```

`resetStatus()` 本来只是：

> UI 状态重置。

但它现在顺便做了：

> 把“当前编辑器内容”标记成“已经成功保存到服务器的内容”。

这是错误的职责。

---

# 7. 为什么会出问题

例如：

```text
disk = Y
本地 dirty draft = X
```

发生 conflict。

用户点击：

```text
重新加载磁盘版本
```

App 顺序：

```ts
setOpenNote(docY);
setDraftContent(Y);
resetStatus("idle");
```

React state 更新不会在 `resetStatus()` 调用之前立即完成。

所以 `resetStatus()` 执行时：

```ts
latestContentRef.current
```

仍可能是旧 dirty draft：

```text
X
```

于是：

```ts
latestSavedContentRef.current = X
```

等价于错误告诉 hook：

> X 已经保存过。

随后 React 才真正 render：

```text
draft = Y
openNote.content = Y
```

以后如果用户重新把内容编辑成 X：

```text
isDirty = true
```

但 autosave effect 当前又有：

```ts
content === latestSavedContentRef.current
```

于是：

```text
X === X
```

会直接 return。

结果：

> 页面显示 dirty，但 autosave 可能被错误抑制。

手动保存又可能因为上一节 stale revision 问题继续 409。

---

# 8. 不建议继续修补 `latestSavedContentRef`

这里不要再给：

```text
latestSavedContentRef
resetStatus
revision
```

增加更多条件。

本项目已经有一个更简单、更可靠的 dirty 真相源：

```ts
const isDirty =
  openNote !== null &&
  draftContent !== openNote.content;
```

也就是 App 传入 hook 的：

```ts
enabled
```

已经明确表示：

> 当前 draft 是否与最后服务器确认内容不同。

所以建议：

> **删除 `latestSavedContentRef`。**

这会让 autosave 逻辑重新变简单。

---

# 9. 推荐最小结构

保留：

```ts
latestContentRef
latestRevisionRef
latestPathRef
savingContentRef
inFlightPromiseRef
saveAgainRef
debounceTimerRef
```

删除：

```ts
latestSavedContentRef
```

不要建立新的 state machine。

不要建立 reducer。

不要建立 queue class。

---

# 10. revision ref 必须支持“同 path revision 变化”

实现方式可以自行选择，但必须满足：

```text
path 改变
→ revision ref 同步

path 不变但 revision prop 改变
→ revision ref 也同步
```

同时不能破坏：

```text
第一笔 save 返回 rev-2
↓
第二笔 sequential save 必须立即使用 rev-2
```

---

# 11. 一个简单可接受的实现思路

例如，在没有正在执行内部 save 时，让服务端 props 成为 revision baseline：

```ts
latestPathRef.current = path;

if (!inFlightPromiseRef.current) {
  latestRevisionRef.current = revision;
}
```

或者使用一个很小的 effect：

```ts
useEffect(() => {
  if (!inFlightPromiseRef.current) {
    latestRevisionRef.current = revision;
  }
}, [path, revision]);
```

内部 save 成功后仍然必须：

```ts
const doc = await saveNote(...);

latestRevisionRef.current = doc.revision;
```

这样 sequential loop 可以不等待 React render，直接拿新 revision。

实现细节可按当前代码风格调整。

核心验收条件只有：

```text
external same-path rev-1 -> rev-2
↓
下一次 save 必须发送 rev-2
```

---

# 12. `resetStatus()` 应恢复成“纯状态操作”

建议 `resetStatus()` 只做：

```ts
clear debounce timer
saveAgainRef.current = false
setStatus(newStatus)
```

如果确认当前没有 in-flight，也可以：

```ts
savingContentRef.current = null
```

但不要再：

```ts
latestSavedContentRef.current = ...
```

也不要用：

```ts
latestRevisionRef.current =
  latestRevisionRef.current ?? revision;
```

去猜 revision。

revision baseline 应该由：

```text
server prop revision
或
saveNote 返回 doc.revision
```

决定。

不是由 reset UI status 决定。

---

# 13. 当前另一个 P1：flush 一个正在保存、但正文没有新变化的 note 会重复 PUT

现在：

```ts
const saveNow = useCallback(async () => {
  if (inFlightPromiseRef.current) {
    saveAgainRef.current = true;
    return inFlightPromiseRef.current;
  }

  return performSave();
});
```

只要已有 save 在执行：

```ts
saveAgainRef.current = true;
```

无论正文是否真的变化。

---

# 14. 实际发生场景

用户输入：

```text
Content B
```

autosave 已经发出：

```text
PUT Content B
```

请求正在飞。

用户此时点击 B.md 以外的另一篇 note。

App：

```ts
flushCurrentNote()
```

因为 `openNote.content` 尚未被 save response 更新：

```text
isDirty = true
```

于是：

```ts
saveNow()
```

发现已有 in-flight：

```ts
saveAgainRef.current = true
```

第一笔 Content B 成功后：

```text
rev-2
```

while loop 因 `saveAgain = true` 再跑一次：

```text
PUT Content B
baseRevision = rev-2
```

用户实际上没有第二次修改。

---

# 15. 这个问题不会损坏正文，但应该修

结果是：

```text
同一正文被写两次
mtime 改两次
多一次网络请求
多一次磁盘 rename
```

如果未来：

```text
文件 watcher
Git/n8n workflow
外部脚本
```

依赖 mtime，可能产生不必要触发。

这是 P1，不是 P0。

---

# 16. 已经有 `savingContentRef`，直接用它即可

当前第一笔保存开始前：

```ts
savingContentRef.current = c;
```

所以 in-flight 时 `saveNow()` 应只在：

```ts
latestContentRef.current !==
savingContentRef.current
```

时设置：

```ts
saveAgainRef.current = true;
```

推荐：

```ts
if (inFlightPromiseRef.current) {
  if (
    latestContentRef.current !==
    savingContentRef.current
  ) {
    saveAgainRef.current = true;
  }

  return inFlightPromiseRef.current;
}
```

`performSave()` 自己遇到已有 in-flight 的分支也应用同样原则。

---

# 17. 这样可以同时满足两个场景

## 场景 A：没有继续编辑

```text
saving = Content B
latest = Content B

flush()
```

结果：

```text
只 await 当前 promise
PUT count = 1
```

---

## 场景 B：保存过程中继续输入

```text
saving = Content B
latest = Content C

flush()
```

结果：

```text
saveAgain = true

PUT #1
Content B + rev-1

PUT #2
Content C + rev-2
```

这是我们真正需要的 sequential save。

---

# 18. 必须增加 2 个高价值 autosave 回归测试

目前已有测试：

```text
clean -> 0 saves
debounce -> exactly 1 save
B/rev-1 -> C/rev-2 sequential save
```

这些保留。

只再加两个测试。

不要扩大型 test suite。

---

# 19. Test A：同 path 外部 revision 更新后使用新 revision

模拟：

```text
path = inbox/test.md

初始：
content = A
revision = rev-1
clean
```

然后模拟外部磁盘刷新：

```text
同一个 path

openNote/content:
B
revision:
rev-2
```

之后用户编辑：

```text
C
```

执行：

```ts
saveNow()
```

必须断言：

```ts
expect(saveNoteMock).toHaveBeenCalledWith(
  "inbox/test.md",
  "C",
  "rev-2",
);
```

绝不能使用：

```text
rev-1
```

---

# 20. Test B：flush in-flight 相同正文不得二次保存

模拟：

```text
A / rev-1
↓
用户改 B
↓
saveNow()
↓
第一笔 B 正在 in-flight
```

不改变 draft。

再次：

```ts
saveNow()
```

模拟用户切换 note 前 flush。

然后 resolve 第一笔。

最终必须：

```ts
expect(saveNoteMock).toHaveBeenCalledTimes(1);
```

不是 2。

---

# 21. 建议额外覆盖“conflict reload 后可以继续保存”

如果只需要几行测试即可实现，建议再加：

```text
A / rev-1
↓
模拟重新加载磁盘版本：
B / rev-2
same path
↓
resetStatus("idle")
↓
用户编辑 C
↓
save
```

断言：

```text
C + rev-2
```

如果 Test A 已经能够完整覆盖同 path revision 更新，可以不重复测试。

不要为了这个引入 App.tsx 大型 mock。

---

# 22. App.tsx Round 2 flush gate 审查通过

当前：

```ts
const flushCurrentNote =
  useCallback(async (): Promise<boolean> => {
    if (!isDirty) {
      return true;
    }

    return saveNow();
  }, [isDirty, saveNow]);
```

是正确的。

以下调用都已经做到：

```ts
if (!(await flushCurrentNote())) {
  return;
}
```

包括：

```text
switch
create note
rename
move
delete current note
```

这部分：

> **不要再改。**

---

# 23. 删除当前 note 的 race 已经修好

当前 delete：

```text
如果 deleteTarget 是当前 note
↓
flushCurrentNote()
↓
失败则 return
↓
成功才 delete
```

这解决了：

```text
old autosave temp rename
vs
unlink current note
```

导致文件“删除后复活”的问题。

通过。

---

# 24. Asset symlink 修复审查通过

现在 `saveAsset()` 已经：

```text
检查 attachments root
↓
确认 realpath 在 vault 内
↓
才创建 YYYY/MM
↓
再次确认 targetDir realpath
↓
才写文件
```

新增测试也真实构造：

```text
vault/attachments -> outsideDir
```

然后：

```text
POST /api/assets
```

要求：

```text
403 ACCESS_DENIED
```

并检查：

```text
outsideDir 文件数 = 0
```

这项通过。

不要再加：

```text
chroot
openat
inode lock
TOCTOU framework
```

---

# 25. E2E 修复审查通过

现在：

```ts
const statusBar =
  page.locator(".statusbar");
```

与真实 DOM 一致。

并等待：

```text
已保存
```

而不是错误的英文：

```text
Saved
```

通过。

---

# 26. E2E fixture restore 基本通过

当前：

```ts
beforeAll:
read welcome.md

afterEach:
write original content back
```

这可以防止测试 token 留在 tracked fixture 中。

当前 fixture 本身是非空文件，所以现有：

```ts
if (originalContent && ...)
```

可以正常恢复。

有一个很小的代码洁净点：

如果未来 fixture 是空文件：

```text
originalContent = ""
```

当前 afterEach 不会 restore。

这不是 blocker。

如果顺手改，建议：

```ts
let originalContent: string | null = null;
```

然后：

```ts
if (
  originalContent !== null &&
  fs.existsSync(fixturePath)
) {
  ...
}
```

但如果不改，也不影响当前 RC。

不要为了这个做 fixture framework。

---

# 27. Playwright config 审查通过

当前使用：

```text
127.0.0.1:3030
```

而不是默认开发端口。

`VAULT_ROOT`：

```ts
path.resolve(__dirname, "test-vault")
```

也是明确的仓库测试 Vault。

通过。

---

# 28. 测试证据说明

Agent 上一轮报告：

```text
npm run typecheck: PASS
npm test: PASS
npm run build: PASS
npm run test:e2e: PASS
```

但 GitHub 当前这个 commit：

```text
没有 commit status
没有 GitHub Actions workflow run
```

因此目前可以确认：

> Agent 报告本地测试通过。

但不能说：

> GitHub CI 已独立验证。

这不是代码 blocker。

本项目目前没有必要为了 MVP 强行建设 CI。

不要因为这一点新增 Actions pipeline，除非用户之后明确要求。

---

# 29. 本轮唯一允许修改的主要文件

原则上只需要：

```text
apps/web/src/hooks/useAutosave.ts
apps/web/src/tests/autosave.test.ts
```

如果顺手修空 fixture：

```text
e2e/note-edit.spec.ts
```

除此之外不要改：

```text
App.tsx
assets.ts
paths.ts
VditorEditor.tsx
Docker
theme
search
tree
API
```

---

# 30. 推荐最小返修目标

最终 `useAutosave` 应遵守四条规则：

## Rule 1

```text
App 的 enabled/isDirty
=
“是否有未保存内容”的唯一业务真相源
```

不要再建立第二套“saved content truth”。

---

## Rule 2

```text
revision prop 同 path 更新
```

必须能进入：

```text
latestRevisionRef
```

---

## Rule 3

内部 save 成功后：

```ts
latestRevisionRef.current =
  doc.revision;
```

必须保留，以支持立即 sequential save。

---

## Rule 4

已有 in-flight 时：

```text
current draft == saving content
→ 只等待

current draft != saving content
→ saveAgain
```

---

# 31. 明确禁止重新开发 autosave framework

不要引入：

```text
useReducer
XState
RxJS
Promise queue library
mutex
event bus
save service
repository abstraction
command system
```

当前 hook 完全可以用：

```text
几个 ref
一个 debounce
一个 while
```

解决。

保持简单。

---

# 32. 验收场景

修复后必须满足：

## Case 1：普通 autosave

```text
A
→ B
→ 1200ms
→ PUT B/rev-1
→ server rev-2
→ 无继续编辑
→ 不再 PUT
```

---

## Case 2：连续编辑

```text
A/rev-1
→ B save in-flight
→ 用户输入 C
→ 第二笔 save
```

必须：

```text
PUT B/rev-1
PUT C/rev-2
```

---

## Case 3：in-flight flush，无新内容

```text
A/rev-1
→ B save in-flight
→ 用户点击另一篇 note
→ flush
```

必须：

```text
PUT count = 1
```

然后才切换。

---

## Case 4：外部程序更新当前 note

```text
A/rev-1
↓
外部修改
↓
浏览器 fetch B/rev-2
↓
用户编辑 C
```

必须：

```text
PUT C/rev-2
```

不能 409。

---

## Case 5：Conflict Reload

```text
local dirty
+
disk changed
↓
conflict
↓
用户点击“重新加载磁盘版本”
↓
得到 B/rev-2
↓
用户编辑 C
```

必须：

```text
正常 PUT C/rev-2
```

不能再次立即 conflict。

---

## Case 6：save 失败

```text
Content B
↓
save error
↓
相同 Content B
↓
用户 Ctrl+S 重试
```

必须再次调用：

```text
saveNote
```

不能因为 ref 认为 B 已保存/正在保存而跳过。

如果当前实现自然满足，可不额外增加测试。

---

# 33. 执行测试

修改后运行：

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

要求全部 PASS。

---

# 34. 不需要 Docker 阻塞本轮

如果当前环境不能 Docker：

```text
docker build: NOT RUN
```

可以接受。

因为本轮修改只涉及：

```text
Web autosave hook
Web tests
```

不需要因为 Docker 不可用阻塞。

---

# 35. 完成后提交与 push

这次任务是在当前已经使用远端审查循环的仓库中继续返修。

完成后：

1. 确认只有预期文件修改；
2. commit；
3. push `main`；
4. 返回完整 commit SHA；
5. 返回 `git status`；
6. 确认 `Everything up-to-date`。

不要 amend 历史提交。

新增一个小修 commit 即可。

建议提交信息：

```text
fix(autosave): sync external revisions and avoid redundant in-flight saves
```

---

# 36. 返回格式

## Changes

```text
apps/web/src/hooks/useAutosave.ts
- ...

apps/web/src/tests/autosave.test.ts
- ...
```

---

## Fixed

```text
[ ] same-path revision updates sync into autosave
[ ] conflict reload can save again with new revision
[ ] resetStatus no longer marks arbitrary draft as saved
[ ] in-flight flush without edits does not issue second PUT
[ ] sequential B -> C still uses rev-1 -> rev-2
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

# 37. 最终停止条件

以上 P0/P1 修复并全部测试通过后：

> **停止修改代码。**

不要继续找潜在架构问题。

不要加：

```text
Vim
行号
Focus mode
Typewriter
Outline
Git
n8n
Memos
Notion
AI
watcher
WebSocket
PWA
auth
```

下一步应当是：

```text
push
↓
远端最终 RC review
↓
test-vault 实际人工使用
↓
如果没有新的数据行为 bug
↓
再考虑挂真实 /srv/notes
```

当前 `45d367f` 已经非常接近 RC。

真正阻止它成为 RC 的核心问题只有：

> **同 path revision 同步 + resetStatus 保存基线污染 + in-flight 无变化重复 PUT。**

保持修复简单。
