"""
共用模块:env 加载 + HTTP 客户端 + 日志。
heartbeat.py / executor.py 都从这里 import。
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

# 1. 加载 .env(脚本同目录优先)
_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")

try:
    BASE = os.environ["CRAWLER_BASE_URL"].rstrip("/")
    TOKEN = os.environ["CRAWLER_TOKEN"]
except KeyError as ex:
    print(f"[fatal] 缺少 env: {ex}", file=sys.stderr)
    sys.exit(2)

WORK_ROOT = Path(os.environ.get("CRAWLER_WORK_ROOT", _HERE / "workspaces")).resolve()
WORK_ROOT.mkdir(parents=True, exist_ok=True)

LOG_DIR = Path(os.environ.get("CRAWLER_LOG_DIR", _HERE / "logs")).resolve()
LOG_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# 公用 session:连接复用 + 默认超时由调用方传
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def make_logger(name: str) -> logging.Logger:
    """两路日志:控制台 + 文件(logs/<name>.log)。
    任务计划"无人登录"模式下控制台输出会丢,文件那路保兜底。
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    fh = logging.FileHandler(LOG_DIR / f"{name}.log", encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger
