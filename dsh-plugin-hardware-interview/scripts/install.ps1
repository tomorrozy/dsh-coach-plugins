# dsh-plugin-hardware-interview · 安装脚本
#
# 把插件登记进某个 DSH profile（默认 desktop）：
#   1. 备份 profile 的 package.json
#   2. dependencies 增加 "dsh-hardware-interview-teacher": "link:<插件目录>"
#   3. dsh.profile.bundles 追加插件名
#   4. profile/node_modules 下建 junction 指向插件目录
# 幂等：重复执行不会重复登记。装完重启对应进程才生效。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Profile desktop
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Profile web

[CmdletBinding()]
param(
    [ValidateSet('desktop', 'web', 'tui', 'headless')]
    [string]$Profile = 'desktop',
    [string]$PluginPath = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($PluginPath)) {
    $PluginPath = Split-Path -Parent $PSScriptRoot
}
$PluginPath = [System.IO.Path]::GetFullPath($PluginPath)
$manifestPath = Join-Path $PluginPath 'package.json'
if (-not (Test-Path $manifestPath)) {
    throw "插件目录缺少 package.json：$manifestPath"
}
$pluginName = (Get-Content -Raw $manifestPath | ConvertFrom-Json).name
if ([string]::IsNullOrWhiteSpace($pluginName)) {
    throw "package.json 缺少 name：$manifestPath"
}

$profilesRoot = Join-Path $env:USERPROFILE '.dsh\profiles'
$profileDir = Join-Path $profilesRoot $Profile
$profileManifest = Join-Path $profileDir 'package.json'
if (-not (Test-Path $profileManifest)) {
    throw "profile 不存在：$profileManifest（可用 dsh --from-default-profile 创建，或先启动一次该 profile）"
}

# 1) 备份
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$profileManifest.bak-hiw-$stamp"
Copy-Item $profileManifest $backup -Force

# 2) 改 package.json
$manifest = Get-Content -Raw $profileManifest | ConvertFrom-Json
if ($null -eq $manifest.dependencies) {
    $manifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
}
$linkValue = "link:$PluginPath"
$existingDep = $manifest.dependencies.PSObject.Properties[$pluginName]
if ($null -eq $existingDep) {
    $manifest.dependencies | Add-Member -NotePropertyName $pluginName -NotePropertyValue $linkValue -Force
    Write-Host "  + dependencies.$pluginName = $linkValue"
}
elseif ($existingDep.Value -ne $linkValue) {
    if (-not $Force) {
        throw "dependencies.$pluginName 已存在且值不同：$($existingDep.Value)。确认后用 -Force 覆盖。"
    }
    $manifest.dependencies.$pluginName = $linkValue
    Write-Host "  ~ dependencies.$pluginName = $linkValue"
}

if ($null -eq $manifest.dsh) {
    $manifest | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{ profile = [pscustomobject]@{ bundles = @() } }) -Force
}
if ($null -eq $manifest.dsh.profile) {
    $manifest.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{ bundles = @() }) -Force
}
$bundles = @()
if ($null -ne $manifest.dsh.profile.bundles) { $bundles = @($manifest.dsh.profile.bundles) }
if ($bundles -notcontains $pluginName) {
    $bundles += $pluginName
    $manifest.dsh.profile.bundles = $bundles
    Write-Host "  + dsh.profile.bundles += $pluginName"
}
else {
    Write-Host "  = dsh.profile.bundles 已包含 $pluginName"
}

$json = $manifest | ConvertTo-Json -Depth 32
[System.IO.File]::WriteAllText($profileManifest, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))

# 3) node_modules junction
$nodeModules = Join-Path $profileDir 'node_modules'
if (-not (Test-Path $nodeModules)) { New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null }
$linkPath = Join-Path $nodeModules $pluginName
if (Test-Path $linkPath) {
    $item = Get-Item $linkPath -Force
    if ($item.LinkType -eq 'Junction' -and $item.Target -eq $PluginPath) {
        Write-Host "  = node_modules\$pluginName 已指向插件目录"
    }
    elseif ($Force) {
        Remove-Item $linkPath -Force -Recurse
        New-Item -ItemType Junction -Path $linkPath -Target $PluginPath | Out-Null
        Write-Host "  ~ node_modules\$pluginName 已重建"
    }
    else {
        throw "node_modules\$pluginName 已存在且不是指向 $PluginPath 的 junction；确认后用 -Force 重建。"
    }
}
else {
    New-Item -ItemType Junction -Path $linkPath -Target $PluginPath | Out-Null
    Write-Host "  + node_modules\$pluginName -> $PluginPath"
}

Write-Host ''
Write-Host "已安装到 profile: $Profile" -ForegroundColor Green
Write-Host "  manifest: $profileManifest"
Write-Host "  备份:     $backup"
Write-Host ''
Write-Host '下一步：重启对应进程后，左侧栏会出现「硬件面试」入口（会话保留）。' -ForegroundColor Yellow
