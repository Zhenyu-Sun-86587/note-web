<#
.SYNOPSIS
  Note Web — Windows Vim IME Companion 一键交互式安装脚本

.DESCRIPTION
  自动编译 Extension 与 Native Messaging Host (Rust)，自动打开 Edge/Chrome 扩展管理页与
  解压扩展目录，提示用户加载扩展并输入 Extension ID，自动调用注册脚本完成部署并运行 doctor 诊断。

.PARAMETER Browser
  目标浏览器 ('Edge' 或 'Chrome')。默认为 'Edge'。

.EXAMPLE
  .\scripts\setup-vim-companion.ps1
  .\scripts\setup-vim-companion.ps1 -Browser Chrome
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("Edge", "Chrome")]
    [string]$Browser = "Edge"
)

$ErrorActionPreference = "Stop"

# 确定脚本路径与仓库根目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$extensionDir = Join-Path $repoRoot "companion\extension"
$windowsHostDir = Join-Path $repoRoot "companion\windows-host"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Note Web — Windows Vim IME Companion 一键安装助手" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "目标浏览器: $Browser" -ForegroundColor Gray
Write-Host "生产环境地址: https://notes.adcdxc.me" -ForegroundColor Gray
Write-Host "扩展目录:     $extensionDir" -ForegroundColor Gray
Write-Host ""

# ------------------------------------------------------------
# 1. 依赖环境检查 (Node.js / npm & Rust / cargo)
# ------------------------------------------------------------
Write-Host "[1/6] 检查开发与编译环境..." -ForegroundColor Yellow

$hasNode = Get-Command "node" -ErrorAction SilentlyContinue
$hasNpm = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $hasNode -or -not $hasNpm) {
    Write-Host "[ERROR] 未检测到 Node.js / npm 环境！" -ForegroundColor Red
    Write-Host "请先安装 Node.js (推荐 v18+ 或 v20+ LTS):" -ForegroundColor White
    Write-Host "  - 官网下载: https://nodejs.org/" -ForegroundColor Cyan
    Write-Host "  - 或通过终端: winget install OpenJS.NodeJS" -ForegroundColor Cyan
    exit 1
}
$nodeVer = (node -v).Trim()
$npmVer = (npm -v).Trim()
Write-Host "  ✓ Node.js ($nodeVer) & npm ($npmVer) 已就绪" -ForegroundColor Green

$hasCargo = Get-Command "cargo" -ErrorAction SilentlyContinue
$hasRustc = Get-Command "rustc" -ErrorAction SilentlyContinue
if (-not $hasCargo -or -not $hasRustc) {
    Write-Host "[ERROR] 未检测到 Rust / Cargo 编译工具链！" -ForegroundColor Red
    Write-Host "请先安装 Rust (stable-x86_64-pc-windows-msvc):" -ForegroundColor White
    Write-Host "  - 官网下载: https://rustup.rs/" -ForegroundColor Cyan
    Write-Host "  - 或通过终端: winget install Rustlang.Rustup" -ForegroundColor Cyan
    exit 1
}
$rustVer = (rustc --version).Trim()
Write-Host "  ✓ Rust 工具链 ($rustVer) 已就绪" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 2. 编译 Companion 浏览器扩展
# ------------------------------------------------------------
Write-Host "[2/6] 编译 Companion 浏览器扩展..." -ForegroundColor Yellow

$extNodeModules = Join-Path $extensionDir "node_modules"
if (-not (Test-Path $extNodeModules)) {
    Write-Host "  正在安装扩展依赖 (npm install)..." -ForegroundColor Gray
    npm --prefix "$extensionDir" install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] 浏览器扩展依赖安装失败！" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  正在构建扩展代码 (npm run build)..." -ForegroundColor Gray
npm --prefix "$extensionDir" run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] 浏览器扩展构建失败！" -ForegroundColor Red
    exit 1
}

$extDistBg = Join-Path $extensionDir "dist\background.js"
if (-not (Test-Path $extDistBg)) {
    Write-Host "[ERROR] 扩展构建产物不存在: $extDistBg" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ 浏览器扩展编译成功" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 3. 编译 Native Host (Rust Release)
# ------------------------------------------------------------
Write-Host "[3/6] 编译 Windows 原生 Native Host (Rust release)..." -ForegroundColor Yellow
$cargoToml = Join-Path $windowsHostDir "Cargo.toml"
cargo build --release --manifest-path "$cargoToml"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Rust Native Host 编译失败！" -ForegroundColor Red
    exit 1
}

$compiledExe = Join-Path $windowsHostDir "target\release\note-web-ime.exe"
if (-not (Test-Path $compiledExe)) {
    Write-Host "[ERROR] 未找到生成的 note-web-ime.exe: $compiledExe" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Native Host 二进制构建成功: $compiledExe" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 4. 辅助用户加载浏览器扩展并获取 Extension ID
# ------------------------------------------------------------
Write-Host "[4/6] 加载浏览器扩展..." -ForegroundColor Yellow
Write-Host "  正在为您打开 $Browser 扩展管理页面并定位扩展目录..." -ForegroundColor Gray

# 打开对应浏览器扩展页
if ($Browser -eq "Edge") {
    Start-Process "msedge.exe" "edge://extensions/" -ErrorAction SilentlyContinue
} else {
    Start-Process "chrome.exe" "chrome://extensions/" -ErrorAction SilentlyContinue
}

# 打开资源管理器并定位到扩展目录
Start-Process "explorer.exe" "$extensionDir" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Magenta
Write-Host "【请在 $Browser 中完成以下 3 步】" -ForegroundColor Magenta
Write-Host "  1. 在刚刚打开的 $Browser 扩展页面中，开启【开发人员模式】(Developer mode)" -ForegroundColor White
Write-Host "  2. 点击顶部/左侧的【加载解压缩的扩展】(Load unpacked)" -ForegroundColor White
Write-Host "  3. 在弹出的目录选择器中，选择刚刚在资源管理器中定位的目录：" -ForegroundColor White
Write-Host "     $extensionDir" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Magenta
Write-Host ""

# 交互式读取用户复制的 Extension ID
$extensionIdInput = ""
while ([string]::IsNullOrWhiteSpace($extensionIdInput)) {
    $rawInput = Read-Host "请输入（或右键粘贴）$Browser 扩展卡片上显示的 Extension ID"
    if ($rawInput) {
        $cleanId = $rawInput.Trim()
        if ($cleanId -match "^chrome-extension://([^/]+)") {
            $cleanId = $Matches[1]
        }
        $cleanId = $cleanId.TrimEnd("/").Trim()
        if (-not ($cleanId -match "^[a-zA-Z0-9]{16,64}$")) {
            Write-Host "[WARN] 输入格式不正确（Extension ID 通常为 32 位字母），请重新输入。" -ForegroundColor Yellow
        } else {
            $extensionIdInput = $cleanId
        }
    }
}
Write-Host "  ✓ 获取到 Extension ID: $extensionIdInput" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 5. 注册 Native Messaging Host 到注册表与 LocalAppData
# ------------------------------------------------------------
Write-Host "[5/6] 部署并注册 Native Messaging Host..." -ForegroundColor Yellow

$installerScript = Join-Path $scriptDir "install-vim-companion.ps1"
if (-not (Test-Path $installerScript)) {
    Write-Host "[ERROR] 未找到安装底层脚本: $installerScript" -ForegroundColor Red
    exit 1
}

& $installerScript -Browser $Browser -ExtensionId $extensionIdInput -ExecutablePath $compiledExe
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Native Messaging Host 注册失败！" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ------------------------------------------------------------
# 6. 原生诊断 (Doctor) 验证
# ------------------------------------------------------------
Write-Host "[6/6] 运行 Windows Native 环境诊断 (doctor)..." -ForegroundColor Yellow
$installedExe = Join-Path $env:LOCALAPPDATA "NoteWeb\Companion\note-web-ime.exe"
if (Test-Path $installedExe) {
    & $installedExe doctor
} else {
    Write-Host "[WARN] 未在 $installedExe 找到部署的二进制文件。" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  🎉 Note Web Windows Vim IME Companion 安装配置完成！" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "最后一步：" -ForegroundColor White
Write-Host "  1. 回到 $Browser 扩展管理页，点击该扩展卡片上的【重新加载】(Refresh) 图标" -ForegroundColor White
Write-Host "  2. 打开 Note Web 生产地址：" -ForegroundColor White
Write-Host "     https://notes.adcdxc.me" -ForegroundColor Cyan
Write-Host "  3. 切换至 VIM 模式，左下角/状态栏将显示【VIM · IME Auto】并享有原生输入法自动切换！" -ForegroundColor Green
Write-Host ""
Write-Host "提示：如需测试前台输入法切换回环（带 UI 交互），可随时运行：" -ForegroundColor Gray
Write-Host "  & `"$installedExe`" roundtrip" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Green
