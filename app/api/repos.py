from fastapi import APIRouter

router = APIRouter()


@router.get("/{owner}/{repo}/summary")
async def get_repo_summary(owner: str, repo: str):
    """Return generated architectural summary for a repo."""
    # TODO: Fase 1C — Retornar resumo do PostgreSQL
    return {"repo": f"{owner}/{repo}", "summary": None}


@router.get("/{owner}/{repo}/decisions")
async def get_repo_decisions(owner: str, repo: str):
    """List architectural decisions extracted from merged PRs."""
    # TODO: Fase 4 — Query no PostgreSQL + Qdrant
    return {"repo": f"{owner}/{repo}", "decisions": []}
