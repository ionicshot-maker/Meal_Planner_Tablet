<#
.SYNOPSIS
  Service wrapper: keeps the Meal Planner server running, restarts it if it dies, and keeps its log from growing forever.
  The Scheduled Task runs this; you normally never run it by hand (but you can, for a foreground test).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseDir,
  [Parameter(Mandatory)][string]$DataDir,
  [string]$NodeExe = 'node.exe',
  [string]$EnvFile
)
$ErrorActionPreference = 'Stop'
if (-not $EnvFile) { $EnvFile = Join-Path $DataDir 'server.env' }
$serverDir = Join-Path $ReleaseDir 'server'
$logDir = Join-Path $DataDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'server.log'

function Write-Log([string]$m) { Add-Content -Path $log -Value ("{0}  [wrapper] {1}" -f (Get-Date).ToString('s'), $m) }

# Everything the server needs besides the env file (which holds ports/origins and is edited by hand).
$env:ENV_FILE     = $EnvFile
$env:DATA_DIR     = $DataDir
$env:FRONTEND_DIR = Join-Path $ReleaseDir 'web'
# The server exits on its own if this wrapper is killed (Task Scheduler's "Stop" only terminates the wrapper itself).
$env:WATCH_PARENT_PID = [string]$PID

$delay = 2
while ($true) {
  # Rotate at 10 MB, keep one previous log.
  if ((Test-Path $log) -and ((Get-Item $log).Length -gt 10MB)) { Move-Item $log "$log.1" -Force }
  $started = Get-Date
  Write-Log "starting: $NodeExe dist\index.js (data: $DataDir)"
  Push-Location $serverDir
  try {
    # cmd handles the stdout+stderr redirect reliably across Windows PowerShell versions.
    & cmd.exe /c "`"$NodeExe`" dist\index.js >> `"$log`" 2>&1"
    $code = $LASTEXITCODE
  } finally { Pop-Location }
  $ranFor = ((Get-Date) - $started).TotalSeconds
  Write-Log ("server exited with code {0} after {1:N0}s" -f $code, $ranFor)
  # A healthy long run resets the back-off; a crash loop slows down instead of spinning.
  if ($ranFor -gt 60) { $delay = 2 } else { $delay = [Math]::Min($delay * 2, 60) }
  Write-Log "restarting in ${delay}s"
  Start-Sleep -Seconds $delay
}
