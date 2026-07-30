[CmdletBinding()]
param(
    [switch]$RemoveConfig
)

$ErrorActionPreference = "Stop"
$TaskName = "GameOps Crawler Agent"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($null -ne $Task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task: $TaskName"
} else {
    Write-Host "Scheduled task not found. Nothing to remove."
}

if ($RemoveConfig) {
    $EnvPath = Join-Path $PSScriptRoot ".env"
    if (Test-Path -LiteralPath $EnvPath) {
        Remove-Item -LiteralPath $EnvPath -Force
        Write-Host "Removed .env. Workspaces and logs were preserved."
    }
}
