from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import IndexedRepo

router = APIRouter()


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


@router.get("/{owner}/{repo}/decisions")
async def get_repo_decisions(owner: str, repo: str):
    return {"repo": f"{owner}/{repo}", "decisions": []}
