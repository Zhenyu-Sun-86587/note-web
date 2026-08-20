# Note Web `48395ea` 最终远端 RC 审查

> 仓库：`Zhenyu-Sun-86587/note-web`
>
> 分支：`main`
>
> 当前远端 HEAD：
>
> `48395ea04cc437893f68da8301445fb855915311`
>
> 提交：
>
> `fix(autosave): sync external revisions and avoid redundant in-flight saves`
>
> 审查目标：判断当前版本是否已经达到 **MVP Release Candidate / 可进入 test-vault 实际使用阶段**。
>
> 审查原则：只关注真实的数据正确性、Markdown Vault 行为、Autosave/Conflict、文件系统边界和实际使用风险。避免为了理论完美继续做防御性编程或架构扩张。

---

# 1. 最终结论

## RC 结论：通过

当前 `48395ea` 已经修复前几轮真正阻塞实际使用的核心问题。

目前没有再发现以下级别的问题：

```text
P0 数据丢失
P0 错误覆盖外部修改
P0 stale revision 导致正常流程永久 conflict
P0 autosave 自激循环
P0 switch 后旧请求覆盖新 note
P0 symlink 逃逸 Vault
P0 删除后旧 save 让文件复活
```

因此当前版本可以判断为：

> **MVP Release Candidate**

建议下一步不再继续做代码架构返修。

正确下一步是：

```text
test-vault 实际使用
↓
人工真实编辑
↓
图片上传
↓
外部修改 Markdown
↓
conflict/reload
↓
切换/rename/move/delete
↓
连续使用一段时间
↓
确认没有数据行为异常
↓
再挂真实 /srv/notes
```

---

# 2. 本轮远端 HEAD 已确认

GitHub `main` 当前 HEAD：

```text
48395ea04cc437893f68da8301445fb855915311
```

其 parent：

```text
45d367ff9dda2df413f2496a293d8c87f7e4af25
```

本轮提交实际针对上一轮审查的核心 autosave 问题进行了修改。

主要变化集中在：

```text
apps/web/src/hooks/useAutosave.ts
apps/web/src/tests/autosave.test.ts
e2e/note-edit.spec.ts
```

以及加入审查提示文档。

---

# 3. 上一轮 P0：same-path external revision 同步 —— 已修复

上一轮问题：

```text
A.md rev-1

外部程序修改
↓
A.md rev-2

浏览器重新读取 rev-2

但是 useAutosave 内部
latestRevisionRef 仍为 rev-1

用户下一次编辑
↓
错误 PUT baseRevision rev-1
↓
409
```

现在实现：

```ts
latestPathRef.current = path;

if (!inFlightPromiseRef.current) {
  latestRevisionRef.current = revision;
}
```

因此：

```text
path 不变
revision prop rev-1 -> rev-2
```

时，只要当前没有内部 save 正在执行：

```text
latestRevisionRef
```

会同步成：

```text
rev-2
```

这解决了：

```text
Memos
Agent
n8n
script
Git checkout / external editor
```

修改当前 Markdown 后，WebUI reload 最新版本再编辑时错误 409 的问题。

---

# 4. sequential save 的内部 revision 仍正确保留

当前保存成功后仍然：

```ts
const doc = await saveNote(p, c, r);

latestRevisionRef.current = doc.revision;
```

这非常关键。

因为：

```text
Content B / rev-1
↓
save B
↓
server returns rev-2
↓
用户已经输入 Content C
↓
立即第二笔 save
```

第二笔不需要等待 React：

```text
setOpenNote(doc)
```

完成 render。

它可以直接：

```text
Content C / rev-2
```

保存。

该逻辑现在同时支持：

```text
external revision prop sync
+
internal sequential revision sync
```

两条路径。

这部分通过。

---

# 5. 上一轮 P0：resetStatus 污染 saved-content baseline —— 已修复

上一轮实现存在：

```ts
latestSavedContentRef.current =
  latestContentRef.current;
```

导致：

```text
reset UI status
```

同时错误承担：

```text
“把当前 draft 标记成已经保存”
```

的职责。

当前版本已经删除：

```text
latestSavedContentRef
```

这是正确的。

现在：

```text
dirty 真相
```

继续由 App：

```ts
draftContent !== openNote.content
```

决定。

这是整个项目更简单、更可靠的状态模型。

不应该再建立第二套“saved content truth”。

---

# 6. 上一轮 P1：in-flight flush 重复 PUT —— 已修复

上一轮：

```ts
if (inFlightPromiseRef.current) {
  saveAgainRef.current = true;
}
```

导致：

```text
Content B 正在保存
↓
用户没有继续编辑
↓
点击另一篇 note
↓
flushCurrentNote()
↓
又把 saveAgain 设为 true
↓
Content B 再保存一遍
```

当前已经改成：

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

因此：

## 没有新编辑

```text
savingContent = B
latestContent = B
```

结果：

```text
只 await 当前 save
不产生第二 PUT
```

## 有新编辑

```text
savingContent = B
latestContent = C
```

结果：

```text
saveAgain = true
```

然后：

```text
PUT B / rev-1
PUT C / rev-2
```

这是正确行为。

---

# 7. Autosave tests 现在已经覆盖关键状态路径

当前测试不再只是：

```ts
expect(calls).toBeGreaterThanOrEqual(1);
```

而是对核心 revision 行为做精确断言。

已经覆盖：

## 普通 clean

```text
enabled = false
→ 不 autosave
```

## 普通 debounce

```text
A
→ B
→ 1200ms
→ 一次 PUT
→ 后续不重复 PUT
```

## sequential save

精确要求：

```text
PUT #1
Content B + rev-1

PUT #2
Content C + rev-2
```

## same-path external revision

```text
A / rev-1
↓
external reload
B / rev-2
↓
user edits C
```

精确要求：

```text
PUT C / rev-2
```

## in-flight flush same content

```text
B 正在保存
↓
flush
↓
无新编辑
```

精确要求：

```text
PUT count = 1
```

## conflict reload

```text
local dirty
↓
reload disk B / rev-2
↓
edit C
```

精确要求：

```text
PUT C / rev-2
```

这些测试已经覆盖当前最容易产生数据错误的 Autosave 状态转换。

不建议继续为了覆盖率扩大量测试。

---

# 8. App 的 flush gate 继续保持正确

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

以下操作均在必要时：

```ts
if (!(await flushCurrentNote())) {
  return;
}
```

包括：

```text
switch note
create note
rename
move
delete current note
```

因此：

```text
save error
或
409 conflict
```

时不会继续：

```text
导航
rename
move
delete
create + 覆盖当前编辑上下文
```

用户 draft 会保留。

通过。

---

# 9. beforeunload 仍然以真实 dirty 状态保护用户

App：

```ts
const isDirty =
  openNote !== null &&
  draftContent !== openNote.content;
```

dirty 时：

```text
beforeunload
```

会触发浏览器原生离开确认。

因此即使 UI save-status 某个瞬间不够准确：

```text
真正未保存的 draft
```

仍然由：

```text
draftContent !== openNote.content
```

保护。

这是重要的数据安全兜底。

---

# 10. Conflict reload 现在已经真正闭环

当前 App：

```text
发生 conflict
↓
用户点击重新加载
↓
fetchNote()
↓
setOpenNote(new doc)
setDraftContent(new content)
resetStatus("idle")
```

现在由于 Autosave 会在后续 render 同步：

```text
revision prop
```

所以：

```text
reload disk rev-2
↓
再次编辑
↓
save 使用 rev-2
```

不会再陷入：

```text
reload
→ edit
→ stale rev-1
→ 409
→ reload
→ ...
```

的循环。

通过。

---

# 11. E2E fixture cleanup 小问题也已修

之前：

```ts
let originalContent = "";

if (originalContent) {
  restore();
}
```

意味着如果 fixture 原始内容为空：

```text
""
```

则不会 restore。

现在改成：

```ts
let originalContent: string | null = null;
```

然后：

```ts
if (
  originalContent !== null &&
  fs.existsSync(fixturePath)
) {
  restore();
}
```

语义正确。

虽然当前 welcome.md 本来就不是空文件，但这个修改足够简单，没有过度设计。

通过。

---

# 12. 文件系统部分无需继续返修

前几轮已经确认：

```text
absolute path
..
hidden paths
.git
final symlink
ancestor symlink
```

均有 Vault boundary 约束。

Attachments：

```text
attachments -> outsideDir
```

也已经在创建：

```text
YYYY/MM
```

之前被拒绝。

测试还明确确认：

```text
outsideDir
```

中没有生成文件。

这部分已经足够。

不要继续做：

```text
chroot
openat
inode locking
sandbox daemon
filesystem transaction framework
```

---

# 13. Vditor / Markdown source-of-truth 仍符合设计

当前核心模式仍然是：

```text
Browser
↓
React + Vditor IR
↓
Thin HTTP API
↓
/vault/*.md
```

没有：

```text
数据库
shadow document store
browser localStorage source of truth
ORM
Redis
CRDT
```

Vditor 只是编辑器。

真正持久化仍然是：

```text
Markdown files
```

这符合项目最初目标。

---

# 14. 图片架构也不需要再改

磁盘 Markdown：

```md
![image](../../attachments/2026/08/example.png)
```

仍然保持普通相对路径。

浏览器显示层再映射为：

```text
/api/raw/attachments/...
```

因此 Markdown 可继续被：

```text
Typora
Obsidian
VS Code
Git checkout
其他 Markdown 工具
```

直接使用。

不要把：

```text
/api/raw/
```

写入 Markdown 正文。

---

# 15. 当前只剩一个非阻塞 UI 状态细节

这一项不是数据 bug。

不建议为了它阻塞 RC。

当前 sequential save：

```text
保存 B
↓
B 成功
↓
发现还有 C 要保存
↓
继续第二轮保存 C
```

代码在 B 成功后会：

```ts
setStatus("saved");
```

然后进入第二轮。

但是第二轮开始前没有再次：

```ts
setStatus("saving");
```

所以在第二笔请求飞行期间，状态栏可能短暂显示：

```text
已保存
```

实际上：

```text
C 仍在保存
```

---

# 16. 为什么这个问题不是 RC blocker

真实 dirty 判断仍然是：

```ts
draftContent !== openNote.content
```

因此：

```text
C 还没保存
```

时 App 仍然认为：

```text
isDirty = true
```

于是：

- beforeunload 仍保护；
- switch 会 flush；
- delete 会 flush；
- rename/move 会 flush。

所以这只是：

> 保存状态文字短暂不准确。

不是：

> 用户数据已经被错误认为持久化。

---

# 17. 如果以后顺手修，保持非常简单

不需要现在返修。

如果实际使用时觉得状态显示明显，可以把：

```ts
setStatus("saving");
```

放到每一轮真正调用：

```ts
saveNote(...)
```

之前。

或者只在确定：

```text
没有下一轮
```

时设置：

```text
saved
```

即可。

不要为了状态文字建立 state machine。

---

# 18. 另一个已知但非阻塞行为：conflict 中编辑仍可能继续发 409 请求

当前 conflict 后：

```text
status = conflict
```

但如果用户在没有 reload / save-copy 的情况下继续输入，debounce 逻辑仍可能继续尝试：

```text
PUT
```

由于 base revision 已旧：

```text
server 仍返回 409
```

因此：

```text
不会覆盖磁盘
不会丢数据
```

只是会多一些无意义请求。

当前 conflict banner 已经给用户：

```text
reload
或
save conflict copy
```

操作路径。

所以不建议现在为了阻止这些请求继续增加 conflict 状态框架。

如果实测发现请求 spam 明显，再做最小处理。

---

# 19. 不要再继续安全扩张

当前项目是：

```text
个人 self-hosted notes
+
外层访问控制
```

而不是：

```text
多租户 SaaS
```

当前安全边界已经足够 MVP：

```text
Vault containment
symlink containment
.md path restriction
asset type restriction
non-root Docker
localhost bind
revision conflict
```

不要继续加入：

```text
RBAC
ACL
capability token
filesystem sandbox service
locking daemon
security database
```

---

# 20. GitHub CI 状态说明

当前 commit 没有 GitHub commit status / Actions status。

这意味着：

```text
GitHub 本身没有独立 CI 结果
```

并不意味着代码失败。

当前可以依赖：

```text
Agent 本地测试结果
+
现有代码/tests 远端审查
```

进行 MVP 阶段判断。

现在没有必要为了 RC 临时搭 GitHub Actions。

如果以后项目长期维护，再加 CI。

---

# 21. 当前 RC 建议

现在建议明确停止“审查 -> 修 -> 审查 -> 修”的循环。

继续无限审查会开始进入：

```text
理论边界
低概率 race
代码风格
UI polish
未来扩展
```

而这些已经不是当前 MVP 的主要风险。

当前更有价值的是实际运行。

---

# 22. 下一阶段：test-vault 实际人工验收

建议使用当前 commit：

```text
48395ea04cc437893f68da8301445fb855915311
```

部署到独立 test-vault。

人工做下面这些动作。

---

## Test 1：普通输入

```text
打开 note
↓
连续输入
↓
停 1.2 秒
↓
显示保存
↓
刷新浏览器
↓
正文一致
```

---

## Test 2：快速输入

持续输入 20～30 秒。

观察：

```text
没有内容回跳
没有旧内容覆盖新内容
没有莫名 conflict
```

---

## Test 3：输入中快速切 note

```text
编辑 A
↓
立刻点 B
```

确认：

```text
A 正确落盘
B 正常打开
```

再回 A：

```text
内容完整
```

---

## Test 4：输入中 rename

```text
编辑 A
↓
立刻 rename
```

确认：

```text
内容没有丢
新文件名存在
旧文件名不存在
```

---

## Test 5：输入中 move

确认：

```text
最新正文
+
新路径
```

都正确。

---

## Test 6：输入中 delete

```text
编辑 A
↓
立刻 delete
```

确认：

```text
不会删除后又重新出现
```

---

## Test 7：外部修改 clean note

浏览器当前 A 是 clean。

用服务器 shell：

```bash
echo "external change" >> A.md
```

然后切回浏览器窗口。

确认：

```text
WebUI 自动显示新内容
```

继续编辑。

确认：

```text
正常保存
不出现错误 409
```

---

## Test 8：外部修改 dirty note

浏览器编辑 A，但不要等 autosave。

同时外部修改 A。

再触发 focus refresh。

确认：

```text
显示 conflict
```

且：

```text
不会覆盖本地 draft
```

---

## Test 9：Conflict Reload

点击：

```text
重新加载磁盘版本
```

然后继续编辑。

确认：

```text
正常保存
不会再次立刻 conflict
```

这是本轮代码修改最值得人工验证的一项。

---

## Test 10：Conflict Save Copy

确认：

```text
本地 draft
```

能另存成：

```text
conflict copy
```

原文件保持磁盘版本。

---

## Test 11：图片上传

在：

```text
inbox/a.md
projects/a.md
projects/deep/a.md
```

分别上传图片。

确认：

```text
浏览器显示正常
```

然后直接打开 Markdown 文件检查：

```text
仍然是相对路径
```

---

## Test 12：外部 Markdown 工具

用：

```text
Typora
VS Code
Obsidian
```

中的任一个直接打开 test-vault。

确认：

```text
正文
frontmatter
图片
目录
```

仍然是普通 Markdown 结构。

---

# 23. test-vault 实测通过后的下一步

如果上述人工流程没有发现实际问题：

> 可以开始准备接真实 `/srv/notes`。

建议第一次接真实 Vault 前：

```text
1. 确认 Git working tree clean
2. 确认现有 notes 已有 Git commit
3. 确认 Restic/R2 最近一次 backup 正常
4. 启动 Note Web
5. 先编辑一个专门测试 note
6. 再逐步正常使用
```

这不是因为当前代码“不可信”。

而是任何第一次接真实数据的工具都应该留一个简单回滚点。

---

# 24. 不需要“低权限模拟真实使用”

真实人工测试时：

```text
直接按实际 UID/GID
实际 Docker mount
实际 Note Web 配置
```

即可。

不要为了控制风险创建一套和生产完全不同的低权限假环境。

风险控制主要靠：

```text
使用 test-vault
```

而不是把应用行为改得和最终部署不一样。

---

# 25. 当前版本状态评级

| 项目 | 评级 |
|---|---|
| Markdown 真源 | PASS |
| Nested folders | PASS |
| Basic CRUD | PASS |
| Atomic write | PASS |
| Content revision | PASS |
| Autosave debounce | PASS |
| Sequential save | PASS |
| In-flight flush | PASS |
| Same-path external revision | PASS |
| Conflict reload | PASS |
| Switch save race | PASS |
| Delete save race | PASS |
| External change detection | PASS |
| Relative image storage | PASS |
| Browser image preview | PASS |
| Vault path containment | PASS |
| Ancestor symlink containment | PASS |
| Attachment symlink containment | PASS |
| custom.css override | PASS |
| test-vault E2E isolation | PASS |
| Docker architecture | PASS based on static review |
| GitHub CI | NOT CONFIGURED / NOT REQUIRED FOR MVP |
| Sequential status text | MINOR |
| Conflict request spam | MINOR |

---

# 26. 最终建议

当前：

```text
48395ea
```

可以作为：

> **MVP RC1**

不要再为了“找到下一个潜在问题”继续自动返修。

下一轮反馈应该优先来自：

```text
真实 test-vault 使用
```

而不是继续纯静态 code review。

只有出现：

```text
内容丢失
错误 conflict
旧内容覆盖新内容
图片路径损坏
文件错误移动/删除
外部修改无法同步
```

这类真实问题时，再进入针对性修复。

---

# 27. 给 Agent 的指令

当前不需要立即执行新的返修任务。

如果把本文件交给 Agent，只需要告诉它：

```text
当前版本已通过 RC 静态审查。

不要继续修改代码。

等待 test-vault 实际人工验收结果。

除非人工验收发现可复现问题，否则不要：
- 重构 autosave
- 改 App 状态模型
- 增加安全层
- 增加数据库
- 加 watcher/WebSocket
- 改 Vditor
- 加功能
- 扩测试覆盖率
```

---

# 28. RC 停止条件

现在已经达到停止条件：

```text
核心数据行为 bug 已修
核心 race 有测试
外部 revision 有测试
conflict reload 有测试
file boundary 有测试
E2E 有实际 edit/save/reload
```

所以：

> **停止返修，进入实测。**

