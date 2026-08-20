# Note Web Round 2 返修任务

目标仓库：

https://github.com/Zhenyu-Sun-86587/note-web.git

当前分支：

main

当前审查基准提交：

a943827  
fix(remediation): fix autosave races, vditor sync, realpath containment, and preview urls

---

# 0. 任务性质

这是第二轮代码返修。

不是新功能开发。

不是架构重构。

不是安全加固项目。

不是代码洁癖式优化。

上一轮返修总体方向已经正确，本轮只处理剩余的几个真实数据行为问题。

完成本提示词中的事项并通过测试后：

**立即停止开发。**

不要继续增加任何功能。

---

# 1. 总体原则

当前架构必须保持：

- React
- Vite
- TypeScript
- Vditor IR
- Express
- Node fs/promises
- Markdown Vault 为唯一真实数据源
- 无数据库
- 无 ORM
- 无 Redis
- 无消息队列
- 无 WebSocket
- 无 watcher
- 无 CRDT
- 无全局状态管理库
- SHA-256 content revision
- temp file + rename 原子写
- 普通目录扫描
- 普通全文扫描
- 外部 custom.css
- Docker 非 root
- Git / n8n / Memos / Notion / AI 不进入主应用

禁止因为本轮返修引入新的架构层。

如果一个问题能用 5～30 行解决，就不要创建新 framework。

---

# 2. 本轮只处理以下 7 项

按顺序执行：

1. 修复 sequential autosave 第二轮使用旧 revision
2. 修复 save 失败后仍继续 switch/create/rename/move
3. 删除当前笔记前必须 flush
4. 强化 autosave regression test
5. 修复 Playwright E2E
6. E2E 运行后恢复 test-vault fixture
7. 修正 attachment symlink 检查顺序，并补一个 test

除此之外不要做任何功能扩展。

---

# 3. P0：Sequential autosave 第二轮必须使用新 revision

## 当前问题

当前 `apps/web/src/hooks/useAutosave.ts` 中，保存逻辑类似：

```ts
const doc = await saveNote(p, c, r);

setStatus("saved");
onSavedRef.current?.(doc);

if (saveAgainRef.current) {
  shouldLoop = true;
}
```

第二轮循环重新读取：

```ts
const r = latestRevisionRef.current;
```

问题在于：

```ts
onSaved(doc)
```

在 App 中最终是 React：

```ts
setOpenNote(doc)
```

React state 更新不是同步完成。

因此可能出现：

```text
初始 revision = rev-1

PUT Content B
baseRevision = rev-1
↓
成功
↓
服务器返回 rev-2
↓
用户已经输入 Content C
↓
saveAgain = true
↓
第二轮立即开始
↓
latestRevisionRef.current 仍然可能是 rev-1
↓
PUT Content C
baseRevision = rev-1
↓
服务器实际 revision 已经是 rev-2
↓
409 conflict
```

---

## 正确修法

保存成功后，hook 自己立即同步内部 revision ref：

```ts
const doc = await saveNote(p, c, r);

latestRevisionRef.current = doc.revision;

setStatus("saved");
onSavedRef.current?.(doc);
```

如果 path 也存在可能变化，可以保持当前逻辑，不要为了这个问题扩展状态系统。

重点只有：

```ts
latestRevisionRef.current = doc.revision;
```

不要重写整个 autosave。

---

# 4. 强化 Autosave Test

当前测试：

```ts
expect(saveNoteMock.mock.calls.length)
  .toBeGreaterThanOrEqual(1);
```

没有真正验证 sequential save。

必须修改为精确验证：

第一次：

```ts
expect(saveNoteMock).toHaveBeenNthCalledWith(
  1,
  "inbox/test.md",
  "Content B",
  "rev-1",
);
```

第二次：

```ts
expect(saveNoteMock).toHaveBeenNthCalledWith(
  2,
  "inbox/test.md",
  "Content C",
  "rev-2",
);
```

并且：

```ts
expect(saveNoteMock).toHaveBeenCalledTimes(2);
```

测试场景必须真实模拟：

```text
Content A / rev-1
↓
用户编辑 Content B
↓
第一笔 save 开始但尚未完全处理完
↓
用户继续编辑 Content C
↓
触发 saveAgain
↓
第一笔返回 Content B / rev-2
↓
第二笔必须使用 rev-2 保存 Content C
↓
返回 rev-3
```

不要只 mock 两次 success 后检查“调用过”。

测试必须确认第二次调用的 revision。

---

# 5. P0：saveNow() 失败后禁止继续 destructive/navigation action

当前 App 中多处逻辑类似：

```ts
if (isDirty) {
  await saveNow();
}

await handleOpenNote(targetPath);
```

问题：

```ts
saveNow(): Promise<boolean>
```

如果：

- revision conflict
- network error
- server error

会返回：

```ts
false
```

但调用方当前忽略结果。

这会导致：

```text
A.md dirty
↓
用户打开 B.md
↓
A save 失败
↓
saveNow() = false
↓
代码仍然继续
↓
打开 B.md
↓
draftContent 被覆盖
```

虽然磁盘 A.md 没被破坏，但是未保存的 draft 从 UI 消失。

这是不可接受的。

---

# 6. 建议增加一个极小 helper

在 App.tsx 内部即可。

不要建新 service。

例如：

```ts
const flushCurrentNote = async (): Promise<boolean> => {
  if (!isDirty) {
    return true;
  }

  return saveNow();
};
```

然后所有需要离开当前编辑状态的操作：

```ts
if (!(await flushCurrentNote())) {
  return;
}
```

---

# 7. 必须使用 flushCurrentNote 的地方

至少包括：

## switch note

修改为：

```ts
if (!(await flushCurrentNote())) {
  return;
}

resetStatus("idle");
await handleOpenNote(targetPath);
```

---

## create note

如果当前 note dirty：

```ts
if (!(await flushCurrentNote())) {
  return;
}
```

然后才能创建新 note。

---

## rename note

```ts
if (!(await flushCurrentNote())) {
  return;
}

await renameOrMoveNote(...);
```

---

## move note

同样：

```ts
if (!(await flushCurrentNote())) {
  return;
}
```

---

# 8. Conflict / Error 行为

如果保存失败：

```text
saveNow() === false
```

则必须：

- 保持当前 note 打开
- 保持当前 draft
- 保持 conflict/error 状态
- 不执行用户原本想执行的 switch/create/rename/move

不要自动 alert 后继续。

不要自动覆盖。

不要自动 reload。

不要做 merge。

用户后续自己处理 conflict。

---

# 9. P1：删除当前笔记前必须 flush

当前删除存在竞态：

```text
Autosave:
写 temp
        │
用户删除 A.md
        │
unlink A.md
        │
旧 save 继续
        │
rename temp -> A.md
        │
文件复活
```

---

## 修法

如果删除的是当前打开的 note：

```ts
if (openNote?.path === deleteTarget.path) {
  if (!(await flushCurrentNote())) {
    return;
  }
}
```

然后再：

```ts
await deleteNote(deleteTarget.path);
```

删除成功后：

```ts
resetStatus("idle");
setOpenNote(null);
setDraftContent("");
```

---

## 注意

如果删除的是文件树中另一个当前没有打开的 note：

不需要 flush 当前 note，除非当前操作本身会导致导航变化。

保持简单。

---

# 10. 不要为了删除 race 修改后端

禁止：

- 文件锁
- mutex
- lockfile
- fs transaction
- write queue
- delete tombstone
- journal

前端正确等待现有 save 就足够。

---

# 11. P1：修 Playwright E2E

当前 E2E 使用：

```ts
page.locator(".status-bar")
```

但真实 DOM class 是：

```tsx
<footer className="statusbar">
```

所以改成：

```ts
const statusBar = page.locator(".statusbar");
```

---

当前 E2E 等待：

```text
Saved
```

但真实 UI 显示：

```text
已保存
```

所以改为：

```ts
await expect(statusBar).toContainText("已保存", {
  timeout: 8000,
});
```

不要为了测试把 UI 改成英文。

---

# 12. E2E 流程保持简单

只测试：

```text
启动 test-vault
↓
页面打开
↓
自动打开 welcome.md
↓
输入唯一字符串
↓
等待 已保存
↓
reload
↓
确认唯一字符串仍存在
```

不要增加十几个 UI 测试。

---

# 13. E2E 必须恢复 fixture

目前 E2E 会修改：

```text
test-vault/inbox/welcome.md
```

这是仓库 tracked fixture。

如果不恢复，每次跑 E2E 都会污染 working tree。

---

## 最简单方案

测试开始前：

```ts
const originalContent = fs.readFileSync(
  "test-vault/inbox/welcome.md",
  "utf8",
);
```

结束后：

```ts
test.afterEach(() => {
  fs.writeFileSync(
    "test-vault/inbox/welcome.md",
    originalContent,
    "utf8",
  );
});
```

或者等价的简单 beforeEach/afterEach。

不要为 E2E 建复杂 fixture manager。

---

# 14. E2E cleanup 即使失败也必须运行

使用：

```ts
test.afterEach(...)
```

不要把恢复逻辑放在测试最后几行：

```ts
// 不要
await test...
fs.writeFileSync(...)
```

因为中间 assert fail 时不会执行。

---

# 15. P2：attachment ancestor symlink 检查顺序

当前 `saveAsset()`：

```ts
await fs.promises.mkdir(targetDirFull, {
  recursive: true,
});

await assertRealPathInsideVault(
  vaultRoot,
  targetDirFull,
  "existing",
);
```

问题：

如果：

```text
/vault/attachments -> /tmp/outside
```

那么 `mkdir` 可能已经先在：

```text
/tmp/outside/YYYY/MM
```

创建目录。

之后 realpath 才拒绝。

图片最终不会写出去，所以这不是严重数据漏洞，但顺序应该修正。

---

# 16. attachment 修复方案

不要做复杂 secure mkdir。

先验证 `attachments` 根本身。

例如：

```ts
const attachmentsRoot = path.join(
  vaultRoot,
  "attachments",
);
```

如果已经存在：

```ts
await assertRealPathInsideVault(
  vaultRoot,
  attachmentsRoot,
  "existing",
);
```

然后再：

```ts
await fs.promises.mkdir(
  targetDirFull,
  { recursive: true },
);
```

再检查一次最终 targetDir：

```ts
await assertRealPathInsideVault(
  vaultRoot,
  targetDirFull,
  "existing",
);
```

---

# 17. 如果 attachments 不存在

正常情况可能是首次上传时：

```text
/vault/attachments
```

尚不存在。

保持实现简单。

可以：

1. 检查 Vault root realpath；
2. 判断 `attachments` 是否存在；
3. 如果不存在，在 Vault root 下创建；
4. 创建后立即 realpath containment；
5. 再创建 year/month。

不要写通用 recursive secure mkdir framework。

---

# 18. 增加 attachment symlink test

新增测试：

```text
outsideDir = temp dir

vault/
  attachments -> outsideDir
```

然后：

```text
POST /api/assets
```

必须拒绝。

同时验证：

```text
outsideDir
```

中没有生成最终图片文件。

如果方便，再断言 year/month 没被创建。

---

# 19. 当前通过的东西不要再碰

以下上一轮问题已经基本修好。

本轮禁止再次重写。

## Vditor external value sync

保留当前：

```ts
if (editor.getValue() !== value) {
  syncingRef.current = true;
  editor.setValue(value);
  syncingRef.current = false;
}
```

最多可以把：

```ts
syncingRef.current = false;
```

放到：

```ts
finally
```

但只有顺手改即可，不是重点。

不要重新设计 Vditor wrapper。

---

## Preview URL

保留：

```text
磁盘 Markdown：
../../attachments/x.png

浏览器 DOM：
/api/raw/attachments/x.png
```

不要把 `/api/raw/` 写进 Markdown。

不要做 Markdown regex rewrite。

不要换 parser。

---

## realpath containment

现有 Note/Folder/Raw realpath containment 保留。

不要再扩成：

- chroot
- openat
- sandbox daemon
- inode checking
- security framework

只补 attachment upload。

---

## custom.css

已经修为最后加载。

不要再改主题系统。

---

## compose.prod.yml

已经修成：

```yaml
- ../config:/config:ro
```

不要再调整 Docker 架构。

---

## Vault root delete

已经修好。

不要再改。

---

## first auto-open

已经使用：

```ts
hasAutoOpenedRef
```

保持。

不要引入路由或 session store。

---

# 20. 本轮禁止新增的功能

明确禁止：

- Vim mode
- 行号
- Focus mode
- Typewriter mode
- Outline
- Source mode
- backlinks
- Wiki links
- graph
- tags
- frontmatter UI
- Git
- n8n
- Memos
- Notion
- AI
- file watcher
- WebSocket
- PWA
- offline
- multi-vault
- auth
- account
- recycle bin
- version history UI
- diff UI
- merge UI
- drag-and-drop move
- command palette 扩展
- 新的 UI redesign

本轮只修 bug。

---

# 21. 推荐执行顺序

## Phase 1

修：

```text
apps/web/src/hooks/useAutosave.ts
```

内容：

```text
latestRevisionRef.current = doc.revision
```

然后强化：

```text
apps/web/src/tests/autosave.test.ts
```

精确断言：

```text
rev-1 → rev-2
```

---

## Phase 2

修：

```text
apps/web/src/App.tsx
```

增加最小：

```ts
flushCurrentNote()
```

处理：

```text
switch
create
rename
move
delete-current
```

保存失败就 return。

---

## Phase 3

修：

```text
e2e/note-edit.spec.ts
```

包括：

```text
.statusbar
已保存
fixture restore
```

---

## Phase 4

修：

```text
apps/server/src/vault/assets.ts
apps/server/src/tests/assets.test.ts
```

只解决 attachment symlink 创建顺序问题。

---

# 22. 必须新增/修改的测试

至少保证以下测试存在。

## Autosave test 1

```text
clean
→ 时间过去
→ 0 PUT
```

现有可保留。

---

## Autosave test 2

```text
A
→ B
→ debounce
→ PUT once
→ onSaved B
→ 无继续编辑
→ 不再 PUT
```

现有可保留。

---

## Autosave test 3

必须严格：

```text
A / rev-1
→ B
→ save starts
→ C arrives
→ second save
```

断言：

```text
PUT 1:
B + rev-1

PUT 2:
C + rev-2
```

不能只：

```ts
toBeGreaterThanOrEqual(1)
```

---

## App 行为

如果当前没有方便的 App 单测框架，不要求为了这个创建复杂 UI test。

核心通过 E2E + autosave hook 测试覆盖即可。

不要为了测试 App.tsx 引入大量 mock infrastructure。

---

## Asset symlink

必须覆盖：

```text
attachments symlink -> outside
```

上传拒绝。

---

## E2E

真实：

```text
edit
save
reload
persist
```

并恢复 fixture。

---

# 23. 测试执行要求

返修后必须真实执行：

```bash
npm run typecheck
```

然后：

```bash
npm test
```

然后：

```bash
npm run build
```

然后：

```bash
npm run test:e2e
```

如果 Playwright browser 未安装：

```bash
npx playwright install chromium
```

再运行：

```bash
npm run test:e2e
```

如果当前执行环境明确无法安装 Chromium，可以报告：

```text
NOT RUN - environment limitation
```

但不能把 `npm test` 当作 E2E 已通过。

---

# 24. Docker 最小验证

如果 Docker 可用：

```bash
docker build -f docker/Dockerfile .
```

以及：

```bash
docker compose -f docker/compose.dev.yml config
```

只验证 dev/test Vault。

---

# 25. 禁止使用真实 Vault

本轮不得自动：

```text
/srv/notes
```

挂载并进行写测试。

所有自动测试：

```text
temp dir
或
test-vault
```

---

# 26. 返回结果格式

完成后只按以下格式回复。

## Changes

```text
apps/web/src/hooks/useAutosave.ts
- ...

apps/web/src/tests/autosave.test.ts
- ...

apps/web/src/App.tsx
- ...

e2e/note-edit.spec.ts
- ...

apps/server/src/vault/assets.ts
- ...

apps/server/src/tests/assets.test.ts
- ...
```

---

## Fixed

必须逐项报告：

```text
[ ] sequential autosave now uses returned revision
[ ] autosave test verifies rev-1 -> rev-2
[ ] switch aborts when flush fails
[ ] create aborts when flush fails
[ ] rename aborts when flush fails
[ ] move aborts when flush fails
[ ] delete-current waits for flush
[ ] E2E selector fixed
[ ] E2E checks Chinese "已保存"
[ ] E2E restores fixture
[ ] attachment symlink upload blocked before outside write
```

---

## Verification

必须贴真实结果：

```text
npm run typecheck:
PASS / FAIL

npm test:
PASS / FAIL

npm run build:
PASS / FAIL

npm run test:e2e:
PASS / FAIL / NOT RUN

docker build:
PASS / FAIL / NOT RUN
```

---

## Git

最后报告：

```text
branch:
commit:
git status:
```

如果用户没有明确要求 commit/push：

不要自行 push。

如果当前任务上下文已经明确授权提交和推送，则按已有授权执行。

---

# 27. 最终停止条件

当：

```text
typecheck pass
unit/integration test pass
build pass
E2E pass
```

并且上面的 7 个返修项完成后：

**停止。**

不要继续找“顺手还能优化的地方”。

不要做第三轮架构整理。

不要添加功能。

下一阶段应该是：

```text
test-vault 实际使用
→ 人工测试真实编辑流程
→ 再做最终 MVP release candidate review
```

本轮目标只是：

> 把 a943827 从“基本可测试”推进到“数据行为足够可信的 MVP Release Candidate”。

保持简单。
