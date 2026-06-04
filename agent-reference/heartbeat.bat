@echo off
REM 由 Windows 任务计划程序触发,跑一次 heartbeat.py 就退出。
REM 任务计划的"开始于"建议设成本文件所在目录。

setlocal
cd /d "%~dp0"

REM 如果用了 venv 取消下一行注释
REM call .venv\Scripts\activate.bat

python heartbeat.py
exit /b %ERRORLEVEL%
