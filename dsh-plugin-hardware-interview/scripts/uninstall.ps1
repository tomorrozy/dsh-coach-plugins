# dsh-plugin-hardware-interview · 卸载脚本
#
# 只移除本插件的登记，不动插件目录、状态文件与复盘文件：
#   1. 备份 profile 的 package.json
#   2. 从 dsh.profile.bundles / dependencies 移除插件名
#   3. 删除 profile/node_modules 下指向插件目录的 junction（仅当目标匹配）
# 改完重启对应进程才生效。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Profile desktop

[CmdletBinding()]
param(
    [ValidateSet('desktop', 'web', 'tui', 'headless')]
    [string]$Profile = 'desktop',
    [string]$PluginPath = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($PluginPath)) {
    $PluginPath = Split-Path -Parent $PSScriptRoot
}
$PluginPath = [System.IO.Path]::GetFullPath($PluginPath)
$pluginName = 'dsh-hardware-interview-teacher'
if (Test-Path (Join-Path $PluginPath 'package.json')) {
    $pluginName = (Get-Content -Raw (Join-Path $PluginPath 'package.json') | ConvertFrom-Json).name
}

$profileManifest = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\package.json"
if (-not (Test-Path $profileManifest)) {
    throw "profile 不存在：$profileManifest"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$profileManifest.bak-hiw-remove-$stamp"
Copy-Item $profileManifest $backup -Force

$manifest = Get-Content -Raw $profileManifest | ConvertFrom-Json
if ($null -ne $manifest.dsh.profile.bundles) {
    $bundles = @($manifest.dsh.profile.bundles) | Where-Object { $_ -ne $pluginName }
    $manifest.dsh.profile.bundles = $bundles
}
if ($null -ne $manifest.dependencies -and $null -ne $manifest.dependencies.PSObject.Properties[$pluginName]) {
    $manifest.dependencies.PSObject.Properties.Remove($pluginName)
}
$json = $manifest | ConvertTo-Json -Depth 32
[System.IO.File]::WriteAllText($profileManifest, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  - 已从 $Profile 的 package.json 移除 $pluginName"

$linkPath = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\node_modules\$pluginName"
if (Test-Path $linkPath) {
    $item = Get-Item $linkPath -Force
    if ($item.LinkType -eq 'Junction' -and $item.Target -eq $PluginPath) {
        Remove-Item $linkPath -Force -Recurse
        Write-Host "  - 已删除 junction $linkPath"
    }
    else {
        Write-Host "  ! $linkPath 不是指向 $PluginPath 的 junction，未删除（请手动确认）" -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host "已卸载：$Profile" -ForegroundColor Green
Write-Host "  备份: $backup"
Write-Host '状态与复盘保留：'
Write-Host "  <DSH_HOME>\hardware-interview\state.json"
Write-Host '  <workspace>\面试记录\硬件面试复盘-*.md'
Write-Host '重启对应进程后生效。' -ForegroundColor Yellow
