<#
.SYNOPSIS
  Installs Meal Planner as a background service that starts at boot, restarts itself, and needs no logged-in user or open
  terminal.  (It is a Windows Scheduled Task running as SYSTEM: built into Windows, nothing to download, survives reboots.)

.DESCRIPTION
  Run from an ELEVATED PowerShell (Run as administrator). Safe to re-run: it updates the task in place and never overwrites an
  existing server.env.  Use -WhatIf to see what it would do without changing anything.

  The server listens only on 127.0.0.1. To reach it from other devices put a TLS front end in front of it (Tailscale Serve) and
  give its address as -PublicOrigin. deploy-mealplanner.ps1 does all of this in the right order.

.EXAMPLE
  .\install-service.ps1 -PublicOrigin https://angelo-server.tail1234.ts.net:8447 -TrustProxy
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory)][string]$PublicOrigin,
  [string]$AllowedOrigins = '',
  [switch]$TrustProxy,
  [int]$Port = 8791,
  [string]$ReleaseDir = 'C:\MealPlanner\release',
  [string]$DataDir = 'C:\MealPlanner\data',
  [string]$TaskName = 'MealPlannerServer',
  [ValidateSet('System', 'CurrentUser')][string]$RunAs = 'System',
  [string]$NodeExe
)
$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }

# --- sanity -----------------------------------------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($RunAs -eq 'System' -and -not $isAdmin -and -not $WhatIfPreference) {
  throw 'Installing the boot-time service needs an elevated PowerShell (Run as administrator).'
}
if (-not (Test-Path (Join-Path $ReleaseDir 'server\dist\index.js'))) {
  throw "No release found at $ReleaseDir. Run build-release.ps1 first."
}
if ($DataDir -match 'OneDrive|Dropbox|Google Drive') {
  throw "DataDir ($DataDir) is inside a sync folder. SQLite and file-sync services corrupt each other; use a plain local folder like C:\MealPlanner\data."
}
if (-not $NodeExe) { $NodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path $NodeExe)) { throw "node.exe not found at $NodeExe" }
try { [void][Uri]$PublicOrigin } catch { throw "PublicOrigin is not a valid URL: $PublicOrigin" }

# --- data folder + config ---------------------------------------------------------------------------------------------
$envFile = Join-Path $DataDir 'server.env'
if ($PSCmdlet.ShouldProcess($DataDir, 'Create data folder, restrict access, write server.env if missing')) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  # The household's data: only Administrators and SYSTEM (and, for a per-user install, that user) may read it.
  $grants = @('SYSTEM:(OI)(CI)F', 'Administrators:(OI)(CI)F')
  if ($RunAs -eq 'CurrentUser') { $grants += "$($env:USERNAME):(OI)(CI)F" }
  & icacls.exe $DataDir /inheritance:r /grant:r @grants | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not set permissions on the data folder.' }

  if (-not (Test-Path $envFile)) {
    $lines = @(
      '# Meal Planner server settings. Edit, then restart the task.',
      "PORT=$Port",
      'HOST=127.0.0.1',
      "PUBLIC_ORIGIN=$PublicOrigin"
    )
    if ($AllowedOrigins) { $lines += "ALLOWED_ORIGINS=$AllowedOrigins" }
    $lines += "TRUST_PROXY=$(if ($TrustProxy) { '1' } else { '0' })"
    $lines += @('BACKUP_KEEP=14', 'BACKUP_HOUR=3')
    Set-Content -Path $envFile -Value $lines -Encoding ASCII
    Write-Host "    wrote $envFile"
  } else {
    Write-Host "    kept your existing $envFile (edit it by hand to change settings)"
  }
}

# --- the scheduled task -----------------------------------------------------------------------------------------------
$runScript = Join-Path $ReleaseDir 'run-server.ps1'
$argLine = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runScript`" -ReleaseDir `"$ReleaseDir`" -DataDir `"$DataDir`" -NodeExe `"$NodeExe`""
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argLine
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
              -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -MultipleInstances IgnoreNew
if ($RunAs -eq 'System') {
  $trigger   = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
} else {
  $trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
}

Step "Registering scheduled task '$TaskName' (runs as $RunAs, at $(if ($RunAs -eq 'System') { 'boot' } else { 'log on' }))"
if ($PSCmdlet.ShouldProcess($TaskName, 'Register and start scheduled task')) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Meal Planner household server (restarts itself; see deploy\README.md)' -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName

  Step "Waiting for the server on http://127.0.0.1:$Port ..."
  $ok = $false
  for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
    Start-Sleep -Seconds 1
    try { $ok = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2).ok -eq $true } catch { }
  }
  if ($ok) { Write-Host "    up. Local address: http://localhost:$Port/   Public origin: $PublicOrigin" -ForegroundColor Green }
  else { Write-Warning "The server didn't answer within 30 s. Look at $DataDir\logs\server.log (or run .\status.ps1)." }
}
