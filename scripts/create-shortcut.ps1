# Puts a "Retrace" shortcut on your desktop that runs scripts/start-retrace.ps1.
# Run it again (npm run shortcut) if you move the Retrace folder.
#
# The shortcut passes -ExecutionPolicy Bypass for that one script only; your
# PowerShell execution policy setting is not changed.

$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$target = Join-Path $desktop "Retrace.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($target)
$shortcut.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\start-retrace.ps1`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$root\src\app\favicon.ico,0"
$shortcut.Description = "Start Retrace and open it in your browser"
$shortcut.Save()

Write-Host "Created $target"
