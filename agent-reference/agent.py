"""
GameOps Crawler Agent 单入口。

一个常驻进程内保持两个互不阻塞的职责:
  - 主线程:executor claim / sync / run / upload
  - 后台线程:每 60 秒 heartbeat,上报版本与基础环境诊断

Windows 任务计划程序只需守护这一个入口。
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
import threading
import time

import requests

from common import AGENT_VERSION, BASE, HEADERS, make_logger
from executor import BUSY_EVENT, main as executor_main

HEARTBEAT_INTERVAL_SEC = 60

log = make_logger("agent")


def _command_version(command: str, *args: str) -> str:
    executable = shutil.which(command)
    if executable is None:
        return "未安装"
    try:
        completed = subprocess.run(
            [executable, *args],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        output = (completed.stdout or completed.stderr).strip().splitlines()
        return output[0][:120] if output else f"exit={completed.returncode}"
    except Exception as ex:
        return f"检查失败:{type(ex).__name__}"


def collect_diagnostics() -> dict[str, str | bool]:
    return {
        "platform": platform.platform(),
        "pythonExecutable": sys.executable,
        "gitAvailable": shutil.which("git") is not None,
    }


def send_heartbeat_once() -> dict:
    python_version = platform.python_version()
    git_version = _command_version("git", "--version")
    payload = {
        "agentStatus": "busy" if BUSY_EVENT.is_set() else "idle",
        "version": AGENT_VERSION,
        "hostname": platform.node() or "unknown",
        "pythonVersion": python_version,
        "gitVersion": git_version,
        "diagnostics": collect_diagnostics(),
    }
    with requests.Session() as session:
        session.headers.update(HEADERS)
        response = session.post(
            f"{BASE}/api/agent/heartbeat",
            json=payload,
            timeout=10,
        )
        response.raise_for_status()
        return response.json()


def heartbeat_loop() -> None:
    while True:
        try:
            result = send_heartbeat_once()
            log.info(
                "heartbeat ok status=%s pending=%s",
                "busy" if BUSY_EVENT.is_set() else "idle",
                result.get("pending"),
            )
        except Exception as ex:
            log.error("heartbeat failed: %s: %s", type(ex).__name__, ex)
        time.sleep(HEARTBEAT_INTERVAL_SEC)


def main() -> None:
    log.info("agent started version=%s base=%s", AGENT_VERSION, BASE)
    heartbeat_thread = threading.Thread(
        target=heartbeat_loop,
        name="gameops-heartbeat",
        daemon=True,
    )
    heartbeat_thread.start()
    executor_main()


if __name__ == "__main__":
    main()
