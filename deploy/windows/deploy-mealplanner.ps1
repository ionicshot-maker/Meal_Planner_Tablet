<#
.SYNOPSIS
  First-time install of the Meal Planner household server on this mini PC: build, install the boot-time service, and expose it
  on the tailnet (Tailscale Serve, tailnet-only -- never Funnel).

.DESCRIPTION
  Run from an ELEVATED PowerShell (Run as administrator). Run it ONCE. To update an existing install use redeploy.ps1.

  Before it changes anything it runs a read-only PREFLIGHT and refuses to go on if anything is off: the local port or the Tailscale
  HTTPS port is already in use, the service or a database already exists, Node is too old, Tailscale is not running, and so on.
  Use -PreflightOnly to run just that check (it needs no elevation and changes nothing). Use -WhatIf to see the plan without doing it.

  Defaults: local port 8791 (127.0.0.1 only), Tailscale HTTPS port 8447, task 'MealPlannerServer', files in C:\MealPlanner.
  None of these touch Bill Planner's instances (8787-8790 / 8443-8445), the old app on 8446, or C:\Services\MealPlanner.

.EXAMPLE
  .\deploy-mealplanner.ps1 -PreflightOnly
.EXAMPLE
  .\deploy-mealplanner.ps1
.EXAMPLE
  .\deploy-mealplanner.ps1 -NasBackupPath '\\?\UNC\truenas.local\Bill Planner Backup\MealPlanner-New'
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$TailnetHost = 'angelo-server.tail1d14cc.ts.net',
  [int]$Port = 8791,
  [int]$HttpsPort = 8447,
  [string]$TaskName = 'MealPlannerServer',
  [string]$ReleaseDir = 'C:\MealPlanner\release',
  [string]$DataDir = 'C:\MealPlanner\data',
  # Optional second copy of every nightly backup. Use a UNC path, not a mapped drive letter: the task runs as SYSTEM, which does not
  # see mapped drives. Left off unless you give one.
  [string]$NasBackupPath = '',
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
$deployDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$publicOrigin = "https://${TailnetHost}:$HttpsPort"

function Get-ServeStatus {
  if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { return $null }
  return (& tailscale serve status 2>&1 | Out-String)
}

# Returns @{ Problems = [...]; Notes = [...] }. Read-only.
function Test-Preflight {
  $problems = New-Object System.Collections.Generic.List[string]
  $notes = New-Object System.Collections.Generic.List[string]

  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin -and -not $PreflightOnly -and -not $WhatIfPreference) { $problems.Add('Not running as Administrator. Open PowerShell with "Run as administrator".') }

  try {
    $nodeVer = (& node --version).TrimStart('v')
    if ([int]($nodeVer.Split('.')[0]) -lt 24) { $problems.Add("Node 24 or newer is required (found $nodeVer): the server uses the built-in node:sqlite.") }
    else { $notes.Add("Node $nodeVer") }
  } catch { $problems.Add('Node is not installed or not on PATH.') }

  $listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listen) {
    $who = (Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    $problems.Add("Local port $Port is already in use (process '$who', PID $($listen.OwningProcess)). Pick a free one with -Port.")
  } else { $notes.Add("Local port $Port is free") }

  $serve = Get-ServeStatus
  if ($null -eq $serve) { $problems.Add('Tailscale is not installed (no tailscale command).') }
  else {
    if ($serve -match 'not running|stopped|NoState|Logged out') { $problems.Add("Tailscale does not look like it is running: $($serve.Trim())") }
    if ($serve -match ":$HttpsPort\b") { $problems.Add("Tailscale Serve already has something on HTTPS port $HttpsPort. Pick a free one with -HttpsPort (see 'tailscale serve status').") }
    else { $notes.Add("Tailscale HTTPS port $HttpsPort is free") }
  }

  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { $problems.Add("A scheduled task named '$TaskName' already exists. This script is for the first install; use redeploy.ps1 to update it.") }
  else { $notes.Add("No task named '$TaskName' yet") }
  if (Test-Path (Join-Path $DataDir 'meal-planner.sqlite')) { $problems.Add("A database already exists at $DataDir. Not going to install over it; use redeploy.ps1 (or pick another -DataDir).") }
  if ($DataDir -match 'OneDrive|Dropbox|Google Drive') { $problems.Add("DataDir ($DataDir) is inside a sync folder. SQLite and file-sync services corrupt each other.") }
  if ($NasBackupPath -and $NasBackupPath -match '^[A-Za-z]:\\') { $problems.Add("NasBackupPath '$NasBackupPath' is a drive letter. The service runs as SYSTEM, which cannot see mapped drives; use a UNC path (\\server\share\...).") }

  try {
    Push-Location $repoRoot
    $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    $dirty = (& git status --porcelain 2>$null | Measure-Object).Count
    $notes.Add("Code: branch '$branch', $(if ($dirty) { "$dirty UNCOMMITTED change(s)" } else { 'clean working tree' })")
    if ($dirty) { $notes.Add('WARNING: this will deploy what is on disk, including uncommitted changes.') }
  } catch { } finally { Pop-Location }

  return @{ Problems = $problems; Notes = $notes }
}

Step 'Preflight (read-only)'
$pre = Test-Preflight
foreach ($n in $pre.Notes) { Write-Host "    ok   $n" }
foreach ($p in $pre.Problems) { Write-Host "    STOP $p" -ForegroundColor Red }
if ($pre.Problems.Count -gt 0) {
  if ($PreflightOnly) { exit 1 }
  throw "Preflight found $($pre.Problems.Count) problem(s). Nothing was changed."
}
Write-Host "    Preflight passed: $publicOrigin -> 127.0.0.1:$Port, files in $ReleaseDir and $DataDir." -ForegroundColor Green
if ($PreflightOnly) { exit 0 }

if ($WhatIfPreference) {
  Write-Host ''
  Write-Host 'WhatIf: this would, in order:'
  Write-Host "  1. build the web app and server into $ReleaseDir"
  Write-Host "  2. create $DataDir (Administrators/SYSTEM only) and register the boot-time task '$TaskName' on 127.0.0.1:$Port"
  if ($NasBackupPath) { Write-Host "  3. add NAS_BACKUP_PATH=$NasBackupPath to the server settings" }
  Write-Host "  4. run: tailscale serve --bg --https=$HttpsPort http://127.0.0.1:$Port   (tailnet only; not Funnel)"
  return
}

Step "Building release -> $ReleaseDir"
& (Join-Path $deployDir 'build-release.ps1') -OutDir $ReleaseDir
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "build-release.ps1 failed ($LASTEXITCODE)" }

Step "Installing service '$TaskName' on port $Port (data: $DataDir)"
& (Join-Path $deployDir 'install-service.ps1') `
  -PublicOrigin $publicOrigin `
  -TrustProxy `
  -Port $Port `
  -ReleaseDir $ReleaseDir `
  -DataDir $DataDir `
  -TaskName $TaskName

if ($NasBackupPath) {
  Step "Adding the NAS backup copy -> $NasBackupPath"
  $envFile = Join-Path $DataDir 'server.env'
  if ((Test-Path $envFile) -and -not ((Get-Content $envFile) -match '^NAS_BACKUP_PATH=')) {
    New-Item -ItemType Directory -Force -Path $NasBackupPath -ErrorAction SilentlyContinue | Out-Null
    Add-Content -Path $envFile -Value "NAS_BACKUP_PATH=$NasBackupPath"
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $TaskName
    Write-Host '    added and restarted the task to pick it up'
  } else {
    Write-Warning "Could not add NAS_BACKUP_PATH automatically; add it to $envFile by hand and restart the task."
  }
}

Step "Exposing it on the tailnet: $publicOrigin -> 127.0.0.1:$Port (tailnet only)"
& tailscale serve --bg --https=$HttpsPort "http://127.0.0.1:$Port"
if ($LASTEXITCODE -ne 0) { throw "tailscale serve failed ($LASTEXITCODE). Run 'tailscale serve status' to check." }
# Belt and braces: this app must never be reachable from the public internet. Confirm the mapping says tailnet-only.
$line = ((Get-ServeStatus) -split "`n" | Where-Object { $_ -match ":$HttpsPort\b" } | Select-Object -First 1)
if ($line -match 'Funnel on') {
  & tailscale funnel --https=$HttpsPort off
  throw "Port $HttpsPort came up as a public Funnel. It was switched off again. Investigate before going on."
}
Write-Host "    $($line.Trim())"

try {
  $h = Invoke-RestMethod -Uri "$publicOrigin/api/health" -TimeoutSec 8
  Write-Host "    reachable at $publicOrigin  (ok=$($h.ok), needsFirstAccount=$($h.needsSetup))" -ForegroundColor Green
} catch { Write-Warning "Could not reach $publicOrigin from this machine just yet ($($_.Exception.Message)). Check .\status.ps1 and 'tailscale serve status'." }

Write-Host ''
Write-Host 'Done. Meal Planner household server:' -ForegroundColor Green
Write-Host "  Address  : $publicOrigin   (tailnet only; each device needs Tailscale)"
Write-Host "  Task     : $TaskName"
Write-Host "  Release  : $ReleaseDir"
Write-Host "  Data     : $DataDir"
Write-Host ''
Write-Host 'Next:'
Write-Host "  1. Open $publicOrigin, go to Settings > Data, and create the owner account (michael). It only offers this once."
Write-Host '  2. Add everyone else in the People panel (for example rachel as a contributor).'
Write-Host '  3. Move the household data in: see deploy\README.md, "Moving the data over".'
Write-Host ''
Write-Host "Check it:   .\status.ps1"
Write-Host "Update it:  .\redeploy.ps1"
Write-Host "Remove it:  .\uninstall-service.ps1 -RemoveServe"
Write-Host ''
Write-Host 'NOTE: who on the tailnet can reach this address is controlled by the Access controls policy in the Tailscale admin console, not by this script.' -ForegroundColor Yellow
Write-Host "Make sure the household's devices have a grant for tcp:$HttpsPort and that nobody else's broader rule covers it unintentionally."
