#!/usr/bin/env python3
"""Monitor de git — roda via cron */5min, grava /tmp/cerebro_project_status.json.
Chave de projeto: owner/repo do remote origin (fallback: hostname:basename).
"""
import json, subprocess, os, re, tempfile, socket
from datetime import datetime, timezone

SEARCH_ROOTS = ["/root", "/opt"]
MAX_REPOS = 30
OUT = os.path.join(tempfile.gettempdir(), "cerebro_project_status.json")
HOSTNAME = socket.gethostname()


def run_git(*args, cwd=None):
    try:
        r = subprocess.run(list(args), capture_output=True, text=True, timeout=3, cwd=cwd)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def get_project_key(path):
    """Retorna owner/repo do remote origin, ou hostname:basename como fallback."""
    remote = run_git("git", "remote", "get-url", "origin", cwd=path)
    if remote:
        m = re.search(r'[:/]([^/]+/[^/]+?)(?:\.git)?$', remote)
        if m:
            return m.group(1)
    return f"{HOSTNAME}:{os.path.basename(path)}"


def find_git_repos():
    repos = []
    for root in SEARCH_ROOTS:
        if not os.path.isdir(root):
            continue
        try:
            r = subprocess.run(
                ["find", root, "-maxdepth", "4", "-name", ".git", "-type", "d"],
                capture_output=True, text=True, timeout=15
            )
            for line in r.stdout.strip().splitlines():
                repo = os.path.dirname(line)
                if repo not in repos:
                    repos.append(repo)
                    if len(repos) >= MAX_REPOS:
                        return repos
        except Exception:
            pass
    return repos


def get_repo_status(path):
    branch = run_git("git", "branch", "--show-current", cwd=path)
    status_lines = run_git("git", "status", "--short", cwd=path).splitlines()
    uncommitted = [l[3:] for l in status_lines if l.strip()]
    ultimo_commit = run_git("git", "log", "-1", "--format=%s (%cr)", cwd=path)
    return {
        "path": path,
        "branch": branch,
        "uncommitted": uncommitted,
        "uncommitted_count": len(uncommitted),
        "ultimo_commit": ultimo_commit,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    repos = find_git_repos()
    result = {}
    for repo in repos:
        key = get_project_key(repo)
        result[key] = get_repo_status(repo)

    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(result, f)
    os.replace(tmp, OUT)


if __name__ == "__main__":
    main()
