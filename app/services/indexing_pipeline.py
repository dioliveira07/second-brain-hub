"""Pipeline de indexação completa — Fase 1C"""
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.db.models import IndexedRepo, IndexingLog
from app.services import github_client, repo_analyzer, chunker, embeddings
from app.services.qdrant import client as qdrant_client
import asyncio
from qdrant_client.models import PointStruct


REPOS_DIR = "/data/repos"


async def index_repo(github_full_name: str, db: AsyncSession, changed_files: list | None = None) -> dict:
    """Pipeline completo: clone → analyze → chunk → embed → ingest → persist.

    Se changed_files for passado (lista de paths relativos), processa apenas esses arquivos
    e deleta/reinserge somente seus pontos no Qdrant — indexação incremental.
    """
    start = time.time()

    # 1. Clone o repo (em thread para não bloquear o event loop)
    repo_path = await asyncio.to_thread(
        github_client.clone_repo, github_full_name, REPOS_DIR, settings.github_pat
    )

    # 2. Analisa (CPU-bound — também em thread)
    analysis = await asyncio.to_thread(repo_analyzer.analyze_repo, repo_path)

    # 3. Pega/cria IndexedRepo no banco
    result = await db.execute(
        select(IndexedRepo).where(IndexedRepo.github_full_name == github_full_name)
    )
    indexed_repo = result.scalar_one_or_none()
    if not indexed_repo:
        indexed_repo = IndexedRepo(github_full_name=github_full_name)
        db.add(indexed_repo)

    indexed_repo.indexing_status = "indexing"
    indexed_repo.detected_stack = analysis["stack"]
    indexed_repo.directory_map = analysis["directory_map"]
    indexed_repo.summary = analysis["summary"]
    await db.commit()
    await db.refresh(indexed_repo)

    # 4. Cria IndexingLog
    trigger = "webhook_incremental" if changed_files else "manual"
    log = IndexingLog(repo_id=indexed_repo.id, trigger=trigger, status="running")
    db.add(log)
    await db.commit()

    # 5. Chunking — filtra key_files se for indexação incremental
    all_chunks = []
    files_processed = 0

    from qdrant_client.models import Filter, FieldCondition, MatchAny, MatchValue, FilterSelector

    # Normaliza os paths alterados para comparação
    changed_set = {cf.lstrip("/") for cf in changed_files} if changed_files else None

    key_files_to_process = analysis["key_files"]
    if changed_set:
        # Incremental: processa só os arquivos alterados e limpa seus pontos antigos
        key_files_to_process = [kf for kf in analysis["key_files"] if kf["path"] in changed_set]

        if key_files_to_process:
            paths_to_delete = [kf["path"] for kf in key_files_to_process]
            qdrant_client.delete(
                collection_name="company_knowledge",
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(key="repo", match=MatchValue(value=github_full_name)),
                            FieldCondition(key="file_path", match=MatchAny(any=paths_to_delete)),
                        ]
                    )
                ),
            )
    else:
        # Full index: limpa TODOS os pontos do repo antes de reinserir — evita duplicatas
        qdrant_client.delete(
            collection_name="company_knowledge",
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="repo", match=MatchValue(value=github_full_name))]
                )
            ),
        )

    for kf in key_files_to_process:
        file_path = Path(repo_path) / kf["path"]
        if not file_path.exists() or not file_path.is_file():
            continue
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        file_chunks = chunker.chunk_file(content, kf["path"], kf["language"])
        for c in file_chunks:
            c.metadata["repo"] = github_full_name
            c.metadata["stack_context"] = str(analysis["stack"])
            c.metadata["semantic_role"] = kf.get("role", "")
        all_chunks.extend(file_chunks)
        files_processed += 1

    # 6. Embeddings + ingestão no Qdrant (batch pequeno + pausa para não estourar CPU)
    EMBED_BATCH = 10  # reduzido de 25 para 10 — menos pressão de memória e CPU por ciclo
    chunks_created = 0
    if all_chunks:
        for i in range(0, len(all_chunks), EMBED_BATCH):
            batch_chunks = all_chunks[i : i + EMBED_BATCH]
            texts = [c.content for c in batch_chunks]
            vectors = await asyncio.to_thread(embeddings.embed_texts, texts)

            points = []
            for chunk, vector in zip(batch_chunks, vectors):
                point = PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector if isinstance(vector, list) else vector.tolist(),
                    payload={**chunk.metadata, "content": chunk.content},
                )
                points.append(point)

            qdrant_client.upsert(collection_name="company_knowledge", points=points)
            chunks_created += len(points)

            # Pausa entre batches para não monopolizar a CPU da VPS
            if i + EMBED_BATCH < len(all_chunks):
                await asyncio.sleep(1.0)

    # 7. Finaliza
    duration_ms = int((time.time() - start) * 1000)
    indexed_repo.indexing_status = "done"
    indexed_repo.last_indexed_at = datetime.now(timezone.utc)
    log.status = "done"
    log.files_processed = files_processed
    log.chunks_created = chunks_created
    log.duration_ms = duration_ms
    await db.commit()

    return {
        "status": "done",
        "repo": github_full_name,
        "files_processed": files_processed,
        "chunks_created": chunks_created,
        "duration_ms": duration_ms,
    }
