from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import IndexedRepo, ArchitecturalDecision

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
