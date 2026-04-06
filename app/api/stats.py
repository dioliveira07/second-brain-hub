from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from app.db.session import get_db
from app.db.models import IndexedRepo, ArchitecturalDecision, IndexingLog, Notification
from app.services.qdrant import client as qdrant_client

router = APIRouter()


@router.get("/overview")
async def get_stats_overview(db: AsyncSession = Depends(get_db)):
    """Cards de status agregados."""
    repos_count = (await db.execute(
        select(func.count()).select_from(IndexedRepo).where(IndexedRepo.indexing_status == "done")
    )).scalar() or 0

    chunks_total = (await db.execute(
        select(func.sum(IndexingLog.chunks_created)).where(IndexingLog.status == "done")
    )).scalar() or 0

    decisions_count = (await db.execute(
        select(func.count()).select_from(ArchitecturalDecision)
    )).scalar() or 0

    notifications_unread = (await db.execute(
        select(func.count()).select_from(Notification).where(Notification.read == False)
    )).scalar() or 0

    # Qdrant info
    try:
        ck = qdrant_client.get_collection("company_knowledge")
        qdrant_points = ck.points_count
    except Exception:
        qdrant_points = int(chunks_total)

    return {
        "repos_indexed": repos_count,
        "chunks_total": int(chunks_total),
        "qdrant_points": qdrant_points,
        "decisions_captured": decisions_count,
        "notifications_unread": notifications_unread,
    }


@router.get("/activity")
async def get_stats_activity(db: AsyncSession = Depends(get_db)):
    """Heatmap: PRs mergeados por repo por semana (últimas 12 semanas)."""
    cutoff = datetime.now(timezone.utc) - timedelta(weeks=12)
    result = await db.execute(
        select(ArchitecturalDecision)
        .where(ArchitecturalDecision.merged_at >= cutoff)
        .order_by(ArchitecturalDecision.merged_at)
    )
    decisions = result.scalars().all()

    # Agrupa por repo e semana
    heatmap: dict[str, dict[str, int]] = {}
    for d in decisions:
        if not d.merged_at:
            continue
        week = d.merged_at.strftime("%Y-W%V")
        repo_result = await db.execute(select(IndexedRepo).where(IndexedRepo.id == d.repo_id))
        repo = repo_result.scalar_one_or_none()
        repo_name = repo.github_full_name if repo else "unknown"
        if repo_name not in heatmap:
            heatmap[repo_name] = {}
        heatmap[repo_name][week] = heatmap[repo_name].get(week, 0) + 1

    # Gera lista de semanas das últimas 12
    weeks = []
    for i in range(11, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(weeks=i)
        weeks.append(d.strftime("%Y-W%V"))

    # Formata para recharts
    data = []
    for week in weeks:
        row: dict[str, str | int] = {"week": week}
        for repo in heatmap:
            row[repo] = heatmap[repo].get(week, 0)
        data.append(row)

    return {"weeks": weeks, "repos": list(heatmap.keys()), "data": data}


@router.get("/timeline")
async def get_stats_timeline(db: AsyncSession = Depends(get_db)):
    """Decisões arquiteturais ordenadas por data para timeline."""
    result = await db.execute(
        select(ArchitecturalDecision, IndexedRepo)
        .join(IndexedRepo, ArchitecturalDecision.repo_id == IndexedRepo.id)
        .order_by(ArchitecturalDecision.merged_at.desc().nulls_last())
        .limit(50)
    )
    rows = result.all()

    return {
        "decisions": [
            {
                "id": str(d.id),
                "repo": r.github_full_name,
                "pr_number": d.pr_number,
                "pr_title": d.pr_title,
                "pr_author": d.pr_author,
                "impact_areas": d.impact_areas or [],
                "breaking_changes": d.breaking_changes,
                "merged_at": d.merged_at.isoformat() if d.merged_at else None,
            }
            for d, r in rows
        ]
    }
