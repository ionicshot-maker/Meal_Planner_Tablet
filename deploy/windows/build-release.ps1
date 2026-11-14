<#
.SYNOPSIS
  Builds a self-contained Meal Planner release folder (server + web app) that runs anywhere, with no dependency on the source
  checkout or OneDrive.

.DESCRIPTION
  Result:  <OutDir>\server\   compiled server + production-only node_modules
           <OutDir>\web\      the built web app (served by the server from the same origin)
           <OutDir>\run-server.ps1   the service wrapper (restart loop + log rotation)

  Run it again to update; the service picks the new version up on its next restart (use redeploy.ps1, which stops the service
  first). The previous release is kept next to it as <OutDir>.previous for a quick rollback.
  Needs Node 24+ and npm on PATH.
#>
[CmdletBinding()]
param(
  [string]$OutDir = 'C:\MealPlanner\release',
  # Reinstall dependencies from the lockfiles first. Without it, existing node_modules are reused, so a running `npm run dev`
  # is not disturbed.
  [switch]$CleanInstall
)
$ErrorActionPreference = 'Stop'
$root   = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$srcApp = $root
$srcSrv = Join-Path $root 'meal-planner-server'

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Run($dir, $cmd) {
  Push-Location $dir
  # "2>&1" inside cmd: Windows PowerShell 5.1 turns native stderr lines (npm/vite warnings) into terminating errors otherwise.
  try { & cmd.exe /c "$cmd 2>&1"; if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $cmd" } } finally { Pop-Location }
}

$nodeVer = (& node --version).TrimStart('v')
if ([int]($nodeVer.Split('.')[0]) -lt 24) { throw "Node 24 or newer is required (found $nodeVer): the server uses the built-in node:sqlite." }

function EnsureDeps($dir) {
  if ($CleanInstall -or -not (Test-Path (Join-Path $dir 'node_modules'))) { Run $dir 'npm ci --no-audit --no-fund' }
}

Step 'Building the web app'
EnsureDeps $srcApp
Run $srcApp 'npm run build'

Step 'Building the server'
EnsureDeps $srcSrv
Run $srcSrv 'npm run build'

Step "Staging the release in $OutDir"
$stage = "$OutDir.staging"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$stage\server", "$stage\web" | Out-Null
Copy-Item (Join-Path $srcSrv 'dist') "$stage\server\dist" -Recurse
Copy-Item (Join-Path $srcSrv 'package.json'), (Join-Path $srcSrv 'package-lock.json') "$stage\server\"
Copy-Item (Join-Path $srcApp 'dist\*') "$stage\web\" -Recurse
Copy-Item (Join-Path $PSScriptRoot 'run-server.ps1') "$stage\run-server.ps1"
Run "$stage\server" 'npm ci --omit=dev --no-audit --no-fund'

if (-not (Test-Path "$stage\web\index.html")) { throw 'Staging failed: web\index.html is missing.' }
if (-not (Test-Path "$stage\server\dist\index.js")) { throw 'Staging failed: server\dist\index.js is missing.' }
# The app is an installable PWA, so a service worker is expected here (unlike Bill Planner). The server sends it with no-cache.
if (-not (Test-Path "$stage\web\sw.js")) { throw 'Staging failed: web\sw.js is missing (the installable app needs it).' }
# The production folder must not carry test tooling or any local data.
if (Test-Path "$stage\server\node_modules\fake-indexeddb") { throw 'Staging failed: dev dependencies leaked into the release.' }
if (Test-Path "$stage\server\data") { throw 'Staging failed: a data folder leaked into the release.' }

# Swap in: keep the previous release next to it for a quick rollback.
$prev = "$OutDir.previous"
if (Test-Path $OutDir) {
  if (Test-Path $prev) { Remove-Item $prev -Recurse -Force }
  Move-Item $OutDir $prev
}
Move-Item $stage $OutDir
Step "Done. Release is at $OutDir  (previous one, if any, at $prev)"
