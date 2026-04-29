"""Síntese via Claude Code CLI — subprocess não-interativo com contexto expandido."""
import asyncio
import subprocess

from app.services import embeddings
from app.services.qdrant import client as qdrant_client
from qdrant_client.models import Filter, FieldCondition, MatchAny


CLAUDE_BIN = "/usr/local/bin/claude"


def _multi_search(query: str, repo_filter: str | None, base_limit: int = 15) -> list[dict]:
    """
    Faz 2 buscas no Qdrant com variações da query para maximizar cobertura.
    Deduplica por file_path + chunk_index e retorna lista de payloads únicos.
    """
    qfilter = None
    if repo_filter:
        qfilter = Filter(must=[FieldCondition(key="repo", match=MatchAny(any=[repo_filter]))])

    queries = [query]

    # Segunda query: extrai substantivos principais (primeiras 5 palavras não-stop)
    stop = {"como", "funciona", "o", "a", "os", "as", "de", "do", "da", "no", "na", "e", "é", "em", "um", "uma"}
    words = [w for w in query.lower().split() if w not in stop]
    if len(words) >= 2:
        alt_query = " ".join(words[:5])
        if alt_query != query.lower():
            queries.append(alt_query)

    seen = set()
    results = []

    for q in queries:
        vector = embeddings.embed_query(q)
        hits = qdrant_client.search(
            collection_name="company_knowledge",
            query_vector=vector,
            query_filter=qfilter,
            limit=base_limit,
            with_payload=True,
        )
        for hit in hits:
            p = hit.payload or {}
            key = (p.get("file_path", ""), p.get("chunk_index", 0))
            if key not in seen:
                seen.add(key)
                results.append({"score": hit.score, "payload": p})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:25]  # máximo 25 chunks únicos


async def synthesize(query: str, chunks: list[dict], repo_filter: str | None = None) -> str | None:
    """
    Faz buscas expandidas no Qdrant e sintetiza via Claude CLI.
    Retorna None em erro para não quebrar o fluxo de busca.
    """
    # Busca expandida com múltiplas queries
    expanded = await asyncio.to_thread(_multi_search, query, repo_filter)
    all_chunks = expanded if expanded else chunks

    if not all_chunks:
        return None

    # Monta contexto com conteúdo completo de cada chunk
    context_parts = []
    for c in all_chunks:
        p = c.get("payload", {})
        header = f"### {p.get('repo', '?')} / {p.get('file_path', '?')} ({p.get('language', '?')})"
        if p.get("symbol_name"):
            header += f" — {p['symbol_name']}"
        content = p.get("content", p.get("snippet", ""))
        context_parts.append(f"{header}\n```\n{content}\n```")

    context = "\n\n".join(context_parts)

    repo_hint = f"\n\nContexto restrito ao repositório: `{repo_filter}`" if repo_filter else ""

    prompt = f"""Você é um assistente de código. Responda à pergunta abaixo usando os trechos de código fornecidos como contexto. Seja técnico e direto.{repo_hint}

## Contexto de código ({len(all_chunks)} trechos)

{context}

## Pergunta
{query}

Responda em português. Se o contexto não for suficiente para uma resposta completa, diga claramente o que ficou faltando."""

    try:
        result = await asyncio.to_thread(
            subprocess.run,
            [CLAUDE_BIN, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        return None
    except Exception:
        return None
