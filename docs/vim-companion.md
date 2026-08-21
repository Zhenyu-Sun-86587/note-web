# Note Web — Windows Vim IME Companion 说明与使用指南

## 1. 解决什么问题

在 Windows 11 环境下，使用 Chrome 或 Edge 浏览器访问 Web 编辑器（如 CodeMirror Vim）时，当系统中文输入法（微软拼音、Rime 等）处于中文模式时，Vim 的 **NORMAL / VISUAL** 模式容易发生输入法按键拦截冲突：

- **典型症状**：在 NORMAL 模式下，用户按 `i`、`a`、`o`、`h`、`j`、`k`、`l`、`dd` 等键时，中文输入法会将其作为拼音输入拦截并弹出候选框。
- **技术原因**：纯 Web 前端无法直接控制操作系统的输入法内核（IMM / TSF），仅靠前端事件（如 `keydown`、`keyCode 229`、`compositionstart`）进行猜测在系统中文模式下存在竞态与边缘情况。

**Windows Vim IME Companion** 提供了一套系统级协同机制：
1. **NORMAL / VISUAL 模式**：通过 Windows Native Host 将目标 Note Web 浏览器窗口的输入状态切换为 ASCII / 英文输入，并经操作系统级查询验证后放行 Vim 指令；
2. **Pending 拦截**：在切换过程中（`normal-pending`），所有可打印字符一律拦截，杜绝误触发；
3. **INSERT / REPLACE / Search / Ex / IR 模式**：自动恢复用户原本的输入法状态；
4. **安全兜底**：在插件未安装或异常时自动降级为 Web IME Proxy 兜底。

> **注意**：自动化测试用于验证各层协议与状态机流转；针对不同输入法（微软拼音 / Rime）的实际表现需要通过 Windows 本机进行人工验证。

---

## 2. 整体架构与设计原则

```
Note Web (Web Frontend)
   │  window.postMessage (命名空间: { source: "note-web", channel: "vim-ime" })
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
- **真实验证**：只有 Native Host 重新查询并确认目标窗口当前确实处于 ASCII 状态时，才允许进入 `normal-ready`。
- **状态及时失效**：页面切走（`hidden`）、窗口失焦或 Native 连接断开时，立即作废 `normal-ready` 状态。
- **安全兜底**：Web 代理作为 fail-safe，在插件未安装或异常时保证页面正常编辑。
- **最小干扰与所有权保护**：记录初次修改的 HWND 与 PID，`restore` 仅针对原目标窗口；若目标发生冲突拒绝静默覆盖。

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
2. 打开右上角 **“开发者模式” (Developer mode)**；
3. 点击 **“加载解压缩的扩展” (Load unpacked)**；
4. 选择目录：`note-web/companion/extension`；
5. 复制浏览器分配给该扩展的 **ID**（例如：`abcdefghijklmnopabcdefghijklmnop`）。

> **生产环境说明**：当前扩展清单中的 `matches` 针对本地开发（`http://localhost:*/*` 与 `http://127.0.0.1:*/*`）。若在独立域名下部署 Note Web，需将对应生产域名加入 `manifest.json` 的 `content_scripts.matches` 与 `host_permissions`。

### 步骤 4：注册 Native Messaging Host
以普通用户权限打开 PowerShell 7 并运行安装脚本：
```powershell
# 针对 Edge 浏览器注册
.\scripts\install-vim-companion.ps1 -Browser Edge -ExtensionId YOUR_EXTENSION_ID

# 或针对 Chrome 浏览器注册
.\scripts\install-vim-companion.ps1 -Browser Chrome -ExtensionId YOUR_EXTENSION_ID
```

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
向导会在 3 秒内检测激活的浏览器窗口，将其切换为 ASCII 模式，提示在浏览器中键入验证无候选框，按回车后自动恢复原输入法。

### 3. Extension Popup 测试
点击浏览器右上角的 **Note Web Vim Companion** 插件图标，点击 **“测试连接”**，确认 Native Host 状态为已连接。

---

## 6. 微软拼音与 Rime 真实验收指南

请按照以下场景进行验证：

| 序号 | 场景 | 操作步骤 | 预期效果 |
| :--- | :--- | :--- | :--- |
| **Case 1** | INSERT 模式中文输入 | 切换到 Vim INSERT 模式，输入 `nihao` 并选择候选 | 正常输入中文“你好” |
| **Case 2** | Esc 退出插入模式 | 按 `Escape` 键 | 状态栏显示 `VIM · IME Auto`，系统切换至 ASCII |
| **Case 3** | NORMAL 模式单键 | 在 NORMAL 模式下按 `i` | 直接进入 Vim INSERT 模式，无候选框弹出 |
| **Case 4** | NORMAL 模式位移与操作 | 在 NORMAL 模式下按 `hjkl`、`dd`、`ciw`、`gg` | Vim 指令正常执行 |
| **Case 5** | Search `/` 搜索 | NORMAL 模式下按 `/` | 搜索栏打开，恢复中文输入，可输入中文搜索词 |
| **Case 6** | 退出搜索 | 按 `Enter` 或 `Escape` 退出搜索 | 编辑器重回 NORMAL 模式，自动重新获取 ASCII 状态 |
| **Case 7** | 切换标签页 / 窗口 | 切换到其他标签页再切回 | 离开时触发 restore，切回时重新验证并 acquire ASCII |
| **Case 8** | Vim → IR 模式切换 | 点击顶部切换至 IR 模式或输入 `:ir` | 正常恢复用户原本的中文输入法 |

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
