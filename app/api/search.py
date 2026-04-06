from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    repos: list[str] | None = None
    limit: int = 10


@router.post("")
async def semantic_search(request: SearchRequest):
    """Search company knowledge base with semantic query."""
    # TODO: Fase 2 — Embedding da query + busca no Qdrant + reranking
    return {"query": request.query, "results": [], "total": 0}
