[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$TaskName = "GameOps Crawler Agent"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($null -eq $Task) {
    Write-Host "Not installed: $TaskName"
    exit 1
}

$Info = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
    TaskName = $TaskName
    State = $Task.State
    LastRunTime = $Info.LastRunTime
    LastTaskResult = $Info.LastTaskResult
    NextRunTime = $Info.NextRunTime
} | Format-List

$LogPath = Join-Path $PSScriptRoot "logs\agent.log"
if (Test-Path -LiteralPath $LogPath) {
    Write-Host "Latest Agent log:"
    Get-Content -LiteralPath $LogPath -Tail 20
}
