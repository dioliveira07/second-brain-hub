#!/usr/bin/env python3
"""
Backfill diffs em sinais arquivo_editado sem campo diff.

Busca sinais das últimas 48h sem diff, tenta localizar o arquivo
nos workspaces dos devs e popula com git diff HEAD.

Uso:
    python3 scripts/backfill_diffs.py [--horas 48] [--dry-run]
"""
import asyncio
import argparse
import subprocess
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import asyncpg

# ── Config ─────────────────────────────────────────────────────────────────────

DB_DSN = os.environ.get("DB_DSN", "postgresql://sbuser:sbpass@postgres:5432/secondbrain")

MAX_DIFF_LINES = 60

# ── Helpers ────────────────────────────────────────────────────────────────────

def find_git_root(path: str) -> str | None:
    """Sobe na árvore de diretórios até encontrar um .git."""
    p = Path(path)
    if p.is_file():
        p = p.parent
    for parent in [p, *p.parents]:
        if (parent / ".git").exists():
            return str(parent)
    return None


def get_git_diff(arquivo: str) -> str:
    """Roda git diff HEAD para o caminho absoluto do arquivo."""
    if not Path(arquivo).exists():
        return ""
    repo_dir = find_git_root(arquivo)
    if not repo_dir:
        return ""
    try:
        r = subprocess.run(
            ["git", "diff", "HEAD", "--", arquivo],
            capture_output=True, text=True, timeout=5, cwd=repo_dir
        )
        if r.returncode == 0 and r.stdout.strip():
            return "\n".join(r.stdout.strip().splitlines()[:MAX_DIFF_LINES])
        # tenta staged
        r2 = subprocess.run(
            ["git", "diff", "--cached", "--", arquivo],
            capture_output=True, text=True, timeout=5, cwd=repo_dir
        )
        if r2.returncode == 0 and r2.stdout.strip():
            return "\n".join(r2.stdout.strip().splitlines()[:MAX_DIFF_LINES])
    except Exception:
        pass
    return ""

# ── Main ───────────────────────────────────────────────────────────────────────

async def main(horas: int, dry_run: bool):
    print(f"Conectando ao banco... (DSN: {DB_DSN})")
    conn = await asyncpg.connect(DB_DSN)

    desde = datetime.now(timezone.utc) - timedelta(hours=horas)

    rows = await conn.fetch(
        """
        SELECT id, dev, projeto, dados, ts
        FROM dev_signals
        WHERE tipo = 'arquivo_editado'
          AND ts >= $1
          AND (dados->>'diff' IS NULL OR dados->>'diff' = '')
        ORDER BY ts DESC
        """,
        desde,
    )

    print(f"Encontrados {len(rows)} sinais sem diff nas últimas {horas}h\n")

    atualizado = 0
    sem_repo   = 0
    sem_diff   = 0

    for row in rows:
        import json
        dados   = json.loads(row["dados"]) if isinstance(row["dados"], str) else dict(row["dados"])
        arquivo = dados.get("arquivo", "")
        dev     = row["dev"]
        projeto = row["projeto"]

        if not arquivo:
            continue

        if not Path(arquivo).exists():
            print(f"  [NÃO ENCONTRADO] {dev} / {arquivo}")
            sem_repo += 1
            continue

        diff = get_git_diff(arquivo)
        if not diff:
            print(f"  [SEM DIFF]       {dev} / {arquivo}")
            sem_diff += 1
            continue

        print(f"  [OK]             {dev} / {arquivo} ({len(diff.splitlines())} linhas)")

        if not dry_run:
            dados["diff"] = diff
            await conn.execute(
                "UPDATE dev_signals SET dados = $1::jsonb WHERE id = $2",
                json.dumps(dados),
                row["id"],
            )
        atualizado += 1

    await conn.close()

    print(f"\nResumo:")
    print(f"  Atualizados : {atualizado}")
    print(f"  Sem repo    : {sem_repo}")
    print(f"  Sem diff    : {sem_diff}")
    if dry_run:
        print("  (dry-run — nenhuma escrita feita)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--horas",   type=int, default=48, help="Janela de busca em horas (default: 48)")
    parser.add_argument("--dry-run", action="store_true",  help="Apenas mostra, não escreve")
    args = parser.parse_args()

    asyncio.run(main(args.horas, args.dry_run))
