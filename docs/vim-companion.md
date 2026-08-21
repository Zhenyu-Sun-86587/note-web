# Note Web — Windows Vim IME Companion 说明与使用指南

## 1. 解决什么问题

在 Windows 11 环境下，使用 Chrome 或 Edge 浏览器访问 Web 编辑器（如 CodeMirror Vim）时，当系统中文输入法（微软拼音、Rime 等）处于中文模式时，Vim 的 **NORMAL / VISUAL** 模式经常发生严重的输入法冲突：

- **典型症状**：在 NORMAL 模式下，用户按 `i`、`a`、`o`、`h`、`j`、`k`、`l`、`dd` 等键时，中文输入法会将其作为拼音输入拦截并弹出候选框。用户在候选框尚未提交、仅输入一个字符（如 `i`）时，Web 层可能误将其识别为 Vim 指令直接切换到 INSERT 模式，导致后续组合按键直接写入正文，破坏文档内容。
- **根本原因**：纯 Web 前端无法 100% 预测或控制 Windows 操作系统的输入法内核（IMM / TSF），任何基于前端事件（`keydown`、`beforeinput`、`keyCode 229`、`compositionstart`）的启发式猜测在系统中文输入法开启时均存在竞态漏洞。

**Windows Vim IME Companion** 从架构上彻底解决这一问题：
1. **NORMAL / VISUAL 模式**：通过 Windows Native Host 将目标 Note Web 浏览器窗口的输入状态直接切换为 ASCII / 英文输入，并经原生验证后放行 Vim 指令；
2. **INSERT / REPLACE / Search / Ex / IR 模式**：自动恢复用户原本的中文输入法状态；
3. **Pending 拦截**：在切换尚未收到 Native ACK 之前，所有可打印字符一律阻止，彻底杜绝误触发。

---

## 2. 整体架构与设计原则

```
Note Web (Web Frontend)
   │  window.postMessage (命名空间过滤: { source: "note-web", channel: "vim-ime" })
   ▼
Browser Extension Content Script
   │  chrome.runtime.sendMessage
   ▼
Browser Extension Service Worker (MV3)
   │  chrome.runtime.connectNative("com.noteweb.ime")
   ▼
note-web-ime.exe (Rust Win32 Native Host)
   │  Win32 API (IMM / HKL / Window message)
   ▼
Windows 目标浏览器窗口输入状态 (Microsoft Pinyin / Rime / US English Layout)
```

### 设计原则
- **主路径**：Native IME switching（原生输入法控制与验证）。
- **安全兜底**：Web IME Guard（Web 代理作为 fail-safe，在插件未安装或异常时保证页面不 crash）。
- **最小干扰**：Native Host 记录初次修改的 HWND 与进程 PID，`restore` 仅还原原目标窗口，绝不修改用户切走后的新前台应用（如 Alt+Tab 后的其它软件）。
- **单一所有权**：同一时刻仅允许一个 active 的 Note Web 浏览器标签页控制输入状态，跨标签页平滑转移动作前先执行 restore。

---

## 3. 目录结构

```
note-web/
├── apps/
│   ├── web/                     # Note Web 前端（包含 vim-companion.ts 与状态机）
│   └── server/                  # Note Web 服务端
├── companion/
│   ├── extension/               # Chrome / Edge MV3 浏览器扩展
│   │   ├── manifest.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── popup.html
│   │   └── src/
│   │       ├── background.ts    # Service Worker，管理 Native Messaging Port 与 Tab 归属
│   │       ├── content.ts       # Content Script，桥接 window.postMessage 与 background
│   │       ├── protocol.ts      # 消息协议类型
│   │       └── popup.ts         # 诊断面板脚本
│   └── windows-host/            # Rust Win32 Native Messaging Host
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs          # 入口（Native Messaging 循环与 CLI doctor/roundtrip）
│           ├── protocol.rs      # 原生协议定义与单元测试
│           ├── native_messaging.rs # 32-bit native-endian framing 编解码
│           ├── window.rs        # 前台目标浏览器窗口校验
│           └── ime.rs           # Win32 Strategy A (IMM) 与 Strategy B (HKL)
├── scripts/
│   ├── install-vim-companion.ps1   # PowerShell 安装与注册脚本
│   └── uninstall-vim-companion.ps1 # PowerShell 卸载脚本
└── docs/
    └── vim-companion.md         # 本文档
```

---

## 4. 安装与配置步骤

### 步骤 1：编译 Native Host
在 Windows 11 本机上执行：
```powershell
cd companion/windows-host
cargo build --release
```
生成的可执行文件位于：`companion/windows-host/target/release/note-web-ime.exe`。

### 步骤 2：编译 Browser Extension
```powershell
cd companion/extension
npm run build
```
生成文件位于：`companion/extension/dist/`。

### 步骤 3：在 Edge / Chrome 中加载扩展
1. 打开浏览器扩展页面：
   - Edge: `edge://extensions/`
   - Chrome: `chrome://extensions/`
2. 打开右上角 **“开发者模式” (Developer mode)**。
3. 点击 **“加载解压缩的扩展” (Load unpacked)**。
4. 选择目录：`note-web/companion/extension`。
5. 复制浏览器分配给该扩展的 **ID**（例如：`afoihbcdefghijklmnopabcdefghijkl`）。

### 步骤 4：注册 Native Messaging Host
以普通用户权限打开 PowerShell 7 并运行安装脚本：
```powershell
# 针对 Edge 浏览器注册
.\scripts\install-vim-companion.ps1 -Browser Edge -ExtensionId YOUR_EXTENSION_ID

# 或针对 Chrome 浏览器注册
.\scripts\install-vim-companion.ps1 -Browser Chrome -ExtensionId YOUR_EXTENSION_ID
```
脚本会自动将 `note-web-ime.exe` 复制到 `%LOCALAPPDATA%\NoteWeb\Companion\`，生成包含正确 `allowed_origins` 的 `com.noteweb.ime.json` 清单，并在当前用户的注册表 `HKCU` 中完成注册。

---

## 5. 连接与诊断测试

### 1. 运行 CLI Doctor 诊断
```powershell
.\companion\windows-host\target\release\note-web-ime.exe doctor
```
可查看当前前台窗口、PID、TID、当前键盘布局 (HKL)、语言 ID (LANGID) 及输入法状态。

### 2. 运行交互式 Roundtrip 验证
```powershell
.\companion\windows-host\target\release\note-web-ime.exe roundtrip
```
向导会在 3 秒内检测您激活的浏览器窗口，将其切换为 ASCII 模式，提示您在浏览器中键入验证无候选框，按回车后自动恢复原输入法。

### 3. Extension Popup 测试
点击浏览器右上角的 **Note Web Vim Companion** 插件图标，点击 **“测试连接”**，确认 Native Host 显示为 `Connected`，策略为 `Keyboard Layout` 或 `IME Open State`。

---

## 6. 微软拼音与 Rime 真实验收指南

请按照以下真实场景进行验证：

| 序号 | 场景 | 操作步骤 | 预期效果 |
| :--- | :--- | :--- | :--- |
| **Case A** | INSERT 模式中文输入 | 切换到 Vim INSERT 模式，输入 `nihao` 并选择候选 | 正常输入中文“你好” |
| **Case B** | Esc 退出插入模式 | 按 `Escape` 键 | 状态栏显示 `VIM · IME Auto`，系统自动切至 ASCII |
| **Case C** | NORMAL 模式单键 | 在 NORMAL 模式下按 `i` | 直接进入 Vim INSERT 模式，**绝对不弹出拼音候选框** |
| **Case D** | NORMAL 模式位移与操作 | 在 NORMAL 模式下按 `hjkl`、`dd`、`ciw`、`gg` | 所有 Vim 指令流畅执行，无任何输入法干扰 |
| **Case E** | Search `/` 搜索 | NORMAL 模式下按 `/` | 搜索栏打开，系统自动恢复中文输入，可输入中文搜索词（如 `/编译原理`） |
| **Case F** | 退出搜索 | 按 `Enter` 或 `Escape` 退出搜索 | 编辑器重回 NORMAL 模式，系统自动切回 ASCII |
| **Case G** | Vim → IR 模式切换 | 点击顶部切换至 IR 模式或输入 `:ir` | 正常恢复用户原本的中文输入法 |
| **Case H** | 竞态安全测试 | 按 `Escape` 后立即在几毫秒内按 `i` | 在 Native ACK 确认前按键被安全拦截，不会触发错误 INSERT |

---

## 7. 卸载指南

如需彻底移除 Native Host 与注册表项，在 PowerShell 中执行：
```powershell
.\scripts\uninstall-vim-companion.ps1
```
然后在浏览器扩展页面中移除 Note Web Vim IME Companion 扩展即可。

---

## 8. 常见问题排查 (Troubleshooting)

### Q1: 提示 `Specified native messaging host not found`
- **原因**：注册表中的 `com.noteweb.ime` 路径未配置正确，或指向的 `com.noteweb.ime.json` 文件不存在。
- **解决办法**：重新运行 `install-vim-companion.ps1`，确保 `%LOCALAPPDATA%\NoteWeb\Companion\com.noteweb.ime.json` 存在且包含正确的可执行文件路径。

### Q2: 提示 `Access forbidden` 或 `Unauthorized caller`
- **原因**：`com.noteweb.ime.json` 清单中的 `allowed_origins` 与当前浏览器实际分配的扩展 ID 不匹配。
- **解决办法**：在浏览器扩展页面复制实际 ID，重新运行 `install-vim-companion.ps1 -ExtensionId <实际ID>`。

### Q3: 状态显示 `VIM · IME Fallback`
- **原因**：浏览器扩展未加载或 Native Host 未连接，Note Web 正在使用内置的 Web 代理兜底模式。
- **解决办法**：打开扩展 Popup 点击“测试连接”，检查 Native Host 是否正常运行。

### Q4: 切换后未切为 ASCII，或提示 `TARGET_NOT_BROWSER`
- **原因**：请求切换时前台激活的窗口不是 Chrome 或 Edge。
- **解决办法**：确保操作焦点位于 Note Web 编辑器所在的浏览器窗口内。
