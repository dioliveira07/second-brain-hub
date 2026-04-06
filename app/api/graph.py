from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import IndexedRepo, ArchitecturalDecision, IndexingLog

router = APIRouter()


@router.get("/nodes")
async def get_graph_nodes(db: AsyncSession = Depends(get_db)):
    """Retorna nós do grafo: repos, tecnologias, autores."""
    nodes = []
    result = await db.execute(select(IndexedRepo).where(IndexedRepo.indexing_status == "done"))
    repos = result.scalars().all()

    tech_set: dict[str, int] = {}
    author_set: dict[str, int] = {}

    for repo in repos:
        stack = repo.detected_stack or {}
        log_result = await db.execute(
            select(func.sum(IndexingLog.chunks_created))
            .where(IndexingLog.repo_id == repo.id, IndexingLog.status == "done")
        )
        chunk_count = log_result.scalar() or 0

        nodes.append({
            "id": f"repo:{repo.github_full_name}",
            "type": "repo",
            "label": repo.github_full_name,
            "size": max(5, min(30, max(1, chunk_count) / 5)),
            "color": "#3b82f6",
            "data": {
                "full_name": repo.github_full_name,
                "status": repo.indexing_status,
                "last_indexed_at": repo.last_indexed_at.isoformat() if repo.last_indexed_at else None,
                "stack": stack,
                "summary": (repo.summary or "")[:300],
            }
        })
        for tech in stack.get("frameworks", []) + stack.get("languages", []) + stack.get("infra", []):
            tech_set[tech] = tech_set.get(tech, 0) + 1

    for tech, count in tech_set.items():
        nodes.append({"id": f"tech:{tech}", "type": "technology", "label": tech,
                      "size": max(3, min(20, count * 3)), "color": "#22c55e",
                      "data": {"name": tech, "repo_count": count}})

    decisions_result = await db.execute(select(ArchitecturalDecision))
    for d in decisions_result.scalars().all():
        if d.pr_author:
            author_set[d.pr_author] = author_set.get(d.pr_author, 0) + 1

    for author, count in author_set.items():
        nodes.append({"id": f"dev:{author}", "type": "developer", "label": author,
                      "size": max(3, min(20, count * 2)), "color": "#f97316",
                      "data": {"login": author, "pr_count": count}})

    return {"nodes": nodes, "total": len(nodes)}


@router.get("/edges")
async def get_graph_edges(db: AsyncSession = Depends(get_db)):
    """Retorna arestas do grafo: repo↔tech, repo↔dev, dev→decisão."""
    edges = []
    result = await db.execute(select(IndexedRepo).where(IndexedRepo.indexing_status == "done"))
    repos = result.scalars().all()
    repo_map = {r.id: r.github_full_name for r in repos}

    for repo in repos:
        stack = repo.detected_stack or {}
        for tech in stack.get("frameworks", []) + stack.get("languages", []) + stack.get("infra", []):
            edges.append({"source": f"repo:{repo.github_full_name}", "target": f"tech:{tech}",
                          "type": "uses_technology", "weight": 1})

    decisions_result = await db.execute(select(ArchitecturalDecision))
    for d in decisions_result.scalars().all():
        if d.pr_author and d.repo_id in repo_map:
            edges.append({"source": f"dev:{d.pr_author}", "target": f"repo:{repo_map[d.repo_id]}",
                          "type": "contributed", "weight": 1})

    seen = set()
    unique = []
    for e in edges:
        k = (e["source"], e["target"], e["type"])
        if k not in seen:
            seen.add(k)
            unique.append(e)

    return {"edges": unique, "total": len(unique)}
