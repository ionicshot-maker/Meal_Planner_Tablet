<#
.SYNOPSIS
  One command for the safe redeploy sequence: stop the task (not just the process), take a backup of the database while the server
  is stopped, rebuild, restart, check health (and roll back by itself if the new version does not come up), and show status -- in
  that order, every time.

.DESCRIPTION
  Why the task is stopped first: the service wrapper (run-server.ps1) restarts node a couple of seconds after it dies, so killing
  the process and rebuilding straight away can lose the race (node grabs the release folder's file lock right back). Stopping the
  SCHEDULED TASK removes the thing that would resurrect it.

  Why the backup: with the server stopped the database file is quiet, so the copy is a clean one taken immediately before the new
  code ever touches it. It lands in <DataDir>\backups next to the nightly ones (and on the NAS if NAS_BACKUP_PATH is set).

  Nothing is pulled from git unless you pass -Pull: a redeploy builds exactly what is checked out.

.EXAMPLE
  .\redeploy.ps1
.EXAMPLE
  .\redeploy.ps1 -Pull
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'MealPlannerServer',
  [int]$Port = 8791,
  [int]$HttpsPort = 8447,
  [string]$DataDir = 'C:\MealPlanner\data',
  [string]$OutDir = 'C:\MealPlanner\release',
  [switch]$Pull,
  [switch]$NoBackup
)
$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  throw "Task '$TaskName' is not installed. This is for updating an existing install; for a first install use deploy-mealplanner.ps1."
}

function Stop-Server {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $ownerPid = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  if ($ownerPid) {
    $name = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
    # Only ever kill an orphaned node; anything else on this port is somebody else's and needs a human.
    if ($name -ne 'node') { throw "Port $Port is held by '$name' (PID $ownerPid), not node. Not touching it." }
    Step "Port $Port is still held by node (PID $ownerPid): an orphan the task stop didn't catch. Stopping it."
    Stop-Process -Id $ownerPid -Force
    Start-Sleep -Seconds 1
  }
}
function Wait-Healthy {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try { if ((Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2).ok -eq $true) { return $true } } catch { }
  }
  return $false
}

if ($Pull) {
  Step "git pull ($repoRoot)"
  Push-Location $repoRoot
  try { git pull; if ($LASTEXITCODE -ne 0) { throw 'git pull failed' } } finally { Pop-Location }
}

Step "Stopping task '$TaskName' (this is what prevents the restart race, not killing the process alone)"
Stop-Server

if (-not $NoBackup) {
  $db = Join-Path $DataDir 'meal-planner.sqlite'
  $installed = Join-Path $OutDir 'server\dist\index.js'
  if ((Test-Path $db) -and (Test-Path $installed)) {
    Step 'Backing up the database (server is stopped, so this is a clean copy)'
    $env:ENV_FILE = Join-Path $DataDir 'server.env'
    $env:DATA_DIR = $DataDir
    & node $installed backup
    if ($LASTEXITCODE -ne 0) { throw 'The pre-redeploy backup FAILED, so nothing was changed. Fix that first (or pass -NoBackup if you really mean to skip it); the server is still stopped, start it with: Start-ScheduledTask ' + $TaskName }
  } else {
    Write-Host '    no database or installed release yet; nothing to back up'
  }
}

Step 'Building the new release'
try {
  & (Join-Path $PSScriptRoot 'build-release.ps1') -OutDir $OutDir
} catch {
  Write-Warning "The build failed: $($_.Exception.Message)"
  Write-Warning 'The running release was not touched. Starting it again.'
  Start-ScheduledTask -TaskName $TaskName
  throw
}

Step "Starting task '$TaskName'"
Start-ScheduledTask -TaskName $TaskName
if (Wait-Healthy) {
  Write-Host '    healthy.' -ForegroundColor Green
} else {
  Write-Warning "The new version did not answer on port $Port within 30 s."
  $prev = "$OutDir.previous"
  if (Test-Path $prev) {
    Step 'Rolling back to the previous release'
    Stop-Server
    Remove-Item $OutDir -Recurse -Force
    Move-Item $prev $OutDir
    Start-ScheduledTask -TaskName $TaskName
    if (Wait-Healthy) { Write-Host '    rolled back; the previous version is serving again.' -ForegroundColor Yellow }
    else { Write-Warning "Still not answering after the rollback. Check $DataDir\logs\server.log" }
  } else {
    Write-Warning "There is no previous release to roll back to. Check $DataDir\logs\server.log"
  }
}

Step 'Status'
& (Join-Path $PSScriptRoot 'status.ps1') -TaskName $TaskName -DataDir $DataDir -Port $Port -HttpsPort $HttpsPort
