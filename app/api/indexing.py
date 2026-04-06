from fastapi import APIRouter, Depends
from pydantic import BaseModel

router = APIRouter()


class IndexRepoRequest(BaseModel):
    github_full_name: str  # "org/repo-name"


@router.post("/repo")
async def index_repo(request: IndexRepoRequest):
    """Trigger full indexing pipeline for a repository."""
    # TODO: Fase 1C — Chamar pipeline: clone → analyze → chunk → embed → ingest
    return {
        "status": "queued",
        "repo": request.github_full_name,
        "message": "Indexing pipeline triggered",
    }
