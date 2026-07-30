[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https?://')]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[^.]+\..+$')]
    [string]$Token,

    [string]$WorkRoot = "",
    [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"
$TaskName = "GameOps Crawler Agent"
$AgentDir = $PSScriptRoot
$VenvDir = Join-Path $AgentDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Administrator privileges are required. Reopen PowerShell as Administrator and retry."
    }
}

function Resolve-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "$Name was not found. Install it and make sure it is available in PATH."
    }
    return $command.Source
}

function Resolve-PythonPath {
    $launcher = Get-Command "py.exe" -ErrorAction SilentlyContinue
    if ($null -ne $launcher) {
        $output = @(& $launcher.Source -3 -c "import sys; print(sys.executable)" 2>$null)
        if ($LASTEXITCODE -eq 0 -and $output.Count -gt 0) {
            $candidate = ([string]$output[0]).Trim()
            if ($candidate -and (Test-Path -LiteralPath $candidate)) {
                return $candidate
            }
        }
    }

    return Resolve-CommandPath "python"
}

function Get-PythonVersion([string]$PythonPath) {
    $output = @(& $PythonPath -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -eq 0) {
        throw "Unable to run Python at: $PythonPath"
    }

    $versionText = ([string]$output[0]).Trim()
    if (-not $versionText) {
        throw "Python returned an empty version at: $PythonPath"
    }

    try {
        return [version]$versionText
    } catch {
        throw "Unable to parse Python version '$versionText' from: $PythonPath"
    }
}

function Confirm-VirtualEnvironmentReset {
    if (-not (Test-Path -LiteralPath $VenvDir)) {
        return $false
    }
    if (-not (Test-Path -LiteralPath $VenvDir -PathType Container)) {
        throw "The reserved virtual environment path is not a directory: $VenvDir"
    }

    # Keep the source file ASCII-only while showing the requested Chinese prompt.
    $promptBase64 = "5qOA5rWL5Yiw5b2T5YmN6Jma5ouf546v5aKD5bey57uP5Yib5bu677yM57un57ut6L+b6KGM5bCG5Yig6Zmk546w5pyJ6Jma5ouf546v5aKD77yM5piv5ZCm57un57ut77yfW3kvTl0="
    $promptText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($promptBase64))
    $answer = (Read-Host $promptText).Trim()
    if ($answer -notmatch "^(?i:y|yes)$") {
        Write-Host "Installation canceled. The existing virtual environment was not changed."
        exit 0
    }

    return $true
}

function Remove-VirtualEnvironment {
    $expectedVenvDir = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetFullPath($AgentDir)) ".venv"))
    $resolvedVenvDir = [IO.Path]::GetFullPath($VenvDir)
    if (
        -not [string]::Equals(
            $resolvedVenvDir,
            $expectedVenvDir,
            [StringComparison]::OrdinalIgnoreCase
        )
    ) {
        throw "Refusing to remove an unexpected virtual environment path: $resolvedVenvDir"
    }

    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $existingTask) {
        Write-Host "Stopping the existing Agent task..."
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            $state = (Get-ScheduledTask -TaskName $TaskName).State
            if ($state -ne "Running") {
                break
            }
            Start-Sleep -Milliseconds 250
        }
        if ((Get-ScheduledTask -TaskName $TaskName).State -eq "Running") {
            throw "The existing Agent task did not stop. The virtual environment was not removed."
        }
    }

    Write-Host "Removing the existing virtual environment: $resolvedVenvDir"
    Remove-Item -LiteralPath $resolvedVenvDir -Recurse -Force
    if (Test-Path -LiteralPath $resolvedVenvDir) {
        throw "Failed to remove the existing virtual environment: $resolvedVenvDir"
    }
}

Assert-Administrator
$RecreateVenv = Confirm-VirtualEnvironmentReset
$Python = Resolve-PythonPath
$null = Resolve-CommandPath "git"

$PythonVersion = Get-PythonVersion $Python
if ($PythonVersion -lt [version]"3.10") {
    throw "Python $PythonVersion is too old. Python 3.10 or newer is required."
}
Write-Host "Using Python $PythonVersion at $Python"

if ($RecreateVenv) {
    Remove-VirtualEnvironment
}

Write-Host "[1/5] Creating the Agent virtual environment..."
& $Python -m venv $VenvDir
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $VenvPython)) {
    throw "Failed to create the virtual environment at: $VenvDir"
}

Write-Host "[2/5] Installing Agent dependencies..."
& $VenvPython -m pip install --disable-pip-version-check -r (Join-Path $AgentDir "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Agent dependencies."
}

Write-Host "[3/5] Writing local configuration..."
$SafeBaseUrl = $BaseUrl.TrimEnd("/")
$EnvLines = @(
    "CRAWLER_BASE_URL=$SafeBaseUrl"
    "CRAWLER_TOKEN=$Token"
)
if ($WorkRoot) {
    $EnvLines += "CRAWLER_WORK_ROOT=$WorkRoot"
}
if ($LogDir) {
    $EnvLines += "CRAWLER_LOG_DIR=$LogDir"
}
$EnvPath = Join-Path $AgentDir ".env"
$Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($EnvPath, $EnvLines, $Utf8WithoutBom)

Write-Host "[4/5] Verifying the GameOps connection..."
& $VenvPython (Join-Path $AgentDir "heartbeat.py")
if ($LASTEXITCODE -ne 0) {
    throw "Heartbeat verification failed. Check BaseUrl, Token, firewall, and proxy settings, then retry."
}

Write-Host "[5/5] Registering the background Agent task..."
$CurrentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$Action = New-ScheduledTaskAction `
    -Execute $VenvPython `
    -Argument "`"$AgentDir\agent.py`"" `
    -WorkingDirectory $AgentDir
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal `
    -UserId $CurrentUser `
    -LogonType S4U `
    -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Description "GameOps crawler Agent (heartbeat and executor)" `
    -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installation completed. Scheduled task: $TaskName"
Write-Host "Run .\status.cmd to inspect it. GameOps should show Agent details within one minute."
