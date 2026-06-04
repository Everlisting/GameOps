@echo off
REM 由 Windows 任务计划程序在"系统启动时"触发一次,常驻进程。
REM 进程异常退出 -> 任务计划的"如果失败则重启"会自动拉回来。

setlocal
cd /d "%~dp0"

REM 如果用了 venv 取消下一行注释
REM call .venv\Scripts\activate.bat

python executor.py
exit /b %ERRORLEVEL%
