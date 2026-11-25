<#
.SYNOPSIS
Shortcuts of Orbit: on the desktop, in the Start menu and, if asked, at logon.

.DESCRIPTION
Only shortcuts of the current user are written: no administrator rights, no registry, no services.

  powershell -ExecutionPolicy Bypass -File bin\shortcuts.ps1 -WhatIf     show what would be done
  powershell -ExecutionPolicy Bypass -File bin\shortcuts.ps1             desktop and Start menu
  powershell -ExecutionPolicy Bypass -File bin\shortcuts.ps1 -Autostart  and at logon, without a window
  powershell -ExecutionPolicy Bypass -File bin\shortcuts.ps1 -Remove     take all of them away
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Autostart,
    [switch]$Remove,
    # Another place instead of the folders of the user: for tests.
    [string]$Root
)
$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $project 'backend'
$pythonw = Join-Path $backend '.venv\Scripts\pythonw.exe'
$icon = Join-Path $PSScriptRoot 'orbit.ico'

if ($Root) {
    $desktop = Join-Path $Root 'Desktop'
    $programs = Join-Path $Root 'Programs'
    $startup = Join-Path $Root 'Startup'
} else {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $programs = [Environment]::GetFolderPath('Programs')
    $startup = [Environment]::GetFolderPath('Startup')
}
$menu = Join-Path $programs 'Orbit'

$all = @(
    @{ Path = (Join-Path $desktop 'Orbit.lnk'); Arguments = '-m orbit app'; About = 'Project tracker' }
    @{ Path = (Join-Path $menu 'Orbit.lnk'); Arguments = '-m orbit app'; About = 'Project tracker' }
    @{ Path = (Join-Path $menu 'Stop Orbit.lnk'); Arguments = '-m orbit stop --quiet'; About = 'Stop the server of Orbit' }
    @{ Path = (Join-Path $startup 'Orbit.lnk'); Arguments = '-m orbit app --background'; About = 'Orbit at logon'; AtLogon = $true }
)

if ($Remove) {
    foreach ($one in $all) {
        if ((Test-Path -LiteralPath $one.Path) -and $PSCmdlet.ShouldProcess($one.Path, 'Remove shortcut')) {
            Remove-Item -LiteralPath $one.Path -Confirm:$false
            "removed $($one.Path)"
        }
    }
    if ((Test-Path -LiteralPath $menu) -and -not (Get-ChildItem -LiteralPath $menu -Force)) {
        if ($PSCmdlet.ShouldProcess($menu, 'Remove empty folder')) { Remove-Item -LiteralPath $menu -Confirm:$false }
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $pythonw)) {
    [Console]::Error.WriteLine("not found: $pythonw. Run 'uv sync' in the backend folder first.")
    exit 1
}

$shell = New-Object -ComObject WScript.Shell
foreach ($one in $all) {
    if ($one.AtLogon -and -not $Autostart) { continue }
    if (-not $PSCmdlet.ShouldProcess($one.Path, 'Create shortcut')) { continue }
    $folder = Split-Path -Parent $one.Path
    if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
    $link = $shell.CreateShortcut($one.Path)
    $link.TargetPath = $pythonw
    $link.Arguments = $one.Arguments
    $link.WorkingDirectory = $backend
    $link.IconLocation = "$icon,0"
    $link.Description = $one.About
    $link.Save()
    "created $($one.Path)"
}
