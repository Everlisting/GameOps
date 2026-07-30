"""一次性心跳 smoke test。常驻心跳由 agent.py 的后台线程负责。"""

from __future__ import annotations

import sys

from agent import send_heartbeat_once
from common import make_logger

log = make_logger("heartbeat")


def main() -> int:
    try:
        data = send_heartbeat_once()
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
