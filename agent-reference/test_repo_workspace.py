from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from repo_workspace import (
    extract_repo_name,
    is_path_within,
    normalize_repo_url,
    shared_repo_dir,
)


class RepoWorkspaceTests(unittest.TestCase):
    def test_equivalent_git_urls_share_identity(self) -> None:
        self.assertEqual(
            normalize_repo_url("https://GitHub.com/org/data-hub.git/"),
            normalize_repo_url("https://github.com/org/data-hub"),
        )

    def test_same_repo_url_shares_one_checkout(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            first = shared_repo_dir(
                root,
                "GIT",
                "https://github.com/org/data-hub.git",
            )
            second = shared_repo_dir(
                root,
                "GIT",
                "https://github.com/org/data-hub",
            )
            self.assertEqual(first, second)
            self.assertEqual(first.name, "data-hub")

    def test_same_repo_name_from_different_urls_does_not_collide(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            first = shared_repo_dir(root, "GIT", "https://github.com/a/data-hub.git")
            second = shared_repo_dir(root, "GIT", "https://github.com/b/data-hub.git")
            self.assertNotEqual(first.parent, second.parent)
            self.assertEqual(first.name, second.name)

    def test_scp_git_url_keeps_repo_name(self) -> None:
        self.assertEqual(
            extract_repo_name("git@github.com:org/data-hub.git"),
            "data-hub",
        )

    def test_path_containment_uses_path_segments(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            self.assertTrue(is_path_within(root / "crawler" / "run.py", root))
            self.assertFalse(is_path_within(Path(temp) / "repo-escape", root))


if __name__ == "__main__":
    unittest.main()
