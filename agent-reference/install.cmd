@echo off
setlocal

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo Windows PowerShell was not found.
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "GameOpsExitCode=%ERRORLEVEL%"
endlocal & exit /b %GameOpsExitCode%
