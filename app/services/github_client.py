"""
GitHub Client — Interação com a API do GitHub.

Responsabilidades:
- Clone/pull de repositórios
- Fetch de PRs e diffs
- Listagem de repos acessíveis por usuário
- Validação de webhook signatures
"""

import subprocess
import os
from pathlib import Path


def clone_repo(full_name: str, target_dir: str, token: str) -> str:
    """Clone repo via HTTPS com token. Se já existe, faz git pull. Retorna path local."""
    repo_path = Path(target_dir) / full_name.replace("/", "_")
    url = f"https://{token}@github.com/{full_name}.git"

    if repo_path.exists():
        subprocess.run(
            ["git", "-C", str(repo_path), "pull", "--depth=1"],
            check=True, capture_output=True,
        )
    else:
        repo_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", "--depth=1", url, str(repo_path)],
            check=True, capture_output=True,
        )

    return str(repo_path)


async def clone_repo_async(full_name: str, target_dir: str, token: str) -> str:
    """Versão async-safe: roda o clone em thread para não bloquear o event loop."""
    import asyncio
    return await asyncio.to_thread(clone_repo, full_name, target_dir, token)


import hashlib
import hmac
import json


async def get_pr_diff(full_name: str, pr_number: int, token: str) -> str:
    """Fetch PR diff from GitHub API. Truncate to 50KB."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}/pulls/{pr_number}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.diff"},
        )
        if resp.status_code != 200:
            return ""
        diff = resp.text
        return diff[:50_000] if len(diff) > 50_000 else diff


async def get_pr_details(full_name: str, pr_number: int, token: str) -> dict:
    """Fetch PR title, body, author, and review comments."""
    import httpx
    async with httpx.AsyncClient() as client:
        # PR info
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}/pulls/{pr_number}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        pr = resp.json() if resp.status_code == 200 else {}

        # Review comments
        resp2 = await client.get(
            f"https://api.github.com/repos/{full_name}/pulls/{pr_number}/comments",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        comments = resp2.json() if resp2.status_code == 200 else []

        return {
            "title": pr.get("title", ""),
            "body": pr.get("body", "") or "",
            "author": pr.get("user", {}).get("login", ""),
            "merged_at": pr.get("merged_at"),
            "changed_files": [f["filename"] for f in pr.get("files", [])],
            "comments": [{"user": c.get("user", {}).get("login"), "body": c.get("body", "")} for c in comments[:20]],
        }


async def get_pr_files(full_name: str, pr_number: int, token: str) -> list[str]:
    """Return list of filenames changed in the PR."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}/pulls/{pr_number}/files",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            params={"per_page": 100},
        )
        if resp.status_code != 200:
            return []
        return [f["filename"] for f in resp.json()]


def verify_webhook_signature(payload_bytes: bytes, signature_header: str, secret: str) -> bool:
    """Verify GitHub webhook HMAC signature."""
    if not secret:
        return True  # if no secret configured, allow all
    if not signature_header:
        return False
    mac = hmac.new(secret.encode(), payload_bytes, hashlib.sha256)
    expected = "sha256=" + mac.hexdigest()
    return hmac.compare_digest(expected, signature_header)
