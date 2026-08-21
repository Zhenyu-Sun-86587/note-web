# Note Web Vim Pass 4.2 + 4.3 一次性实现提示词

> Repository: `Zhenyu-Sun-86587/note-web`  
> Baseline: `f8e755160d280630bffe470ef3b9d606b907b965`  
> Baseline commit: `feat(editor): enforce vim normal mode input guard and intercept browser shortcuts`  
> 任务性质：**Vim 4.2 + 4.3 一次性实现**。先修当前 Vim 集成里已经确认的稳定性问题，再完成 Session Resume、Vim ergonomics、marks/registers/macros 与少量 Web Settings。

---

## 0. 本轮最终目标

当前项目已经有：Vditor IR、CodeMirror 6 Vim Markdown Mode、`@replit/codemirror-vim@6.4.0`、IR/VIM 双编辑器、共享 `draftContent`、现有 autosave/revision/conflict、`:w`、`:ir`、`:zen`、Zen Mode 和 Server-hosted CJK fonts。

本轮一次完成：

- **Vim Pass 4.2 — Session Resume + Stabilization**
- **Vim Pass 4.3 — Ergonomics + Native Vim Advanced Features**

完成后的目标：

```text
打开 Note Web
→ 默认恢复上次打开的 Markdown
→ 进入用户设置的默认编辑器 IR / VIM
→ Vim 中正常使用 Normal / Insert / Visual
→ relative line numbers
→ lowercase marks
→ named registers
→ macros
→ 浏览器 reload 后当前 tab 内宏/命名寄存器仍可继续使用
→ autosave / revision / external refresh 不被 Vim undo 破坏
```

Markdown Vault 仍然是唯一真实数据源。

---

# 1. 严格保持现有架构

继续保持：

```text
Markdown Vault
    ↑
Thin File API
    ↑
React App
    ↑
shared draftContent
    ├── Vditor IR
    └── CodeMirror 6 + codemirror-vim
```

IR 和 Vim 必须继续共享：`draftContent`、`openNote`、`revision`、`useAutosave`、conflict handling、rename/move/delete。

不要建立第二份 Vim 文档模型、editor state store、Redux/Zustand、buffer manager、filesystem abstraction、Vim plugin manager、`.vimrc` interpreter、Neovim RPC、WebSocket 或 CRDT。

不要继续修改目前已经可用的 Vditor Bold / Italic / marker 行为。

---

# 2. 先修当前 review 已确认的问题

## 2.1 P1：external value sync 不能进入 Vim undo history

当前 `VimMarkdownEditor.tsx` 对 React external value 使用普通 CodeMirror transaction：

```ts
view.dispatch({
  changes: { from: 0, to: currentDoc.length, insert: value },
});
```

这会让 disk refresh / conflict reload 进入 CodeMirror undo history，可能出现：

```text
磁盘 A
→ 外部程序改成 B
→ Note Web clean refresh 到 B
→ Vim 用户按 u
→ undo 回 A
→ draft dirty
→ autosave 把旧 A 写回磁盘
```

修复：

```ts
import { Transaction } from "@codemirror/state";

view.dispatch({
  changes: { from: 0, to: currentDoc.length, insert: value },
  annotations: Transaction.addToHistory.of(false),
});
```

要求：external disk refresh / conflict reload 不进入 undo；用户自己的 edit 继续正常 `u` / `Ctrl+R`；不改 server revision protocol。

必须有 regression test。

---

## 2.2 P1：macOS Command 和 Vim Ctrl 必须彻底分开

当前 interceptor 用类似：

```ts
const mod = isMac ? e.metaKey : e.ctrlKey;
```

然后把 `r/p/f/w/q/...` 当 Vim control chords 处理。这是错误语义。

改成：

```ts
const appMod = isMac ? e.metaKey : e.ctrlKey;
const vimCtrl = e.ctrlKey;
```

Note Web Save：macOS `Cmd+S`，Windows/Linux `Ctrl+S`。

Vim Ctrl chords 始终根据真实 `e.ctrlKey`，例如 `Ctrl+R/F/B/W/P`。

不要拦截 macOS `Cmd+R/F/W/P/Q`。除 `Cmd+S` 外，Command shortcuts 继续属于浏览器/OS。

如果保留 `vimHijackCtrlKeys` fallback，只检查 `e.ctrlKey`，不能用 `metaKey`。

---

## 2.3 P1：不要让自定义 normal-mode input guard 抢在 codemirror-vim 前面

当前 extensions 大致：

```ts
[
  vimKeyInterceptor,
  normalModeInputGuard,
  vim({ status: true }),
  basicSetup,
  ...
]
```

但 `@replit/codemirror-vim` 自己已经提供 `EditorView.inputHandler`，用于 Normal Mode 的非-keydown text input、`Dead`、`Process`、`Unidentified`、composition/IME fallback，并把 text input 重新交给 Vim key handling。

优先方案：**删除自定义 `normalModeInputGuard`，依赖 upstream 原生实现。**

保留测试：NORMAL 下普通 motion/operator key 不直接插入字符；`i` 后才进入 INSERT 并允许正文输入。

如果实际浏览器证明仍需要 fallback guard，则只能：

```ts
[
  vimKeyInterceptor,
  vim({ status: true }),
  normalModeInputGuard, // fallback AFTER vim()
  ...
]
```

禁止 generic input guard 再放到 `vim()` 前面。

真实中文 IME 人工验证：

```text
i
输入拼音
选择中文候选词
Esc
回 NORMAL
u
Ctrl+R
```

---

## 2.4 P2：Settings-driven editor mode 必须走同一个 safe handoff

TopBar IR/VIM 切换已经会 `active editor getValue() → 对齐 draftContent → setEditorMode`，这是正确的。

Settings 修改“默认编辑器”后目前 effect 直接 `setEditorMode(settings.editorMode)`，绕过 `EditorHandle`。

统一一个 safe switch function，建议使用 `editorModeRef` + `draftContentRef`：

```ts
const editorModeRef = useRef(editorMode);
editorModeRef.current = editorMode;

const switchEditorModeSafely = useCallback((mode: EditorMode) => {
  if (editorModeRef.current === mode) return;

  const liveValue = editorPaneRef.current?.getValue();
  if (typeof liveValue === "string" && liveValue !== draftContentRef.current) {
    draftContentRef.current = liveValue;
    setDraftContent(liveValue);
  }

  editorModeRef.current = mode;
  setEditorMode(mode);
}, []);
```

TopBar 和 Settings-driven change 都走它。

TopBar 临时 IR/VIM 切换不要修改 `settings.editorMode`；Settings 修改“默认编辑器”则 persist setting，并即时安全切换。

---

# 3. Vim 4.2：启动恢复上次笔记

## 3.1 AppSettings 新增启动策略

```ts
export type StartupNoteMode = "last" | "first" | "none";
```

`AppSettings` 新增：

```ts
startupNoteMode: StartupNoteMode;
```

默认：

```ts
startupNoteMode: "last";
```

继续使用现有 `note-web-settings-v1`。旧 settings 通过 `{...DEFAULT_SETTINGS, ...parsed}` 自然获得默认值，不做 migration framework。

## 3.2 Settings UI

增加：

```text
启动时打开
- 上次打开的笔记（默认）
- 第一篇笔记
- 不自动打开
```

具体 note path 不属于 AppSettings。

## 3.3 last-open path 单独 localStorage

```ts
export const LAST_OPEN_NOTE_KEY = "note-web-last-open-note-v1";
```

成功存在 `openNote.path` 时更新：

```ts
useEffect(() => {
  if (!openNote?.path) return;
  try {
    localStorage.setItem(LAST_OPEN_NOTE_KEY, openNote.path);
  } catch {}
}, [openNote?.path]);
```

正文变化不要写 key。`startupNoteMode === "none"` 不清除之前的 last path。

## 3.4 替换当前永远打开第一篇的逻辑

```text
tree loaded
      │
      ▼
startupNoteMode
      ├── last
      │    ├── last path 在当前 tree 中存在 → open last
      │    └── stale/missing → remove stale key → fallback first
      ├── first → findFirstNote()
      └── none → EmptyEditor
```

last path 必须先在 tree 中确认是 note，再 `fetchNote()`。禁止对 stale path 发请求再弹 alert。

`hasAutoOpenedRef` 继续保证 startup decision 只执行一次；`none` 也要标记已决策，避免后续 tree refresh 突然打开文件。

## 3.5 恢复深层 note 时展开父目录

例如 `research/compiler/ch09/register-allocation.md` 自动展开：

```text
research
research/compiler
research/compiler/ch09
```

只做简单 `getParentFolderPaths(notePath)`，不要持久化整个 Explorer 展开状态。建议成功打开 note 后统一 ensure parents expanded，这样 Quick Open 和 startup resume 一致。

---

# 4. Vim 4.3：Web Settings 代替 `.vimrc`

不实现 `.vimrc`。只把需要的 Vim preference 放到 Web Settings。

新增：

```ts
vimRelativeLineNumbers: boolean;
vimLineWrapping: boolean;
vimJjEscape: boolean;
```

默认：

```ts
vimRelativeLineNumbers: true,
vimLineWrapping: true,
vimJjEscape: false,
```

Settings 小节：

```text
Vim

相对行号             [✓]
自动换行             [✓]
jj 退出插入模式       [ ]

寄存器与宏：当前浏览器标签页会话内保存；关闭标签页后清除。
```

不要做 arbitrary mapping editor、vimscript textbox、`.vimrc` upload、leader key UI 或 plugin settings。

---

# 5. Relative line numbers

目标是 hybrid number：当前行 absolute，其他行 relative。

```text
 3
 2
 1
42   ← 当前行
 1
 2
 3
```

使用 CodeMirror 6 官方 gutter / `lineNumbers` 能力。核心：

```ts
const currentLine = state.doc.lineAt(state.selection.main.head).number;
return lineNo === currentLine
  ? String(lineNo)
  : String(Math.abs(lineNo - currentLine));
```

`vimRelativeLineNumbers === false` 时显示普通 absolute numbers。

**最终只能有一个 line-number gutter。** 当前 `basicSetup` 自带 line numbers，不允许追加一个新的 gutter 造成重复。

允许：

1. 把 Vim editor 的 `basicSetup` 换成明确、轻量的 CM6 setup，只安装一次自定义 `lineNumbers()`；或
2. 使用 CM6 官方 reconfigure 方式，最终确认 DOM 只有一个 line-number gutter。

不要用 DOM MutationObserver 篡改 gutter 文本，不要 cursor move 时重建 editor。动态 setting 可使用少量 `Compartment`。

必须验证 `5j` 后当前 absolute line 和周围 relative values 即时更新。

---

# 6. Vim line wrapping setting

当前固定 `EditorView.lineWrapping`，改为 `settings.vimLineWrapping` 控制。

建议 `Compartment`：

```ts
const wrappingCompartment = new Compartment();
```

初始化与更新通过 `reconfigure()`，不要 destroy/recreate editor，不丢 cursor/doc。

---

# 7. `jj -> Esc`

默认关闭。

开启：

```ts
Vim.map("jj", "<Esc>", "insert");
```

关闭：

```ts
Vim.unmap("jj", "insert");
```

因为 mapping 是 global，应用 setting 时先 `unmap`，再按需 `map`，避免重复。

只做 `jj`，不扩 `jk/kj/leader/custom mapping textbox`。

---

# 8. Lowercase Marks：原生 Vim

只保证当前 active Vim note 内：

```text
ma
mb
'a
`a
'b
`b
```

`'a` 跳到 mark 所在行，`` `a `` 跳到精确位置。

不要建立 React marks store，不自己 `new Map()` 实现 Vim mark。

**不做跨文件 marks。** 不为 `mA/'A/`A` 建 Note Web 跨 note 跳转。Marks 不持久化；切 note/reload 后可以消失。

---

# 9. Named Registers：原生 Vim

验证：

```text
"ayy
"ap
"byy
"bp
"_dd
```

至少保证：a-z named registers、uppercase append、black-hole register `_` 不被 Note Web 干扰，正文变化仍进入 `draftContent` 与 autosave。

禁止实现自己的 `registerA/registerB/clipboardManager`。

---

# 10. Macros：原生 Vim

必须支持并验证：

```text
qa
... Vim 操作 ...
q
@a
@@
3@a
```

示例：

```text
apple
banana
orange
```

录制：

```text
qa
I- <Esc>j
q
2@a
```

得到：

```text
- apple
- banana
- orange
```

不要自己建 MacroRecorder，不自己写 playback engine。

---

# 11. 宏 / Named Registers 的当前 Tab 会话存储

目标：

```text
录制 qa / 保存 "a register
→ 切 IR -> VIM              仍在
→ 切另一篇 note -> VIM      仍在
→ 浏览器 reload             仍在
→ 同一个 tab                仍在
→ 关闭 tab 后新开 tab        清空
```

使用 `sessionStorage`，不要 `localStorage`。

```ts
const VIM_SESSION_KEY = "note-web-vim-session-v1";
```

## 11.1 不要只存 `register.toString()`

codemirror-vim register 除文本外还包含 macro replay 所需状态，例如：

- `keyBuffer`
- `insertModeChanges`
- `searchQueries`
- `linewise`
- `blockwise`

只存 string 会破坏复杂 Insert/search macro。

## 11.2 最小 persistence scope

只保存：

```text
a-z named registers
latest macro register name（为了 @@）
```

不要保存 clipboard `+/*`、unnamed、0-9 delete registers、search history、command history、marks、jumplist、undo history、cursor。

## 11.3 隔离 upstream internal compatibility

当前 `@replit/codemirror-vim` 暴露 `Vim.getRegisterController()`；为恢复 `@@`，当前版本还有 `Vim.getVimGlobalState_().macroModeState.latestRegister` testing hook。

因为本轮明确要求 macro reload persistence，只允许在一个小 helper 中使用这一处 internal hook，例如：

```text
apps/web/src/utils/vim-session.ts
```

不要把 internal state 访问散落到 App/Settings/EditorPane。

既然依赖 internal state shape，把 dependency 从：

```json
"@replit/codemirror-vim": "^6.4.0"
```

改成 exact：

```json
"@replit/codemirror-vim": "6.4.0"
```

## 11.4 建议 schema

```ts
interface PersistedVimRegister {
  keyBuffer: string[];
  insertModeChanges: unknown[];
  searchQueries: string[];
  linewise: boolean;
  blockwise: boolean;
}

interface PersistedVimSession {
  version: 1;
  registers: Record<string, PersistedVimRegister>;
  latestMacroRegister?: string;
}
```

只接受 a-z key。损坏 JSON 直接忽略并 remove session key，不能阻塞 app startup。

## 11.5 restore 时机

每次 page load 只 restore 一次，在第一次 `VimMarkdownEditor` 建立 `EditorView` 前恢复。可以 module-level：

```ts
let vimSessionRestored = false;
```

同一 SPA 生命周期里 codemirror-vim global registers 本身继续存在，不要每次切 note 都强制从 storage 覆盖。

## 11.6 persist 时机

不要每个 React render 写 storage。优先使用 Vim command completion，例如 `vim-command-done`，并确保 `q` 结束 macro recording 后 storage 已完整。

如果 event 对最后一次 Insert recording 不可靠，可在 Vim editor key/input lifecycle 做极轻 `queueMicrotask(persist)` fallback，但**不要建立 recorder**。

验收以：

```text
qa...q
page.reload()
@a
```

成功为准。

---

# 12. Vim settings 传递

直接：

```text
App
→ EditorPane
→ VimMarkdownEditor
```

传：

```ts
vimRelativeLineNumbers={settings.vimRelativeLineNumbers}
vimLineWrapping={settings.vimLineWrapping}
vimJjEscape={settings.vimJjEscape}
```

不要 VimSettingsProvider/Context/store。

---

# 13. Editor mode 与 startup setting 语义

`settings.editorMode` = 用户默认编辑器。

TopBar `IR | VIM` = 当前会话临时切换，不改 `settings.editorMode`。

Settings 修改“默认编辑器” = persist `settings.editorMode`，并通过 safe handoff 即时切换。

`settings.startupNoteMode` = 启动打开哪篇 note，是另一维设置，不要造 startup framework。

---

# 14. Ex commands 保持极简

继续：

```text
:w
:ir
:zen
```

不扩 `:q/:wq/:e/:buffers`，不做 marks/registers UI。

---

# 15. Tests — 4.2

所有写入只操作 `test-vault`，测试后恢复 tracked fixtures。

## A. 默认恢复 last note

```text
startup=last
打开 projects/example.md
确认 localStorage last path
reload
仍打开 projects/example.md
```

## B. stale last fallback

```text
last = deleted/not-exist.md
startup=last
reload
```

不能 alert、不能请求 stale note，fallback 第一篇，stale key 清理/替换。

## C. startup=first

即使 last 指向 example，reload 仍打开第一篇。

## D. startup=none

reload 后 EmptyEditor，不自动 fetch note，不清除之前 last path。

## E. rename/move 当前 note 更新 last path

openNote path remap 后 `LAST_OPEN_NOTE_KEY` 更新。

## F. external Vim sync 不可被 u 撤销

```text
clean A in Vim
测试进程直接改 fixture 为 B
触发 window focus refresh
Vim 显示 B
按 u
仍是 B
```

然后用户输入 C：`u` 能撤销 C，`Ctrl+R` 能恢复 C。

## G. Settings default editor safe handoff

IR 输入最后字符，立即从 Settings 改默认 editor=Vim，字符不丢；反向 smoke 一次。

---

# 16. Tests — 4.3

## H. Relative line numbers

当前行 absolute，上/下相邻显示 1，再下一行 2；`5j` 后即时重新计算。关闭 setting 后 absolute numbers。DOM 最终只有一个 line-number gutter。

## I. Line wrap

setting true wrap；false nowrap/horizontal scroll；切换不重建 editor、不丢 doc/cursor。

## J. jj -> Esc

默认 false：Insert 中 `jj` 正常写入。设置 true：`i → abc → jj` 回 NORMAL，`jj` 不进正文；关闭后恢复。

## K. lowercase mark

准备：

```text
alpha
MARK_TARGET
omega
```

在明确位置 `ma → G → `a → x`，断言删除发生在 mark 精确位置，再 `u` 恢复。不测跨 note uppercase mark。

## L. named register

在 alpha：`"ayy`，移动后 `"ap`，确认粘贴 alpha；再 smoke `"_dd` 不破坏 register a。

## M. macro

```text
apple
banana
orange
```

执行：

```text
qa
I- <Esc>j
q
2@a
```

断言三行加 `- `，再验证 `@@`。

## N. macro/register session persistence

录 macro a + 设置 register b，`page.reload()`，重新 Vim，验证 `@a`、`"bp`、`@@` 仍工作。测试结束清理 `sessionStorage.removeItem("note-web-vim-session-v1")`。

## O. IR/VIM handoff regression

原有 IR 输入立即切 VIM、VIM 输入立即切 IR 必须继续 PASS。

## P. Vim Ctrl shortcuts

Linux/Windows E2E：`Ctrl+R` 是 Vim redo，不 reload。

增加 pure/unit test 覆盖：

```text
Mac Cmd+R -> 不当作 Vim Ctrl
Mac Cmd+F -> 不当作 Vim Ctrl
Mac Cmd+W -> 不当作 Vim Ctrl
Mac Cmd+S -> Note Web save
Mac Ctrl+R -> Vim control
Windows Ctrl+R -> Vim control
```

可以提取极小 shortcut predicate；不要为测试伪造复杂 platform runtime。

---

# 17. 中文 IME 验收

Playwright `keyboard.type("中文")` 只算 Unicode smoke，不算完整 IME。

最终报告必须人工验证真实中文输入法：

```text
VIM NORMAL
→ i
→ 拼音输入
→ 候选框选中文
→ composition 完成
→ Esc
→ NORMAL
→ x / u / Ctrl+R
```

要求候选输入不被 custom guard 抢走，Insert 中文完整，Esc/undo/redo 正常。

---

# 18. 预计修改文件

```text
apps/web/package.json
apps/web/src/App.tsx
apps/web/src/hooks/useSettings.ts
apps/web/src/components/settings/SettingsDialog.tsx
apps/web/src/components/editor/EditorPane.tsx
apps/web/src/components/editor/VimMarkdownEditor.tsx
apps/web/src/hooks/useKeyboardShortcuts.ts
apps/web/src/styles/vim-editor.css
apps/web/src/tests/settings.test.ts
apps/web/src/tests/shortcuts.test.ts
e2e/note-edit.spec.ts
package-lock.json
```

允许新增一个很小的：

```text
apps/web/src/utils/vim-session.ts
```

只负责 serialize/restore a-z register + latest macro register。

不要新增 VimManager/VimProvider/VimStore/VimRegistry/VimPluginSystem。

---

# 19. 明确不做

- `.vimrc` parser / VimScript / init.vim / init.lua
- leader framework / arbitrary keymap editor
- Vim plugin loader
- Neovim RPC / terminal
- 跨 note uppercase marks integration
- marks persistence
- persistent undo tree/jumplist
- 永久 localStorage macro library
- register/macro UI recorder
- Markdown live preview in Vim
- tabs/buffer list
- CodeMirror/Vditor 同时常驻同步
- autosave redesign
- server API change
- database

---

# 20. Verification

必须运行：

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
git status --short
```

要求全部 PASS，E2E 后 `git status --short` clean，且不污染 `test-vault/inbox/welcome.md`、`test-vault/projects/example.md` 或 rename/move fixtures。

GitHub 当前没有独立 CI status，不要把 Agent 本地测试声称为 GitHub CI。

---

# 21. Agent 最终报告

只报告：

1. 修改文件列表
2. external undo history 修复
3. Mac Ctrl/Command 修复
4. normal input/composition ownership
5. safe editor handoff
6. startup resume
7. Vim Settings
8. relative line numbers 且确认只有一个 gutter
9. marks/registers/macros 验证
10. macro/register sessionStorage schema 与 restore/persist 时机
11. 中文真实 IME 验证
12. `npm run typecheck`
13. `npm test`
14. `npm run build`
15. `npm run test:e2e`
16. `git status --short`
17. commit SHA（仅在用户已授权 commit/push 时）

不要输出长篇架构复盘。

---

# 22. 建议 commit

```text
feat(editor): complete vim sessions and ergonomics
```

---

# 23. Stop Condition

这轮完成后 Vim 主功能阶段结束。最终应具备：

```text
Normal / Insert / Visual / Visual Line / Visual Block
motions/operators/counts/text objects
undo/redo/search
:w / :ir / :zen
IR <-> Vim safe handoff
Zen + Vim
中文 IME
startup last-note resume
relative line numbers
line wrap setting
optional jj -> Esc
lowercase marks
named registers
macros
macro/register current-tab session persistence
```

之后不要自动继续扩 Vim。下一阶段回到 Note Web 产品功能，而不是继续无限接近完整 Neovim。
