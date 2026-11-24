"""Reads commits of a project folder with git. Only dates and hashes: no texts, no authors."""

import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path, PureWindowsPath

TIMEOUT_SECONDS = 20
# A repository brings its own config: nothing from it may start another program.
SAFE = ["-c", "core.fsmonitor=false", "-c", "log.showSignature=false", "--no-pager"]
LOG = ["log", "--branches", "--no-merges", "--format=%H %aI"]


def local_folder(text: str | None) -> Path | None:
    """A network path is refused: opening it may send the Windows password hash away."""
    if not text or text.startswith(("\\\\", "//")):
        return None
    path = Path(text)
    if os.name == "nt" and not PureWindowsPath(text).drive:
        return None
    return path if path.is_absolute() else None


def read_commits(folder: Path) -> list[tuple[str, datetime]] | None:
    """Everything written on local branches, by the moment it was written.

    None when the folder is not the root of a repository: git itself would climb up and
    count the commits of somebody above.
    """
    if not (folder / ".git").exists():
        return None
    done = subprocess.run(
        ["git", *SAFE, "-C", str(folder), *LOG],
        env=os.environ | {"GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"},
        stdin=subprocess.DEVNULL,
        capture_output=True,
        encoding="utf-8",
        timeout=TIMEOUT_SECONDS,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        check=True,
    )
    commits = []
    for line in done.stdout.splitlines():
        sha, _, at = line.partition(" ")
        commits.append((sha, datetime.fromisoformat(at).astimezone(UTC)))
    return commits


def fingerprint(folder: Path) -> frozenset[tuple[str, int, int]]:
    """Changes with every commit, branch or rewrite; costs a few file stats, not a process."""
    git = folder / ".git"
    files = [git / "HEAD", git / "logs" / "HEAD", git / "packed-refs"]
    files += sorted((git / "refs" / "heads").glob("**/*"))
    marks = []
    for path in files:
        try:
            stat = path.stat()
        except OSError:
            continue
        marks.append((str(path), stat.st_mtime_ns, stat.st_size))
    return frozenset(marks)
