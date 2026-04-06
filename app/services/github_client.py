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
            ["git", "-C", str(repo_path), "pull"],
            check=True,
            capture_output=True,
        )
    else:
        repo_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", url, str(repo_path)],
            check=True,
            capture_output=True,
        )

    return str(repo_path)


# TODO: Fase 3 — Implementar get_user_repos(access_token: str) -> list[str]
# TODO: Fase 4 — Implementar get_pr_diff(full_name: str, pr_number: int) -> str
# TODO: Fase 4 — Implementar verify_webhook_signature(payload, signature, secret)
