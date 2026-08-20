# Note Web 代码审查返修提示词

> 目标仓库：`Zhenyu-Sun-86587/note-web`
>
> 任务性质：**返修，不是重构，不是继续开发新功能**
>
> 当前阶段：MVP 主干已经完成第一版，实现方向正确，但存在若干必须修复的状态同步、文件系统边界和部署细节问题。
>
> 本提示词应直接交给开发 Agent 执行。

---

# 0. 你的任务

你现在需要对 `note-web` 仓库进行一次**严格限定范围的返修**。

本轮目标不是继续增加功能，也不是重新设计架构，而是：

1. 修复已经确认存在的核心行为 bug；
2. 保持 Markdown Vault 作为唯一真实数据源；
3. 保持当前 React + Vite + Vditor IR + Express Thin API 架构；
4. 保持无数据库、无 ORM、无 Redis、无队列、无 WebSocket；
5. 不引入新的架构层；
6. 不为了“安全”“扩展性”“以后可能需要”而做额外复杂化；
7. 修复后让项目可以安全进入 **独立测试 Vault 的实际使用阶段**；
8. 暂时不要挂真实 `/srv/notes`，直到本轮验收通过。

---

# 1. 总体判断

当前仓库总体方向是正确的。

已经正确实现并且**必须保留**的核心设计包括：

- React
- Vite
- TypeScript
- Vditor IR
- Express
- Node 原生 `fs/promises`
- Markdown 文件直接落盘
- Markdown Vault 为唯一真实数据源
- 无数据库
- 无 ORM
- 无 Redis
- 无消息队列
- 无 WebSocket
- 无 CRDT
- 无全局状态库
- SHA-256 内容 revision
- temp file + rename 原子写
- 简单目录扫描
- 简单全文搜索
- 独立测试 Vault
- 非 root Docker
- custom CSS / fonts 外部挂载
- Git / n8n / Memos / Notion / AI 不进入核心主干

本轮**禁止推翻这些设计**。

---

# 2. 返修原则

按照以下原则工作：

## 2.1 只修确认的问题

不要因为看到代码“还能更优雅”就改。

不要做：

- 大范围重命名；
- 文件重新分层；
- 引入 service/repository/provider/adapter；
- 引入状态管理库；
- 引入新的异步框架；
- 引入新的表单库；
- 引入新的测试框架；
- 引入新的日志框架；
- 引入新的安全框架；
- 引入新的文件存储抽象；
- 引入新的后台同步机制；
- 引入 watcher；
- 引入数据库；
- 引入索引服务；
- 引入复杂 diff/merge UI；
- 引入三方合并；
- 引入权限/RBAC；
- 引入认证系统。

如果一个 bug 能用 20 行代码修，就不要写 200 行框架。

## 2.2 不做防御性过度设计

本项目运行在个人服务器上，外层已有反向代理或访问控制。

所以：

- 不做“零信任”式应用内权限设计；
- 不做多租户；
- 不做 capability token；
- 不做 sandbox daemon；
- 不做 chroot；
- 不做 openat 系列复杂封装；
- 不做 inode locking；
- 不做锁文件系统；
- 不做 distributed lock；
- 不做后台安全扫描。

只修已经确认的实际文件边界问题。

## 2.3 测试原则

自动测试：

- 必须使用临时目录或 `test-vault`；
- 绝不接触 `/srv/notes`；
- 不为了覆盖率而测试；
- 每个已确认 bug 至少有一个回归测试；
- E2E 只保留极少量高价值测试。

不要设置 100% coverage。

---

# 3. 当前审查结论

| 优先级 | 问题 | 本轮是否必须修 |
|---|---|---|
| P0 | Autosave 存在持续重复保存风险 | 必须 |
| P1 | in-flight save + 切换笔记 race | 必须 |
| P1 | conflict 状态泄漏到下一篇笔记 | 必须 |
| P1 | 外部修改后 React 更新但 Vditor 内容不更新 | 必须 |
| P1 | Markdown 相对图片路径与浏览器 preview URL 没接通 | 必须 |
| P1 | symlink ancestor 可绕过 Vault lexical boundary | 必须 |
| P2 | custom.css 加载顺序错误 | 应修 |
| P2 | production compose config 路径错误 | 应修 |
| P2 | dirty 页面关闭无确认 | 应修 |
| P2 | Vault root 理论上可被 folder delete 删除 | 应修 |
| P3 | Playwright 只有页面标题 smoke test | 补一个核心 E2E |
| P3 | 删除当前笔记后自动打开第一篇 | 可顺手修正 |

---

# 4. P0：修复 Autosave 重复保存

## 4.1 当前问题

当前 `useAutosave.ts` 的 effect 同时依赖：

- `content`
- `path`
- `revision`
- `status`
- `performSave`

并且 effect 内会：

```ts
setStatus("dirty")
```

保存成功后：

```ts
setStatus("saved")
onSaved(doc)
```

而 `onSaved(doc)` 会更新 `openNote`，从而更新 `revision`。

这会导致 effect 在：

- `dirty`
- `saving`
- `saved`
- revision 改变

时不断重新触发。

存在以下风险：

```text
effect
→ dirty
→ 1200ms
→ save
→ saving
→ saved
→ revision changed
→ effect again
→ dirty
→ 1200ms
→ save again
→ ...
```

即使最终没有形成无限循环，当前模型也错误地把“保存成功后的状态变化”视作新的 dirty 事件。

## 4.2 正确模型

**dirty 不应该由 autosave hook 自己猜。**

dirty 应直接由：

```ts
draftContent !== openNote.content
```

定义。

也就是说：

- `openNote.content` = 服务端最后确认保存的版本；
- `draftContent` = 当前编辑器内容；
- 两者不同 = dirty；
- 两者相同 = clean。

推荐在 `App.tsx` 中定义：

```ts
const isDirty =
  openNote !== null &&
  draftContent !== openNote.content;
```

然后：

```ts
useAutosave({
  path: openNote?.path ?? null,
  content: draftContent,
  revision: openNote?.revision ?? null,
  enabled: Boolean(openNote) && isDirty,
  ...
});
```

## 4.3 `useAutosave` 修改要求

`useAutosave` 不要在每次 effect 里无条件：

```ts
setStatus("dirty");
```

改成：

- `enabled === true` 时安排 debounce；
- `enabled === false` 时不安排保存；
- 保存成功后返回 saved；
- 不应该因为 revision 更新再次启动保存；
- `status` 不要作为 debounce effect 的触发依赖；
- callback 使用 ref，避免 `performSave` 因 callback identity 变化不断重建。

建议保留：

```ts
savingRef
saveAgainRef
debounceTimerRef
```

不要引入 RxJS、queue library 或状态机库。

## 4.4 必须增加回归测试

新增一个前端 hook 单测，核心断言：

```text
初始内容 A
→ 修改成 B
→ debounce
→ 发出一次 PUT
→ 服务端返回 B + new revision
→ onSaved 更新 openNote
→ 时间继续推进
→ 不应该再次发出 PUT
```

这个测试是本轮最高优先级。

---

# 5. P1：修复 in-flight save 与切换笔记的 race

## 5.1 当前问题

当前切换笔记逻辑大致：

```ts
if (dirty) {
  await saveNow();
}

await handleOpenNote(targetPath);
```

但是 `saveNow()` 在已有保存请求进行中时：

```ts
if (savingRef.current) {
  saveAgainRef.current = true;
  return false;
}
```

它没有等待正在执行的请求真正完成。

因此可能：

```text
A.md 正在保存
↓
用户点击 B.md
↓
saveNow() 发现正在保存，立即返回
↓
B.md 被打开
↓
A.md 的旧保存请求返回
↓
onSaved(A)
↓
setOpenNote(A)
↓
UI 被旧请求拉回 A
```

## 5.2 最小修法

不要建立 command queue。

只增加一个：

```ts
const inFlightRef = useRef<Promise<boolean> | null>(null);
```

或者等价的极简实现。

要求：

```ts
await saveNow()
```

或者新命名：

```ts
await flush()
```

必须满足：

> 当前需要保存的内容真正落盘后才 resolve。

如果已经有 save 在运行：

- 等待它；
- 如果等待过程中产生了新内容，再执行一次保存；
- 最终 resolve 时，当前 draft 已经处理完。

## 5.3 应用场景

以下动作前，如果当前笔记 dirty，都应调用同一个 flush：

- 切换笔记；
- rename；
- move；
- delete；
- 手动 Ctrl/Cmd+S。

不要为每个动作写不同逻辑。

---

# 6. P1：修复 conflict 状态泄漏

## 6.1 当前问题

A.md 出现 revision conflict 后：

```ts
status = "conflict"
```

用户切到 B.md：

```ts
setOpenNote(doc)
setDraftContent(doc.content)
```

但是没有 reset save status。

于是 B.md 仍可能显示冲突状态，并停止 autosave。

## 6.2 修复要求

当打开新的 path 时：

```ts
resetStatus("idle")
```

或者等价方式。

必须保证：

```text
A.md conflict
→ 用户打开 B.md
→ B.md 正常进入 clean 状态
→ B.md 可以继续 autosave
```

不要建立 per-note 状态缓存。

---

# 7. P1：修复外部修改后 Vditor 不同步

## 7.1 当前问题

现在外部变化检查逻辑基本正确：

```text
窗口重新 focus
→ fetch 当前 note
→ revision 不同
→ 如果本地 clean：更新 React openNote + draftContent
→ 如果本地 dirty：进入 conflict
```

但 `VditorEditor` 只在初始化时读取：

```ts
value
```

Vditor 实例创建 effect 依赖：

```ts
[hostId, notePath, theme]
```

并不监听后续 `value`。

所以：

```text
磁盘内容变了
→ React state 变了
→ Vditor DOM 仍旧显示旧内容
```

这违反 Markdown Vault 作为真源的要求。

## 7.2 修复方式

不要把 `value` 加进 Vditor 初始化 effect。

否则每个字符变化都会 destroy / recreate editor。

正确做法：

```ts
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;

  const current = editor.getValue();
  if (current !== value) {
    editor.setValue(value);
  }
}, [value]);
```

## 7.3 注意程序性更新

如果 Vditor 的 `setValue()` 会触发 `input` callback：

只加一个非常小的 guard，例如：

```ts
const syncingRef = useRef(false);
```

程序更新：

```ts
syncingRef.current = true;
editor.setValue(value);
syncingRef.current = false;
```

input：

```ts
if (syncingRef.current) return;
onChangeRef.current(value);
```

如果当前 Vditor 版本的 `setValue()` 不触发 input，则不需要这个 guard。

先根据实际行为验证，不要提前写复杂同步层。

## 7.4 必须验证的流程

```text
打开 A.md
→ 编辑器 clean
→ 外部程序直接修改 A.md
→ 浏览器切走再切回来
→ fetch 到新 revision
→ Vditor 显示新正文
```

以及：

```text
打开 A.md
→ 本地有未保存改动
→ 外部程序修改 A.md
→ 浏览器 focus
→ 不覆盖本地 draft
→ 显示 conflict banner
```

---

# 8. P1：修复相对图片预览

## 8.1 当前正确部分

后端附件保存逻辑是正确方向：

```text
attachments/YYYY/MM/<timestamp>-name.png
```

并且返回：

```ts
{
  vaultPath,
  markdownPath,
  previewUrl
}
```

其中 `markdownPath` 是相对于当前 Markdown 文件目录计算的。

这必须保留。

例如磁盘内容：

```md
![diagram](../../attachments/2026/08/diagram.png)
```

是正确的。

不要把磁盘 Markdown 改成：

```md
![diagram](/api/raw/...)
```

因为这会破坏 Typora / Obsidian / Git checkout 下的可移植性。

## 8.2 当前问题

浏览器实际附件读取接口是：

```text
/api/raw/<vault-relative-path>
```

但 Markdown 中保存的是：

```text
../../attachments/...
```

浏览器渲染时会把它当普通 URL，无法自动映射到 `/api/raw/`。

## 8.3 修复原则

**只改显示层，不改存盘 Markdown。**

优先尝试 Vditor 官方的：

```text
linkBase
```

或当前版本等价能力。

目标是：

```md
../../attachments/2026/08/a.png
```

在浏览器预览层解析为：

```text
/api/raw/attachments/2026/08/a.png
```

但编辑器 getValue / 保存结果仍保持：

```md
../../attachments/2026/08/a.png
```

## 8.4 fallback

如果当前 Vditor IR 的 linkBase 无法满足：

只实现一个小型 DOM preview URL 修正函数。

允许：

- 找 Vditor 渲染后的 `<img src>`；
- 根据当前 note path + Markdown relative path 解算 vault relative path；
- 替换 DOM 里的 `src` 为 `/api/raw/...`。

禁止：

- 保存前 regex 替换整篇 Markdown；
- 保存后 regex 恢复；
- AST 重写整个文档；
- 引入 Markdown parser 只为图片 URL。

## 8.5 必须增加验证

新增测试或最小 E2E：

```text
note:
projects/a.md

markdown:
![img](../attachments/x.png)

预览:
请求 /api/raw/attachments/x.png

保存后磁盘:
仍然是 ../attachments/x.png
```

---

# 9. P1：修复 symlink ancestor escape

## 9.1 当前已做正确的保护

当前 path 模块已经做了：

- 拒绝 absolute path；
- 拒绝 `..`；
- 拒绝 hidden segment；
- 拒绝 `.git`；
- 限制 `.md`；
- lexical `path.resolve` containment；
- 最终节点 `lstat()`；
- 最终节点 symlink 拒绝。

这些保留。

## 9.2 当前漏洞

如果：

```text
/vault/escape -> /tmp/outside
```

请求：

```text
escape/secret.md
```

lexical path：

```text
/vault/escape/secret.md
```

仍然看起来在 Vault 里面。

但 OS 会跟随中间 symlink：

```text
/vault/escape
→ /tmp/outside
```

最终实际访问：

```text
/tmp/outside/secret.md
```

当前只检查最终节点是不是 symlink，无法阻止这种 ancestor symlink。

## 9.3 最小修法

不要引入复杂安全库。

增加一个统一 helper，例如：

```ts
async function assertRealPathInsideVault(
  vaultRoot: string,
  targetPath: string,
  mode: "existing" | "new",
): Promise<void>
```

### existing target

```text
realVault = realpath(vaultRoot)
realTarget = realpath(targetPath)
path.relative(realVault, realTarget)
→ 必须仍在 vault 内
```

### new target

目标文件不存在，所以检查 parent：

```text
realVault = realpath(vaultRoot)
realParent = realpath(dirname(targetPath))
path.relative(realVault, realParent)
→ 必须仍在 vault 内
```

## 9.4 附件也要共用

`saveAsset()` 也必须防止：

```text
/vault/attachments -> /tmp/outside
```

的情况。

不要单独再写另一套路径规则。

尽量让 note / folder / asset 都复用同一个 realpath containment helper。

## 9.5 必须增加回归测试

测试场景：

```text
tmpVault/
  safe/
  escape -> outsideDir

outsideDir/
  secret.md
```

断言：

```text
GET note escape/secret.md
→ 403 或对应 ACCESS_DENIED
```

新文件：

```text
POST note escape/new.md
→ 拒绝
```

附件：

```text
attachments -> outsideDir
POST asset
→ 拒绝
```

测试只用临时目录。

---

# 10. P2：修复 custom.css 加载顺序

## 10.1 当前问题

当前 HTML 先加载：

```html
<link rel="stylesheet" href="/custom.css" />
```

然后 React bundle 才 import：

```text
variables.css
light.css
dark.css
app.css
vditor-overrides.css
```

这意味着用户 custom CSS 可能会被后加载的内置 CSS 覆盖。

这和“custom.css 是最终覆盖层”的设计相反。

## 10.2 修复要求

最终 CSS 顺序应是：

```text
reset
variables
theme
app
vditor overrides
custom.css
```

`custom.css` 必须最后。

实现方式从简。

可选择：

- 在 `main.tsx` 启动后 append `/custom.css` link；
- 或其他最小方式让 custom.css 最后加载。

不要引入主题系统。

---

# 11. P2：修复 production compose config 路径

当前：

```text
docker/compose.prod.yml
```

里面使用：

```yaml
- ./config:/config:ro
```

但仓库 config 实际在：

```text
repo-root/config
```

而 compose 文件在：

```text
repo-root/docker/
```

应该与 dev compose 保持一致：

```yaml
- ../config:/config:ro
```

只改这一处。

不要重新设计 compose。

---

# 12. P2：增加 dirty 页面关闭确认

当：

```ts
isDirty === true
```

时监听：

```text
beforeunload
```

让浏览器显示原生离开确认。

简单实现即可。

不要实现自定义离开弹窗。

---

# 13. P2：禁止删除 Vault root

当前 root folder 可以通过：

```text
""
"."
"/"
```

解析为 vault root。

这对读取 tree 是合理的。

但 DELETE folder 时不能允许删除 root。

在 `deleteFolder()` 或 route 中做最小判断：

```ts
if (
  !relativePath ||
  relativePath === "." ||
  relativePath === "/"
) {
  throw ...
}
```

不要影响读取 root。

---

# 14. P3：补一个真正有价值的 E2E

当前 Playwright 只有：

```text
打开页面
→ 检查 title
```

这不是核心验证。

本轮不要扩成大型 E2E suite。

只加一个：

```text
启动独立 test-vault
→ 打开 welcome.md
→ 在 Vditor 中输入一个唯一文本
→ 等待 Saved
→ reload 页面
→ 再打开 welcome.md
→ 唯一文本仍存在
```

如果 Vditor DOM 自动化难度很高，可以用当前最稳定的可编辑节点定位。

不要为了 E2E 改产品代码结构。

---

# 15. Playwright 依赖

检查根目录或合适 workspace 是否已经声明：

```text
@playwright/test
```

如果 `playwright.config.ts` 已存在但 dependency 缺失，则补上 devDependency。

不要引入第二个 E2E 框架。

---

# 16. 删除当前笔记后的行为

开发计划原本要求：

```text
删除当前文件
→ editor empty
```

当前存在自动打开 tree 第一篇 note 的 effect。

如果删除当前 note 后 tree 刷新，该 effect 会马上打开下一篇。

请修正为：

```text
首次应用启动
→ 可以自动打开第一篇

用户明确删除当前 note
→ 保持 EmptyEditor
```

最简单可增加：

```ts
const hasAutoOpenedRef = useRef(false);
```

只让首次加载自动打开一次。

不要引入 router/session persistence。

---

# 17. 不要修改的后端设计

以下代码即使“不够高级”，也不要优化。

## 17.1 原子写

保留：

```text
temp file
→ rename
```

不要加：

- lock file
- write queue
- journal
- shadow copy
- backup copy

## 17.2 revision

保留：

```text
sha256(content)
```

不要改成：

- ETag framework
- version database
- mtime + size
- UUID version
- file lock

## 17.3 搜索

继续：

```text
readdir
→ readFile
→ includes
```

不要加：

- SQLite FTS
- Meilisearch
- ripgrep daemon
- Lucene
- search index
- worker thread

只有真实 Vault 规模出现性能问题后再优化。

## 17.4 Tree

继续每次直接扫描。

不要加 watcher/cache。

---

# 18. 不要新增这些功能

本轮严禁顺手增加：

- Vim mode；
- 行号；
- Focus mode；
- Typewriter mode；
- 大纲；
- 双栏 source preview；
- backlinks；
- Wiki links；
- graph；
- tags；
- metadata database；
- command palette 扩展；
- PWA；
- offline；
- Git；
- n8n；
- Memos；
- Notion；
- AI；
- 多 Vault；
- 登录；
- 用户系统；
- 文件历史 UI；
- 回收站；
- 自动 merge；
- diff UI；
- 批量操作；
- drag & drop move。

这些都不是本轮任务。

---

# 19. 推荐返修顺序

严格按以下顺序执行。

## Phase 1：Autosave 修复

修改：

```text
apps/web/src/hooks/useAutosave.ts
apps/web/src/App.tsx
```

完成：

- dirty 由 `draftContent !== openNote.content` 定义；
- 去掉 autosave 自激循环；
- 保存成功后不会再次自动 PUT；
- 新增回归测试。

完成后运行：

```bash
npm run test -w apps/web
npm run typecheck -w apps/web
```

通过后再继续。

## Phase 2：Save flush / race / conflict reset

修改：

```text
apps/web/src/hooks/useAutosave.ts
apps/web/src/App.tsx
```

完成：

- `saveNow/flush` 等待 in-flight save；
- switch note 前真正 flush；
- rename/move/delete 前如果 dirty 也 flush；
- path 改变时 reset conflict；
- 不增加 queue library。

完成后测试。

## Phase 3：Vditor 外部 value 同步

修改：

```text
apps/web/src/components/editor/VditorEditor.tsx
```

完成：

- Vditor 初始化不依赖 value；
- value 外部改变时调用 `setValue()`；
- 必要时加最小 syncing guard；
- 不 destroy/recreate editor。

验证外部磁盘修改场景。

## Phase 4：图片 preview URL

修改：

```text
apps/web/src/components/editor/VditorEditor.tsx
```

必要时：

```text
apps/web/src/utils/...
```

完成：

- Markdown 仍保存 relative path；
- 浏览器 preview 使用 `/api/raw/...`；
- 优先 Vditor linkBase；
- 不改磁盘 Markdown；
- 增加最小测试。

## Phase 5：realpath containment

修改：

```text
apps/server/src/vault/paths.ts
apps/server/src/vault/assets.ts
```

测试：

```text
apps/server/src/tests/paths.test.ts
apps/server/src/tests/assets.test.ts
```

完成：

- ancestor symlink 无法逃逸；
- existing/new note 都覆盖；
- folder 覆盖；
- attachments 覆盖；
- 不引入复杂安全机制。

## Phase 6：小修

一次性处理：

- custom.css 最后加载；
- prod compose `../config`；
- beforeunload；
- root folder delete 禁止；
- 首次 auto-open only；
- Playwright dependency；
- 一个 edit-save-reload E2E。

---

# 20. 验收标准

## 20.1 Autosave

```text
打开笔记
→ 不编辑
→ 不产生持续 PUT
```

```text
编辑一次
→ 1200ms 后保存一次
→ 保存成功
→ 后续没有新增修改
→ 不再保存
```

```text
保存过程中继续输入
→ 第一笔保存结束
→ 自动保存最新内容
→ 最终磁盘内容为最新 draft
```

## 20.2 切换笔记

```text
A dirty
→ 点击 B
→ A 先真正保存
→ B 再打开
→ A 的旧 save response 不会覆盖 B 状态
```

## 20.3 conflict

```text
A conflict
→ 打开 B
→ B 不继承 conflict
→ B 可以正常保存
```

## 20.4 外部修改

```text
A clean
→ 外部程序修改 A
→ 浏览器重新 focus
→ Vditor 显示磁盘新内容
```

```text
A dirty
→ 外部程序修改 A
→ focus
→ 不覆盖本地 draft
→ conflict
```

## 20.5 图片

```text
上传图片
→ 文件保存到 attachments/YYYY/MM
→ Markdown 使用相对路径
→ 当前浏览器能看到图片
→ Markdown 文件复制到 Typora/Obsidian 后仍能依靠相对路径工作
```

## 20.6 Vault 边界

以下全部不能逃逸 Vault：

```text
../
absolute
.hidden
.git
final symlink
ancestor symlink
```

## 20.7 主题

`custom.css` 能够覆盖：

```css
--editor-max-width
--editor-font-size
--font-editor
```

以及 Vditor 最终样式。

## 20.8 Docker

```text
docker compose -f docker/compose.dev.yml
```

只挂：

```text
test-vault
```

生产 compose config 路径正确。

本轮**不要自动切到真实 `/srv/notes` 进行测试**。

---

# 21. 最终执行命令

返修结束后至少执行：

```bash
npm install
npm run typecheck
npm test
npm run build
```

如果 Playwright 环境可用：

```bash
npx playwright test
```

如果 Docker 环境可用：

```bash
docker build -f docker/Dockerfile .
docker compose -f docker/compose.dev.yml config
```

不要为了“测试生产数据”启动 `/srv/notes`。

---

# 22. 提交前自检

在提交前逐项回答：

```text
[ ] 是否仍然无数据库？
[ ] 是否没有新加状态库？
[ ] 是否没有新加 watcher？
[ ] 是否没有新加 WebSocket？
[ ] 是否没有新加 queue？
[ ] 是否没有新加 Git/n8n/Memos/Notion/AI？
[ ] autosave 是否只在实际 dirty 时工作？
[ ] saveNow 是否真正等待 in-flight save？
[ ] conflict 是否不会泄漏到另一篇 note？
[ ] 外部 value 是否真正同步到 Vditor？
[ ] Markdown 图片路径是否仍是相对路径？
[ ] browser preview 是否能读取图片？
[ ] ancestor symlink 是否被阻止？
[ ] custom.css 是否最后覆盖？
[ ] test 是否仍然不接触 /srv/notes？
[ ] 是否没有顺手重构无关模块？
```

只要其中任何一项不满足，先修再提交。

---

# 23. 本轮明确不要求“完美”

## 23.1 搜索慢

如果 `test-vault` 正常工作，就不要优化。

## 23.2 UI 不够漂亮

不要在本轮继续调主题。

## 23.3 App.tsx 较大

当前 MVP 可以接受。

不要因为文件超过几百行就拆 controller/service/context。

## 23.4 Vditor API 不够优雅

只要能工作，不要换 Milkdown/TipTap/CodeMirror。

## 23.5 Express route 重复 try/catch

如果没有造成 bug，不要为了 DRY 重构。

---

# 24. 交付格式

完成返修后，请按以下格式汇报。

## 24.1 修改摘要

按文件列：

```text
apps/web/src/hooks/useAutosave.ts
- ...

apps/web/src/App.tsx
- ...

apps/web/src/components/editor/VditorEditor.tsx
- ...

apps/server/src/vault/paths.ts
- ...
```

## 24.2 已修复问题

逐项列出：

```text
P0 Autosave repeat save: fixed
P1 In-flight switch race: fixed
P1 Conflict leak: fixed
P1 External Vditor sync: fixed
P1 Relative image preview: fixed
P1 Symlink ancestor escape: fixed
P2 Custom CSS order: fixed
P2 Compose path: fixed
P2 beforeunload: fixed
P2 Root delete: fixed
P3 E2E: added
```

## 24.3 测试结果

提供真实执行结果：

```text
npm run typecheck
PASS / FAIL

npm test
PASS / FAIL

npm run build
PASS / FAIL

npx playwright test
PASS / FAIL / NOT RUN

docker build
PASS / FAIL / NOT RUN
```

不要写“理论上可以”。

## 24.4 剩余已知问题

只报告真实还存在的问题。

不要把“未来可以做”写成问题。

---

# 25. 最终停止条件

完成以上返修并通过测试后：

**停止。**

不要继续：

- 加新功能；
- 做视觉优化；
- 做 Git；
- 做 n8n；
- 做 Memos；
- 做 Notion；
- 做 AI；
- 做 Vim；
- 做行号；
- 做 PKM 功能。

下一步应该是：

```text
独立 test-vault
→ 实际浏览器使用
→ 写几篇真实测试笔记
→ 观察实际使用行为
→ 再决定是否挂真实 /srv/notes
```

这轮的目标是把当前 MVP 从：

```text
“功能基本齐了”
```

推进到：

```text
“核心状态和数据行为可信，可以开始真实试用”
```

不要把返修任务变成第二次开发。
