"""Repository workspace identity and path helpers.

The cache identity deliberately excludes Job ID and branch:
- same repository URL across Jobs -> one local checkout
- branch is selected immediately before each task
- Agent concurrency is 1, so branch switching is serialized
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def normalize_repo_url(url: str) -> str:
    """Normalize equivalent repository URLs for cache identity checks."""
    value = url.strip().rstrip("/")

    # SCP-like Git URL: git@github.com:org/repo.git
    scp_match = re.fullmatch(r"([^@\s]+)@([^:\s]+):(.+)", value)
    if scp_match:
        user, host, path = scp_match.groups()
        path = path.rstrip("/")
        if path.lower().endswith(".git"):
            path = path[:-4]
        return f"{user}@{host.lower()}:{path}"

    parsed = urlsplit(value)
    if parsed.scheme and parsed.netloc:
        path = parsed.path.rstrip("/")
        if path.lower().endswith(".git"):
            path = path[:-4]
        userinfo, separator, host_part = parsed.netloc.rpartition("@")
        normalized_netloc = host_part.lower()
        if separator:
            normalized_netloc = f"{userinfo}@{normalized_netloc}"
        return urlunsplit(
            (
                parsed.scheme.lower(),
                normalized_netloc,
                path,
                parsed.query,
                "",
            )
        )

    if value.lower().endswith(".git"):
        value = value[:-4]
    return value


def extract_repo_name(url: str) -> str:
    """Return a filesystem-safe repository directory name."""
    normalized = normalize_repo_url(url)
    parsed = urlsplit(normalized)
    name_source = parsed.path if parsed.scheme and parsed.netloc else normalized
    name_source = name_source.split("?", 1)[0].rstrip("/")
    last = re.split(r"[/:]", name_source)[-1]
    last = re.sub(r"[^A-Za-z0-9_.\-]", "_", last)
    return last or "repo"


def repo_cache_key(repo_type: str, url: str) -> str:
    identity = f"{repo_type.upper()}\0{normalize_repo_url(url)}"
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
    return f"{repo_type.lower()}-{digest}"


def shared_repo_dir(work_root: Path, repo_type: str, url: str) -> Path:
    """Resolve the one shared checkout directory for a repository URL."""
    return (
        work_root
        / "repos"
        / repo_cache_key(repo_type, url)
        / extract_repo_name(url)
    )


def is_path_within(path: Path, parent: Path) -> bool:
    """Cross-platform containment check without vulnerable string prefixes."""
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False
