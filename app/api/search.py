from fastapi import APIRouter
from pydantic import BaseModel
from app.services import embeddings
from app.services.qdrant import client as qdrant_client
from app.services.synthesis import synthesize
from qdrant_client.models import Filter, FieldCondition, MatchAny

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    repos: list[str] | None = None  # filtro opcional por repos
    limit: int = 10
    synthesize: bool = False  # se True, gera resposta sintetizada via Claude


class SearchResult(BaseModel):
    score: float
    repo: str
    file_path: str
    language: str
    semantic_role: str
    symbol_name: str
    chunk_index: int
    snippet: str  # primeiros 500 chars do content


@router.post("")
async def semantic_search(request: SearchRequest):
    # 1. Embed a query
    query_vector = embeddings.embed_query(request.query)

    # 2. Monta filtro por repos se fornecido
    query_filter = None
    if request.repos:
        query_filter = Filter(
            must=[
                FieldCondition(
                    key="repo",
                    match=MatchAny(any=request.repos)
                )
            ]
        )

    # 3. Busca no Qdrant
    hits = qdrant_client.search(
        collection_name="company_knowledge",
        query_vector=query_vector,
        query_filter=query_filter,
        limit=request.limit,
        with_payload=True,
    )

    # 4. Reranking: combina score semântico com keyword match simples
    query_words = set(request.query.lower().split())
    results = []
    for hit in hits:
        payload = hit.payload or {}
        content = payload.get("content", "")

        # Keyword boost: % das palavras da query presentes no chunk
        content_lower = content.lower()
        keyword_matches = sum(1 for w in query_words if w in content_lower)
        keyword_boost = keyword_matches / max(len(query_words), 1) * 0.1

        final_score = hit.score + keyword_boost

        results.append({
            "score": round(final_score, 4),
            "repo": payload.get("repo", ""),
            "file_path": payload.get("file_path", ""),
            "language": payload.get("language", ""),
            "semantic_role": payload.get("semantic_role", ""),
            "symbol_name": payload.get("symbol_name", ""),
            "chunk_index": payload.get("chunk_index", 0),
            "snippet": content[:500],
            "_full_content": content,  # usado internamente pela síntese
        })

    # Reordena pelo score final
    results.sort(key=lambda x: x["score"], reverse=True)

    # Síntese opcional via Claude CLI — Claude pesquisa autonomamente via MCP
    answer = None
    if request.synthesize and results:
        raw_hits = [{"payload": {**r, "snippet": r["_full_content"]}} for r in results]
        repo_filter = request.repos[0] if request.repos and len(request.repos) == 1 else None
        answer = await synthesize(request.query, raw_hits, repo_filter=repo_filter)

    # Remove _full_content da resposta (campo interno)
    for r in results:
        r.pop("_full_content", None)

    return {"query": request.query, "results": results, "total": len(results), "answer": answer}
