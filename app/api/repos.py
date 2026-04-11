import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import IndexedRepo, ArchitecturalDecision

REPOS_DIR = Path(os.getenv("REPOS_DIR", "/data/repos"))

router = APIRouter()


@router.get("")
async def list_repos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(IndexedRepo).order_by(IndexedRepo.created_at.desc()))
    repos = result.scalars().all()
    return [
        {
            "repo": r.github_full_name,
            "status": r.indexing_status,
            "last_indexed_at": r.last_indexed_at,
        }
        for r in repos
    ]


@router.get("/{owner}/{repo}/summary")
async def get_repo_summary(owner: str, repo: str, db: AsyncSession = Depends(get_db)):
    full_name = f"{owner}/{repo}"
    result = await db.execute(
        select(IndexedRepo).where(IndexedRepo.github_full_name == full_name)
    )
    indexed = result.scalar_one_or_none()
    if not indexed:
        raise HTTPException(status_code=404, detail="Repo não indexado")
    return {
        "repo": full_name,
        "summary": indexed.summary,
        "detected_stack": indexed.detected_stack,
        "directory_map": indexed.directory_map,
        "last_indexed_at": indexed.last_indexed_at,
        "status": indexed.indexing_status,
    }


@router.get("/{owner}/{repo}/architecture")
async def get_repo_architecture(owner: str, repo: str, db: AsyncSession = Depends(get_db)):
    full_name = f"{owner}/{repo}"
    result = await db.execute(select(IndexedRepo).where(IndexedRepo.github_full_name == full_name))
    indexed = result.scalar_one_or_none()
    if not indexed:
        raise HTTPException(status_code=404, detail="Repo não indexado")
    return {
        "repo": full_name,
        "summary": indexed.summary,
        "detected_stack": indexed.detected_stack,
        "directory_map": indexed.directory_map,
        "last_indexed_at": indexed.last_indexed_at,
    }


@router.get("/{owner}/{repo}/decisions")
async def get_repo_decisions(owner: str, repo: str, db: AsyncSession = Depends(get_db)):
    full_name = f"{owner}/{repo}"
    result = await db.execute(select(IndexedRepo).where(IndexedRepo.github_full_name == full_name))
    indexed = result.scalar_one_or_none()
    if not indexed:
        raise HTTPException(status_code=404, detail="Repo não indexado")

    decisions_result = await db.execute(
        select(ArchitecturalDecision)
        .where(ArchitecturalDecision.repo_id == indexed.id)
        .order_by(ArchitecturalDecision.merged_at.desc())
    )
    decisions = decisions_result.scalars().all()

    return {
        "repo": full_name,
        "decisions": [
            {
                "id": str(d.id),
                "pr_number": d.pr_number,
                "pr_title": d.pr_title,
                "pr_author": d.pr_author,
                "impact_areas": d.impact_areas,
                "breaking_changes": d.breaking_changes,
                "merged_at": d.merged_at,
                "qdrant_point_id": d.qdrant_point_id,
            }
            for d in decisions
        ],
    }


@router.get("/{owner}/{repo}/file")
async def get_file_content(
    owner: str,
    repo: str,
    path: str = Query(..., description="Caminho relativo do arquivo, ex: src/index.ts"),
    db: AsyncSession = Depends(get_db),
):
    full_name = f"{owner}/{repo}"

    result = await db.execute(select(IndexedRepo).where(IndexedRepo.github_full_name == full_name))
    indexed = result.scalar_one_or_none()
    if not indexed:
        raise HTTPException(status_code=404, detail="Repo não indexado")

    repo_dir = REPOS_DIR / f"{owner}_{repo}"
    if not repo_dir.exists():
        raise HTTPException(status_code=404, detail="Clone local não encontrado")

    # Sanitizar path — impedir path traversal
    try:
        file_path = (repo_dir / path).resolve()
        file_path.relative_to(repo_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Path inválido")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    size = file_path.stat().st_size
    if size > 500_000:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (>500KB)")

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo: {e}")

    ext_map = {
        ".ts": "typescript", ".tsx": "typescript",
        ".js": "javascript", ".jsx": "javascript",
        ".py": "python", ".go": "go", ".rs": "rust",
        ".java": "java", ".php": "php", ".rb": "ruby",
        ".css": "css", ".scss": "scss", ".html": "html",
        ".json": "json", ".yaml": "yaml", ".yml": "yaml",
        ".toml": "toml", ".md": "markdown", ".sql": "sql",
        ".sh": "bash", ".env": "bash",
    }
    suffix = file_path.suffix.lower()
    language = ext_map.get(suffix, "text")
    if file_path.name.lower() == "dockerfile":
        language = "dockerfile"

    return {
        "path":     path,
        "language": language,
        "size":     size,
        "content":  content,
    }
