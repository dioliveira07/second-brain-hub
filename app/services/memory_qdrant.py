"""Memória indexada semanticamente no Qdrant (collection 'memories').

Cada Memory(non-archived) é embeddada com title + content e armazenada
como point no Qdrant. O conflict_detector usa similaridade de cosseno
entre o diff atual e os pontos para encontrar memórias relacionadas —
muito mais robusto que overlap de tokens.

Helpers:
- index_memory(memory)         : upsert no Qdrant
- remove_memory(memory_id)     : delete do Qdrant
- search_memories(...)         : busca semântica com filters
"""
from __future__ import annotations

import logging
import uuid
from typing import Iterable

from qdrant_client.models import (
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
)

from app.services import embeddings
from app.services.qdrant import client as qclient

logger = logging.getLogger("hub.memory_qdrant")

COLLECTION = "memories"


def _build_text(memory) -> str:
    """Monta o texto que será embedded — title + content + tags."""
    parts = [memory.title or ""]
    if memory.content:
        parts.append(memory.content)
    if memory.tags:
        # Tags com prefixo "file:" são path explícito, ajudam o embedding
        parts.append(" ".join(str(t) for t in memory.tags))
    return "\n".join(p for p in parts if p)[:4000]  # cap pra evitar texto gigante


def _embed(text: str) -> list[float]:
    vec = embeddings.embed_query(text)
    if not isinstance(vec, list):
        vec = vec.tolist()
    return vec


def index_memory(memory) -> bool:
    """Upsert memory no Qdrant. Idempotente (mesmo id = overwrite).

    Retorna True se sucesso, False em erro silencioso.
    """
    try:
        text = _build_text(memory)
        if not text.strip():
            return False
        vec = _embed(text)
        qclient.upsert(
            collection_name=COLLECTION,
            points=[PointStruct(
                id=str(memory.id),
                vector=vec,
                payload={
                    "type": memory.type,
                    "scope": memory.scope,
                    "scope_ref": memory.scope_ref,
                    "title": memory.title,
                    "tags": memory.tags or [],
                    "confidence": memory.confidence,
                    "archived": bool(memory.archived),
                    "source_type": memory.source_type,
                    "source_ref": memory.source_ref,
                    "created_at": memory.created_at.isoformat() if memory.created_at else None,
                },
            )],
        )
        return True
    except Exception as e:
        logger.warning("falha ao indexar memory %s: %s", getattr(memory, "id", "?"), e)
        return False


def remove_memory(memory_id) -> bool:
    """Remove memory do Qdrant. Idempotente."""
    try:
        qclient.delete(
            collection_name=COLLECTION,
            points_selector=[str(memory_id)],
        )
        return True
    except Exception as e:
        logger.warning("falha ao remover memory %s: %s", memory_id, e)
        return False


def search_memories(
    query_text: str,
    *,
    projeto: str | None = None,
    types: Iterable[str] | None = None,
    files: Iterable[str] | None = None,
    top_n: int = 10,
    min_score: float = 0.3,
) -> list[dict]:
    """Busca HÍBRIDA de memórias: tag-match tem prioridade, semantic refina.

    Estratégia (BGE-en mistura PT-BR muito junto, então semantic puro
    é pouco discriminante):

    1. Filter HARD: archived=False, scope_ref=projeto, type in types
    2. Busca semantic top 50 com Qdrant (resgata candidatos amplos)
    3. Re-rank com bonus por tag match:
       - tag_bonus = +1.0 se tem `file:<arquivo>` matching
       - tag_bonus = +0.5 se tem outra tag que aparece no diff
       - score_final = semantic_score + tag_bonus
    4. Retorna top_n com score acima de min_score

    Resultado: memórias com tag match bombem para o topo dentro do
    cluster semântico, sem ignorar memórias semanticamente próximas
    sem tag.
    """
    if not query_text.strip():
        return []

    try:
        vec = _embed(query_text)
    except Exception as e:
        logger.warning("falha ao embed query: %s", e)
        return []

    must = [
        FieldCondition(key="archived", match=MatchValue(value=False)),
    ]
    if projeto:
        must.append(FieldCondition(key="scope_ref", match=MatchValue(value=projeto)))
    if types:
        must.append(FieldCondition(key="type", match=MatchAny(any=list(types))))

    qfilter = Filter(must=must)

    try:
        hits = qclient.search(
            collection_name=COLLECTION,
            query_vector=vec,
            query_filter=qfilter,
            limit=50,  # pega amplo; rerank decide
        )
    except Exception as e:
        logger.warning("falha em qdrant search: %s", e)
        return []

    file_tags = {f"file:{f}" for f in (files or [])}
    query_lower = query_text.lower()

    rescored = []
    for h in hits:
        payload = h.payload or {}
        tags = set(payload.get("tags") or [])

        # Tag bonus
        tag_bonus = 0.0
        if file_tags and (tags & file_tags):
            tag_bonus += 1.0
        # Bonus menor: alguma tag (que não é file:) aparece no query
        for t in tags:
            if t.startswith("file:") or t.startswith("branch:"):
                continue
            if isinstance(t, str) and len(t) >= 4 and t.lower() in query_lower:
                tag_bonus += 0.3
                break

        final_score = h.score + tag_bonus
        rescored.append({
            "id": str(h.id),
            "score": final_score,
            "semantic_score": h.score,
            "tag_bonus": tag_bonus,
            "payload": payload,
        })

    rescored.sort(key=lambda x: x["score"], reverse=True)

    return [r for r in rescored if r["score"] >= min_score][:top_n]
