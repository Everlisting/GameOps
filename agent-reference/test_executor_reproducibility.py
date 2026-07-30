import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
import unittest
from unittest.mock import patch

os.environ.setdefault("CRAWLER_BASE_URL", "https://example.invalid")
os.environ.setdefault("CRAWLER_TOKEN", "test.test")
os.environ.setdefault(
    "CRAWLER_WORK_ROOT",
    str(Path(gettempdir()) / "gameops-agent-test-workspaces"),
)
os.environ.setdefault(
    "CRAWLER_LOG_DIR",
    str(Path(gettempdir()) / "gameops-agent-test-logs"),
)

from executor import build_execution_snapshot, sync_repo


def run_git(cwd: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=True,
    )
    return completed.stdout.strip()


class ExecutorReproducibilityTests(unittest.TestCase):
    def test_git_task_can_return_to_frozen_commit(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            remote = root / "remote.git"
            seed = root / "seed"
            checkout = root / "checkout"

            run_git(root, "init", "--bare", str(remote))
            seed.mkdir()
            run_git(seed, "init")
            run_git(seed, "config", "user.email", "agent-test@example.com")
            run_git(seed, "config", "user.name", "Agent Test")
            (seed / "version.txt").write_text("first", encoding="utf-8")
            run_git(seed, "add", "version.txt")
            run_git(seed, "commit", "-m", "first")
            run_git(seed, "branch", "-M", "main")
            run_git(seed, "remote", "add", "origin", str(remote))
            run_git(seed, "push", "-u", "origin", "main")
            first_revision = run_git(seed, "rev-parse", "HEAD")

            (seed / "version.txt").write_text("second", encoding="utf-8")
            run_git(seed, "commit", "-am", "second")
            run_git(seed, "push")
            second_revision = run_git(seed, "rev-parse", "HEAD")

            job = {
                "id": "repro-test-job",
                "repoType": "GIT",
                "repoUrl": str(remote),
                "repoBranch": "main",
            }
            action, resolved = sync_repo(job, checkout)
            self.assertEqual(action, "cloned")
            self.assertEqual(resolved, second_revision)

            action, resolved = sync_repo(job, checkout, first_revision)
            self.assertEqual(action, "pinned")
            self.assertEqual(resolved, first_revision)
            self.assertEqual(
                (checkout / "version.txt").read_text(encoding="utf-8"),
                "first",
            )

    def test_execution_snapshot_contains_stable_fingerprints(self) -> None:
        with (
            patch(
                "executor._python_dependencies",
                return_value=["requests==2.34.2", "python-dotenv==1.2.2"],
            ),
            patch("executor._command_version", return_value="git version test"),
        ):
            first = build_execution_snapshot(["python", "run.py", "--day=2026-07-30"])
            second = build_execution_snapshot(["python", "run.py", "--day=2026-07-30"])
            changed = build_execution_snapshot(["python", "run.py", "--day=2026-07-31"])

        self.assertEqual(
            first["dependencyFingerprint"],
            second["dependencyFingerprint"],
        )
        self.assertEqual(first["commandHash"], second["commandHash"])
        self.assertNotEqual(first["commandHash"], changed["commandHash"])
        self.assertEqual(first["schemaVersion"], 1)


if __name__ == "__main__":
    unittest.main()
