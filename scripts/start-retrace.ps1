# Starts Retrace and opens it in your browser. This is what the "Retrace"
# shortcut on your desktop runs (scripts/create-shortcut.ps1 makes it).
#
# It installs dependencies on the first run, rebuilds only when the code has
# changed since the last build, then starts the fast production server on
# http://127.0.0.1:3000. Keep the window open while you use Retrace; close it
# (or press Ctrl+C) to stop Retrace.
#
# -NoBrowser starts the server without opening a browser tab.

param([switch]$NoBrowser)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$Host.UI.RawUI.WindowTitle = "Retrace"
$url = "http://127.0.0.1:3000"

function Test-Retrace {
  try {
    $response = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -eq 200) -and ($response.Content -match '"ok":true')
  } catch {
    return $false
  }
}

function Stop-WithMessage([string]$message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Red
  # Keep the window open so the message can be read.
  Read-Host "Press Enter to close"
  exit 1
}

function Open-Retrace {
  if (-not $NoBrowser) { Start-Process $url }
}

Write-Host "Retrace" -ForegroundColor Cyan
Write-Host ""

# Already running (for example from an earlier double-click): just open it.
if (Test-Retrace) {
  Write-Host "Retrace is already running. Opening it in your browser."
  Open-Retrace
  Start-Sleep -Seconds 2
  exit 0
}

if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  Stop-WithMessage "Something else is using port 3000. Close that program, then try again."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Node.js was not found. Install Node.js 22 or newer from https://nodejs.org, then try again."
}

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Installing dependencies (first run only, takes a few minutes)..."
  npm install
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "npm install failed. See the messages above." }
}

# Rebuild only when something that goes into the build is newer than the last build.
$buildId = Join-Path $root ".next\BUILD_ID"
$needsBuild = -not (Test-Path $buildId)
if (-not $needsBuild) {
  $builtAt = (Get-Item $buildId).LastWriteTime
  $inputs = @(Get-ChildItem -Path (Join-Path $root "src") -Recurse -File)
  $inputs += @(Get-Item -Path "package.json", "package-lock.json", "next.config.ts", "tsconfig.json" -ErrorAction SilentlyContinue)
  $newest = ($inputs | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
  $needsBuild = $newest -gt $builtAt
}
if ($needsBuild) {
  Write-Host "Preparing Retrace (only after an update, takes a minute or two)..."
  npm run build
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "The build failed. See the messages above." }
}

Write-Host "Starting Retrace..."
$server = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -NoNewWindow -PassThru
$deadline = (Get-Date).AddSeconds(90)
while (-not (Test-Retrace)) {
  if ($server.HasExited) { Stop-WithMessage "Retrace stopped while starting. See the messages above." }
  if ((Get-Date) -gt $deadline) { Stop-WithMessage "Retrace did not start within 90 seconds. See the messages above." }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "Retrace is ready at $url" -ForegroundColor Green
Write-Host "Keep this window open while you use Retrace. Close it to stop Retrace."
Write-Host ""
Open-Retrace
$server.WaitForExit()
