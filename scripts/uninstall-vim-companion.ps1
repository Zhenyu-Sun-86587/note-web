<#
.SYNOPSIS
  Uninstalls Note Web Vim IME Companion Native Host and cleans up Windows Registry keys.

.DESCRIPTION
  Removes registry keys under HKCU NativeMessagingHosts for Edge and Chrome, and removes
  the %LOCALAPPDATA%\NoteWeb\Companion installation directory.

.PARAMETER Browser
  The browser registration to remove ('Edge', 'Chrome', or 'All'). Defaults to 'All'.

.EXAMPLE
  .\scripts\uninstall-vim-companion.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("Edge", "Chrome", "All")]
    [string]$Browser = "All"
)

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Note Web Vim IME Companion — Windows Host Uninstaller" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$edgeKey = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.noteweb.ime"
$chromeKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.noteweb.ime"

if ($Browser -eq "Edge" -or $Browser -eq "All") {
    if (Test-Path $edgeKey) {
        Remove-Item -Path $edgeKey -Recurse -Force
        Write-Host "[REMOVED] Edge Native Messaging Host registry key: $edgeKey" -ForegroundColor Green
    }
}

if ($Browser -eq "Chrome" -or $Browser -eq "All") {
    if (Test-Path $chromeKey) {
        Remove-Item -Path $chromeKey -Recurse -Force
        Write-Host "[REMOVED] Chrome Native Messaging Host registry key: $chromeKey" -ForegroundColor Green
    }
}

$installDir = Join-Path $env:LOCALAPPDATA "NoteWeb\Companion"
if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force
    Write-Host "[REMOVED] Installed files in: $installDir" -ForegroundColor Green
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Uninstallation Complete." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
