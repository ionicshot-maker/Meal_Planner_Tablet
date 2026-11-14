<#
.SYNOPSIS  One-screen health check: task state, port, health endpoint, newest backup, Tailscale mapping, recent log lines. Read-only.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'MealPlannerServer',
  [string]$DataDir = 'C:\MealPlanner\data',
  [int]$Port = 8791,
  [int]$HttpsPort = 8447
)
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  "Task        : $($task.State)   last run $($info.LastRunTime)   last result $($info.LastTaskResult)"
} else { "Task        : '$TaskName' is not installed" }

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
"Port $Port  : " + $(if ($listen) { "listening on $($listen.LocalAddress)" } else { 'not listening' })
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
  "Health      : ok=$($h.ok)  revision=$($h.rev)  needsFirstAccount=$($h.needsSetup)"
} catch { "Health      : no answer ($($_.Exception.Message))" }

$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) {
  $serve = (& tailscale serve status 2>&1 | Out-String)
  $line = ($serve -split "`n" | Where-Object { $_ -match ":$HttpsPort\b" } | Select-Object -First 1)
  "Tailscale   : " + $(if ($line) { $line.Trim() } else { "nothing mapped on :$HttpsPort" })
}

$bk = Get-ChildItem (Join-Path $DataDir 'backups') -Filter '*.sqlite' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
"Newest backup: " + $(if ($bk) { "$($bk.Name)  ($([int]($bk.Length / 1KB)) KB, $($bk.LastWriteTime))" } else { 'none yet' })
$log = Join-Path $DataDir 'logs\server.log'
if (Test-Path $log) { ''; '--- last log lines ---'; Get-Content $log -Tail 12 }
