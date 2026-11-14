<#
.SYNOPSIS
  Stops and removes the Meal Planner scheduled task. Your data folder (database, backups, logs) is NOT deleted.
  With -RemoveServe it also removes the Tailscale Serve mapping for its HTTPS port.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$TaskName = 'MealPlannerServer',
  [int]$Port = 8791,
  [int]$HttpsPort = 8447,
  [switch]$RemoveServe
)
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) { Write-Host "No task named '$TaskName' - nothing to remove." }
elseif ($PSCmdlet.ShouldProcess($TaskName, 'Stop and unregister')) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed '$TaskName'. Your data folder was left exactly as it was."
  # The server notices its wrapper is gone and exits within a few seconds; say so if it somehow doesn't.
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  for ($i = 0; $listener -and $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if ($listener) { Write-Warning "Something is still listening on port $Port (process $($listener.OwningProcess)). Stop it manually if it is Meal Planner." }
  else { Write-Host "Port $Port is free." }
}
if ($RemoveServe) {
  if ($PSCmdlet.ShouldProcess("tailscale serve :$HttpsPort", 'Remove the mapping')) {
    & tailscale serve --https=$HttpsPort off
    if ($LASTEXITCODE -ne 0) { Write-Warning "tailscale serve --https=$HttpsPort off returned $LASTEXITCODE. Check 'tailscale serve status'." }
  }
} else {
  Write-Host "The Tailscale mapping on :$HttpsPort was left alone. To remove it too: tailscale serve --https=$HttpsPort off   (or re-run with -RemoveServe)."
}
