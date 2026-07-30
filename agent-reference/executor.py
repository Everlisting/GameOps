"""
executor.py — 任务执行器,常驻进程。

由 agent.py 在主线程启动,内部循环:
  claim → sync_repo → render command → run + tee log → upload result
心跳由 agent.py 的独立后台线程负责,长任务不会阻塞心跳。
"""

from __future__ import annotations

import json
import hashlib
import locale
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from common import AGENT_VERSION, BASE, SESSION, WORK_ROOT, make_logger
from repo_workspace import (
    extract_repo_name,
    is_path_within,
    normalize_repo_url,
    shared_repo_dir,
)

log = make_logger("executor")

VAR_RE = re.compile(r"\{\{\s*([^\W\d][\w]*)\s*\}\}", re.UNICODE)

# 空闲时轮询节奏。心跳已被独立进程接管,这里只关心 claim。
IDLE_POLL_SEC = 10
ERROR_BACKOFF_SEC = 10
# 跑命令时多久 ping 一次 /log 探活,看任务是否被中台取消
CANCEL_POLL_SEC = 5
BUSY_EVENT = threading.Event()


class TaskCanceledError(RuntimeError):
    """中台已把任务移出 RUNNING(通常是被管理员取消),executor 立刻放弃。"""
    pass

# Git over SSH 默认严格校验 host key,任务计划无人值守模式下会直接挂。
#   StrictHostKeyChecking=accept-new:首次见到的主机自动写入 known_hosts,之后还是严格校验(安全)
#   BatchMode=yes:认证失败立即报错,不会停下来交互式问密码(避免卡死)
os.environ.setdefault(
    "GIT_SSH_COMMAND",
    "ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes",
)

# 中文 Windows 默认 CP936;系统 locale 用来给非 Python 子进程(taskkill / cmd 等)兜底解码
SYSTEM_ENCODING = locale.getpreferredencoding(False) or "utf-8"

# ANSI 转义码(loguru / rich / colorama 等输出的终端颜色控制字符)
# 网页日志页里这些字符渲染不出颜色,只会以 [32m / [1m / [0m 之类的明文出现,直接剥掉
ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07")


def decode_subprocess_line(line: bytes) -> str:
    """子进程输出可能混着 UTF-8 (Python+loguru) 和 GBK (taskkill/cmd) 两种字节流。
    先按 UTF-8 试,失败再用系统 locale,再失败用 replace 兜底。
    逐行处理保证不会切碎 UTF-8 多字节序列(readline 按 \\n 切,UTF-8 字符不跨行)。
    最后剥掉 ANSI 转义码,网页日志页才能干净显示。
    """
    try:
        text = line.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = line.decode(SYSTEM_ENCODING)
        except (UnicodeDecodeError, LookupError):
            text = line.decode("utf-8", errors="replace")
    return ANSI_ESCAPE_RE.sub("", text)


# ── 远程调用 ───────────────────────────────────────

def claim() -> dict | None:
    r = SESSION.post(f"{BASE}/api/agent/tasks/claim", json={}, timeout=10)
    r.raise_for_status()
    return r.json().get("task")


def push_log(task_id: str, chunk: bytes) -> bool:
    """推一段日志。返回 True 表示中台 200(任务仍在 RUNNING);
    返回 False 表示 4xx(409/404 等 —— 任务已被取消/不存在,executor 应放弃)。
    网络瞬错只 warn,返回 True 以免误判取消。
    """
    try:
        r = SESSION.post(
            f"{BASE}/api/agent/tasks/{task_id}/log",
            headers={"Content-Type": "text/plain; charset=utf-8"},
            data=chunk,
            timeout=10,
        )
    except Exception as ex:
        log.warning("push_log failed: %s", ex)
        return True
    if 200 <= r.status_code < 300:
        return True
    if r.status_code in (404, 409):
        return False
    log.warning("push_log unexpected status=%s", r.status_code)
    return True


def upload_success(
    task_id: str,
    exit_code: int,
    files: list[tuple[str | None, Path]],
) -> None:
    """files: [(csvType_or_None, abs_path), ...]
    csv_type=None 表示"未分类,仅留底"。服务端按 null 收。"""
    multipart: list = []
    csv_types: list[str | None] = []
    handles: list = []
    try:
        for csv_type, path in files:
            f = open(path, "rb")
            handles.append(f)
            multipart.append(("files", (path.name, f, "text/csv")))
            csv_types.append(csv_type)
        data = {
            "status": "success",
            "exitCode": str(exit_code),
            "csvTypes": json.dumps(csv_types),
        }
        r = SESSION.post(
            f"{BASE}/api/agent/tasks/{task_id}/result",
            data=data,
            files=multipart,
            timeout=300,
        )
        r.raise_for_status()
        log.info("result(success) %s", r.json())
    finally:
        for f in handles:
            f.close()


def upload_failure(task_id: str, exit_code: int | None, message: str) -> None:
    data = {"status": "failure", "errorMessage": message[:1800]}
    if exit_code is not None:
        data["exitCode"] = str(exit_code)
    try:
        r = SESSION.post(
            f"{BASE}/api/agent/tasks/{task_id}/result",
            data=data,
            timeout=30,
        )
        r.raise_for_status()
        log.info("result(failure) uploaded")
    except Exception as ex:
        log.exception("upload_failure failed: %s", ex)


def _command_version(command: str, *args: str) -> str:
    executable = shutil.which(command)
    if executable is None:
        return "未安装"
    completed = subprocess.run(
        [executable, *args],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    lines = (completed.stdout or completed.stderr).strip().splitlines()
    return lines[0][:120] if lines else f"exit={completed.returncode}"


def _python_executable(argv: list[str]) -> str:
    if argv:
        resolved = shutil.which(argv[0])
        if resolved and Path(argv[0]).name.lower() in {
            "python",
            "python.exe",
            "python3",
            "python3.exe",
            "py",
            "py.exe",
        }:
            return resolved
    return sys.executable


def _python_version(python_executable: str) -> str:
    completed = subprocess.run(
        [
            python_executable,
            "-c",
            "import platform; print(platform.python_version())",
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    version = completed.stdout.strip()
    return version[:128] if completed.returncode == 0 and version else "unknown"


def _python_dependencies(python_executable: str) -> list[str]:
    completed = subprocess.run(
        [
            python_executable,
            "-m",
            "pip",
            "--disable-pip-version-check",
            "freeze",
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        log.warning("pip freeze failed exit=%s", completed.returncode)
        return []
    return sorted(
        line.strip()[:500]
        for line in completed.stdout.splitlines()
        if line.strip()
    )[:1000]


def build_execution_snapshot(argv: list[str]) -> dict:
    python_executable = _python_executable(argv)
    dependencies = _python_dependencies(python_executable)
    dependency_text = "\n".join(dependencies).encode("utf-8")
    command_text = json.dumps(
        argv,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "schemaVersion": 1,
        "capturedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "agentVersion": AGENT_VERSION,
        "hostname": platform.node() or "unknown",
        "platform": platform.platform(),
        "pythonVersion": _python_version(python_executable),
        "pythonExecutable": python_executable,
        "gitVersion": _command_version("git", "--version"),
        "dependencyFingerprint": hashlib.sha256(dependency_text).hexdigest(),
        "dependencies": dependencies,
        # 不上传渲染后的命令明文,避免参数值中的密钥再次扩散;hash 足够用于核对。
        "commandHash": hashlib.sha256(command_text).hexdigest(),
    }


def prepare_execution(
    task_id: str,
    source_revision: str,
    execution_snapshot: dict,
) -> None:
    response = SESSION.post(
        f"{BASE}/api/agent/tasks/{task_id}/prepare",
        json={
            "sourceRevision": source_revision,
            "executionSnapshot": execution_snapshot,
        },
        timeout=30,
    )
    if response.status_code == 404:
        raise TaskCanceledError(
            f"task prepare rejected by server (HTTP {response.status_code})"
        )
    if response.status_code >= 400:
        try:
            error = response.json().get("error") or {}
            detail = json.dumps(error, ensure_ascii=False)
        except Exception:
            detail = response.text[:1000]
        if response.status_code == 409 and (
            "状态不可" in detail or "不属于当前 agent" in detail
        ):
            raise TaskCanceledError(
                f"task prepare rejected by server (HTTP 409): {detail}"
            )
        raise RuntimeError(
            f"task prepare rejected by server "
            f"(HTTP {response.status_code}): {detail}"
        )


# ── 仓库同步 ────────────────────────────────────────

def _git_origin_url(repo_dir: Path) -> str | None:
    res = subprocess.run(
        ["git", "config", "--get", "remote.origin.url"],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        return None
    value = res.stdout.strip()
    return value or None


def _migrate_legacy_job_repo(job: dict, repo_dir: Path) -> bool:
    """Move this Job's old checkout into the shared cache when safe.

    The old outer job-<id> directory is intentionally left in place. Other
    legacy Job checkouts are never deleted automatically.
    """
    if repo_dir.exists():
        return False

    repo_name = extract_repo_name(job["repoUrl"])
    legacy_repo_dir = WORK_ROOT / f"job-{job['id']}" / repo_name
    if not legacy_repo_dir.exists():
        return False

    if job["repoType"] == "GIT":
        if not (legacy_repo_dir / ".git").exists():
            return False
        origin = _git_origin_url(legacy_repo_dir)
        if origin is None or normalize_repo_url(origin) != normalize_repo_url(job["repoUrl"]):
            return False
    elif job["repoType"] == "SVN":
        if not (legacy_repo_dir / ".svn").exists():
            return False
    else:
        return False

    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(legacy_repo_dir), str(repo_dir))
    log.info("migrated legacy repo workspace %s -> %s", legacy_repo_dir, repo_dir)
    return True


def _checkout_git_branch(repo_dir: Path, branch: str | None) -> None:
    if branch:
        remote_ref = f"origin/{branch}"
        _run_check(["git", "checkout", "-B", branch, remote_ref], cwd=str(repo_dir))
        _run_check(["git", "reset", "--hard", remote_ref], cwd=str(repo_dir))
        return

    # An empty Job branch means the remote default branch, not whichever
    # branch a previous Job happened to leave checked out.
    default_ref = subprocess.run(
        ["git", "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
    )
    if default_ref.returncode == 0 and default_ref.stdout.strip().startswith("origin/"):
        remote_ref = default_ref.stdout.strip()
        default_branch = remote_ref.removeprefix("origin/")
        _run_check(
            ["git", "checkout", "-B", default_branch, remote_ref],
            cwd=str(repo_dir),
        )
        _run_check(["git", "reset", "--hard", remote_ref], cwd=str(repo_dir))
        return

    _run_check(["git", "pull", "--ff-only"], cwd=str(repo_dir))


def _checkout_git_revision(repo_dir: Path, revision: str) -> None:
    _run_check(
        ["git", "cat-file", "-e", f"{revision}^{{commit}}"],
        cwd=str(repo_dir),
    )
    _run_check(["git", "checkout", "--detach", revision], cwd=str(repo_dir))
    _run_check(["git", "reset", "--hard", revision], cwd=str(repo_dir))


def _git_revision(repo_dir: Path) -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
        check=False,
    )
    revision = completed.stdout.strip()
    if completed.returncode != 0 or not re.fullmatch(r"[a-fA-F0-9]{40,64}", revision):
        raise RuntimeError("无法解析 Git HEAD revision")
    return revision.lower()


def _svn_revision(repo_dir: Path) -> str:
    completed = subprocess.run(
        ["svn", "info", "--show-item", "revision"],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
        check=False,
    )
    revision = completed.stdout.strip()
    if completed.returncode != 0 or not revision.isdigit():
        raise RuntimeError("无法解析 SVN revision")
    return revision


def sync_repo(
    job: dict,
    repo_dir: Path,
    source_revision: str | None = None,
) -> tuple[str, str]:
    repo_type = job["repoType"]
    url = job["repoUrl"]
    branch = job.get("repoBranch") or None
    migrated = _migrate_legacy_job_repo(job, repo_dir)

    if repo_type == "GIT":
        if not (repo_dir / ".git").exists():
            if repo_dir.exists():
                raise RuntimeError(f"共享仓库目录存在但不是 Git 工作副本: {repo_dir}")
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            cmd = ["git", "clone"]
            if branch and not source_revision:
                cmd += ["-b", branch]
            cmd += [url, str(repo_dir)]
            _run_check(cmd, cwd=str(repo_dir.parent))
            if source_revision:
                _checkout_git_revision(repo_dir, source_revision)
                return "cloned+pinned", _git_revision(repo_dir)
            return "cloned", _git_revision(repo_dir)
        else:
            origin = _git_origin_url(repo_dir)
            if origin is None:
                raise RuntimeError(f"共享 Git 工作副本缺少 remote.origin.url: {repo_dir}")
            if normalize_repo_url(origin) != normalize_repo_url(url):
                raise RuntimeError(
                    f"共享 Git 工作副本远端不匹配: expected={url}, actual={origin}"
                )
            _run_check(["git", "fetch", "--all", "--prune"], cwd=str(repo_dir))
            if source_revision:
                _checkout_git_revision(repo_dir, source_revision)
                action = "migrated+pinned" if migrated else "pinned"
            else:
                _checkout_git_branch(repo_dir, branch)
                action = "migrated+updated" if migrated else "updated"
            return action, _git_revision(repo_dir)
    elif repo_type == "SVN":
        if not repo_dir.exists():
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            cmd = ["svn", "checkout"]
            if source_revision:
                cmd += ["-r", source_revision]
            cmd += [url, str(repo_dir)]
            _run_check(cmd)
            return (
                "checked-out+pinned" if source_revision else "checked-out",
                _svn_revision(repo_dir),
            )
        else:
            if not (repo_dir / ".svn").exists():
                raise RuntimeError(f"共享仓库目录存在但不是 SVN 工作副本: {repo_dir}")
            cmd = ["svn", "update"]
            if source_revision:
                cmd += ["-r", source_revision]
            _run_check(cmd, cwd=str(repo_dir))
            action = "migrated+updated" if migrated else "updated"
            if source_revision:
                action = "migrated+pinned" if migrated else "pinned"
            return action, _svn_revision(repo_dir)
    else:
        raise RuntimeError(f"未知 repoType: {repo_type}")


def _run_check(cmd: list[str], cwd: str | None = None) -> None:
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(
            f"{' '.join(cmd)} 失败 (exit={res.returncode})\n"
            f"stdout: {res.stdout[-500:]}\nstderr: {res.stderr[-500:]}"
        )


# ── 命令渲染 + 执行 ─────────────────────────────

def render_command(template: str, values: dict) -> list[str]:
    tokens = shlex.split(template, posix=(os.name != "nt"))
    out: list[str] = []
    for tok in tokens:
        def repl(m: re.Match[str]) -> str:
            v = values.get(m.group(1))
            return "" if v is None else str(v)
        out.append(VAR_RE.sub(repl, tok))
    return out


def _stringify_param_value(v: object) -> str:
    """env 变量值必须是字符串。对几种 JSON 类型做友好的字面量序列化:
    - None → ""
    - bool → "true" / "false"(脚本里 if env=="true" 这种判断更直观)
    - list / dict → json.dumps(ensure_ascii=False),脚本里 json.loads 还原
      (EXCEL 类型参数就走这条:运营上传的 .xlsx/.csv 在中台已转成 [{col:v,...}] 数组,
       agent 在这里序列化成 JSON 字符串,脚本里:
         import os, json
         rows = json.loads(os.environ["指定uid"])
         for r in rows: uid = r["UID"]
      )
    - 其它 → str(v)
    """
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def build_param_env(param_values: dict) -> dict[str, str]:
    """把 paramValues 转成可直接喂 Popen 的 env 子集。
    防御:剔除含 '=' 或控制字符的非法 env 名(理论上 zod 已挡,这里再保一道)。
    """
    out: dict[str, str] = {}
    for name, value in (param_values or {}).items():
        if not isinstance(name, str):
            continue
        if not name or "=" in name or "\x00" in name:
            continue
        out[name] = _stringify_param_value(value)
    return out


def run_command(
    task_id: str,
    argv: list[str],
    cwd: Path,
    timeout_sec: int,
    extra_env: dict[str, str] | None = None,
) -> int:
    log.info("exec %s in %s (timeout=%ss)", argv, cwd, timeout_sec)
    # 给子进程注入 UTF-8 env + 关颜色 + paramValues:
    #   PYTHONIOENCODING=utf-8:Python 自己的 print / loguru / logging 输出 UTF-8
    #   PYTHONUTF8=1:Python 3.7+ UTF-8 模式,默认 open() / sys.std* 都按 UTF-8
    #   NO_COLOR=1:no-color.org 约定;loguru/rich/click/colorama 等会自觉关 ANSI 颜色
    #   TERM=dumb:更老派的关颜色信号,部分工具(curl 等)会看
    #   extra_env:Job.paramValues 全部以 env 变量形式注入,脚本里 os.environ["开始时间"] 即可读
    # 非 Python 子进程(taskkill / cmd 内置命令)仍可能吐 GBK,靠 decode_subprocess_line 兜底;
    # 仍漏掉的 ANSI 转义码也会被 decode_subprocess_line 末尾的正则剥掉,双保险
    child_env = {
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
        "NO_COLOR": "1",
        "TERM": "dumb",
        **(extra_env or {}),  # paramValues 放最后,允许覆盖上面任何默认 env(谨慎使用)
    }
    proc = subprocess.Popen(
        argv,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
        env=child_env,
    )

    cancel_event = threading.Event()  # 中台已不再认这个任务(被取消 / 删除)
    done_event = threading.Event()    # 主线程通知 watchdog/pump 退出

    def pump() -> None:
        """从子进程读 stdout/stderr,统一转 UTF-8 后推中台 + 本地控制台。
        推中台 4xx 也当作取消信号(子进程有输出时不需要 watchdog 单独 ping)。
        """
        assert proc.stdout is not None
        buf = bytearray()  # 累积 UTF-8 字节
        last_flush = time.time()
        for raw in iter(proc.stdout.readline, b""):
            text = decode_subprocess_line(raw)
            utf8 = text.encode("utf-8", errors="replace")
            try:
                sys.stdout.buffer.write(utf8)
                sys.stdout.buffer.flush()
            except Exception:
                pass
            buf.extend(utf8)
            if len(buf) >= 4096 or (time.time() - last_flush) > 0.5:
                if not push_log(task_id, bytes(buf)):
                    cancel_event.set()
                buf.clear()
                last_flush = time.time()
        if buf:
            if not push_log(task_id, bytes(buf)):
                cancel_event.set()

    def watchdog() -> None:
        """子进程长时间无输出时也要能感知取消:每 CANCEL_POLL_SEC 秒发空 /log 探活。"""
        while not done_event.wait(CANCEL_POLL_SEC):
            if not push_log(task_id, b""):
                cancel_event.set()
                return

    t_pump = threading.Thread(target=pump, daemon=True)
    t_pump.start()
    t_watch = threading.Thread(target=watchdog, daemon=True)
    t_watch.start()

    # 主轮询:每 1 秒检查一次子进程 / 取消信号 / 总超时
    start = time.time()
    try:
        while True:
            try:
                rc = proc.wait(timeout=1)
                return rc
            except subprocess.TimeoutExpired:
                pass
            if cancel_event.is_set():
                proc.kill()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    pass
                raise TaskCanceledError("task canceled by server")
            if time.time() - start > timeout_sec:
                proc.kill()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    pass
                raise TimeoutError(f"command timeout after {timeout_sec}s")
    finally:
        done_event.set()
        t_pump.join(timeout=5)
        t_watch.join(timeout=2)


# ── 产物收集 ────────────────────────────────────────

GLOB_META_RE = re.compile(r"[*?\[\]]")


def collect_outputs(job: dict, workdir: Path) -> list[tuple[str | None, Path]]:
    """按 Job.outputs 声明从 workdir 里捡产物。

    支持的 path 写法:
      1. 字面量,如 "out/video_detail.csv":必须存在,缺则失败
      2. glob 通配,如 "数据/*_总表.csv":展开所有匹配文件
         - 至少匹配 1 个,否则视为缺产物
         - 每个匹配 = 一个独立产物(同 csvType 多份)
         - 仍做 workdir 越界校验,防 `..` 类穿越

    可选标志:
      - outputs[*].optional = True 时,文件缺失 / glob 无匹配都不报错,跳过即可。
        适合"依赖参数才会产出"的产物(例如 直播场次数据=false 时根本不生成那个表)。
    """
    found: list[tuple[str | None, Path]] = []
    workdir_resolved = workdir.resolve()
    for o in job.get("outputs", []):
        rel = o["path"]
        csv_type = o.get("csvType")
        optional = bool(o.get("optional"))

        if GLOB_META_RE.search(rel):
            # glob 模式:相对 workdir 展开
            matches = sorted(workdir.glob(rel))
            # 过滤掉目录,只留文件
            file_matches = [m for m in matches if m.is_file()]
            if not file_matches:
                if optional:
                    continue  # 可选产物无匹配 → 静默跳过
                raise RuntimeError(f"missing output (glob 无匹配): {rel}")
            for m in file_matches:
                abs_path = m.resolve()
                if not is_path_within(abs_path, workdir_resolved):
                    raise RuntimeError(f"output 路径越权: {rel} -> {abs_path}")
                found.append((csv_type, abs_path))
        else:
            abs_path = (workdir / rel).resolve()
            if not is_path_within(abs_path, workdir_resolved):
                raise RuntimeError(f"output 路径越权: {rel}")
            if not abs_path.is_file():
                if optional:
                    continue  # 可选产物缺失 → 静默跳过
                raise RuntimeError(f"missing output: {rel}")
            found.append((csv_type, abs_path))
    return found


# ── 单条任务全流程 ──────────────────────────────

def handle_task(task: dict) -> None:
    tid = task["id"]
    job = task["job"]
    params = task.get("paramValues") or {}

    # 目录布局:WORK_ROOT/repos/<repoType>-<normalized-url-hash>/<repoName>/
    # 同 repoType + repoUrl 的所有 Job 共用唯一工作副本;Agent 并发=1,
    # 每个 Task 同步后再切换自己的 repoBranch,然后进入 Job.workdir 执行。
    repo_dir = shared_repo_dir(WORK_ROOT, job["repoType"], job["repoUrl"])
    workdir = (repo_dir / (job.get("workdir") or ".")).resolve()
    if not is_path_within(workdir, repo_dir):
        raise RuntimeError("job.workdir 越权")

    log.info("=== task %s seq=#%s job=%s ===", tid, task.get("sequenceNumber"), job["name"])
    push_log(tid, f"[agent] task {tid} (job={job['name']}, seq=#{task.get('sequenceNumber')})\n".encode())

    try:
        push_log(tid, f"[agent] sync {job['repoType']} {job['repoUrl']} ({job.get('repoBranch') or 'default'})\n".encode())
        requested_revision = task.get("sourceRevision") or None
        sync_action, source_revision = sync_repo(
            job,
            repo_dir,
            requested_revision,
        )
        push_log(
            tid,
            (
                f"[agent] repo cache {sync_action}: {repo_dir}\n"
                f"[agent] source revision: {source_revision}\n"
            ).encode(),
        )
    except Exception as ex:
        msg = f"sync_repo failed: {ex}"
        log.error(msg)
        push_log(tid, (msg + "\n").encode())
        upload_failure(tid, None, msg)
        return

    try:
        argv = render_command(job["command"], params)
        if not argv:
            raise RuntimeError("命令模板渲染后为空")
    except Exception as ex:
        msg = f"render_command failed: {ex}"
        log.error(msg)
        push_log(tid, (msg + "\n").encode())
        upload_failure(tid, None, msg)
        return

    try:
        execution_snapshot = build_execution_snapshot(argv)
        prepare_execution(tid, source_revision, execution_snapshot)
        push_log(
            tid,
            (
                "[agent] execution frozen: "
                f"revision={source_revision}, "
                f"dependencies={len(execution_snapshot['dependencies'])}, "
                f"fingerprint={execution_snapshot['dependencyFingerprint'][:12]}\n"
            ).encode(),
        )
    except TaskCanceledError:
        log.info("task %s canceled before command start", tid)
        return
    except Exception as ex:
        msg = f"prepare_execution failed: {type(ex).__name__}: {ex}"
        log.exception(msg)
        push_log(tid, (msg + "\n").encode())
        upload_failure(tid, None, msg)
        return

    workdir.mkdir(parents=True, exist_ok=True)

    extra_env = build_param_env(params)
    if extra_env:
        # 不打印值本身(可能含敏感信息如 FEISHU_APP_ID),只列出注入的 key
        push_log(tid, f"[agent] inject param env: {sorted(extra_env.keys())}\n".encode())

    try:
        exit_code = run_command(
            tid, argv, workdir, int(job["timeoutMinutes"]) * 60, extra_env=extra_env
        )
    except TaskCanceledError:
        # 中台已把任务移出 RUNNING(管理员取消 / 删除 / 状态被强改)。
        # 子进程已 kill;/result 也会被服务端拒,直接走人,不再上报。
        log.info("task %s canceled by server, subprocess killed", tid)
        return
    except TimeoutError as ex:
        msg = str(ex)
        push_log(tid, (f"[agent] {msg}\n").encode())
        upload_failure(tid, None, msg)
        return
    except Exception as ex:
        msg = f"run_command crashed: {type(ex).__name__}: {ex}"
        log.exception(msg)
        push_log(tid, (msg + "\n").encode())
        upload_failure(tid, None, msg)
        return

    if exit_code != 0:
        msg = f"command exit={exit_code}"
        push_log(tid, (f"[agent] {msg}\n").encode())
        upload_failure(tid, exit_code, msg)
        return

    try:
        outputs = collect_outputs(job, workdir)
    except Exception as ex:
        msg = f"collect_outputs failed: {ex}"
        push_log(tid, (msg + "\n").encode())
        upload_failure(tid, exit_code, msg)
        return

    # 上传所有匹配到的产物。csvType 非空的会跑 parser 入解析层;
    # csvType=None 的只留底,数据集页可下载,不入解析。
    to_upload = outputs
    typed = sum(1 for ct, _ in to_upload if ct)
    untyped = len(to_upload) - typed
    push_log(
        tid,
        f"[agent] uploading {len(to_upload)} dataset(s) ({typed} typed, {untyped} 未分类)\n".encode(),
    )
    try:
        upload_success(tid, exit_code, to_upload)
    except Exception as ex:
        msg = f"upload_success failed: {ex}"
        log.exception(msg)
        push_log(tid, (msg + "\n").encode())
        upload_failure(tid, exit_code, msg)


# ── 主循环 ──────────────────────────────────────────

def _is_transient_network_error(ex: BaseException) -> bool:
    """常见的网络瞬时错(隧道挂了 / DNS 不通 / TCP 断了 / TLS 抖动 / 5xx / 超时)。
    这些不打全 traceback,只 WARN 一行,避免 executor.log 被刷爆。
    """
    if isinstance(
        ex,
        (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            requests.exceptions.ChunkedEncodingError,
            requests.exceptions.SSLError,
        ),
    ):
        return True
    if isinstance(ex, requests.exceptions.HTTPError):
        # 5xx 也算瞬时(网关 / 服务重启等),4xx 一般是协议/鉴权问题要看堆栈
        code = getattr(ex.response, "status_code", 0) or 0
        return 500 <= code < 600
    return False


def main() -> None:
    if shutil.which("git") is None:
        log.error("PATH 里没有 git,先装一个再来。")
        sys.exit(1)

    log.info("executor started base=%s work_root=%s", BASE, WORK_ROOT)
    while True:
        try:
            task = claim()
            if task is None:
                time.sleep(IDLE_POLL_SEC)
                continue
            BUSY_EVENT.set()
            try:
                handle_task(task)
            finally:
                BUSY_EVENT.clear()
            # 跑完立刻再 claim,不睡(可能后面排着队)
        except KeyboardInterrupt:
            log.info("bye")
            sys.exit(0)
        except Exception as ex:
            if _is_transient_network_error(ex):
                # 紧凑一行:错类型 + 关键 message,不打 traceback
                log.warning(
                    "claim 网络瞬时错 (will retry in %ss): %s",
                    ERROR_BACKOFF_SEC,
                    f"{type(ex).__name__}: {str(ex).splitlines()[0][:160]}",
                )
            else:
                log.exception("loop error, sleeping %ss", ERROR_BACKOFF_SEC)
            time.sleep(ERROR_BACKOFF_SEC)


if __name__ == "__main__":
    main()
