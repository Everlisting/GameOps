"""
heartbeat.py — 一次性心跳上报,执行完就退出。

由 Windows 任务计划程序每 1 分钟触发一次。
中台 10 分钟无心跳判离线,1 分钟间隔 = 10 倍安全余量。

不做任何任务领取 / 命令执行 —— 那是 executor.py 的活。
"""

from __future__ import annotations

import sys

from common import BASE, SESSION, make_logger

log = make_logger("heartbeat")


def main() -> int:
    try:
        r = SESSION.post(
            f"{BASE}/api/agent/heartbeat",
            json={"agentStatus": "idle", "version": "0.2.0"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        log.info(
            "ok pending=%s suggestPollMs=%s",
            data.get("pending"),
            data.get("suggestPollMs"),
        )
        return 0
    except Exception as ex:
        log.error("heartbeat failed: %s: %s", type(ex).__name__, ex)
        return 1


if __name__ == "__main__":
    sys.exit(main())
