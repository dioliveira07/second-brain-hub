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


async def index_repo(github_full_name: str, db: AsyncSession) -> dict:
    """Pipeline completo: clone → analyze → chunk → embed → ingest → persist."""
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
    log = IndexingLog(repo_id=indexed_repo.id, trigger="manual", status="running")
    db.add(log)
    await db.commit()

    # 5. Chunking dos key_files
    all_chunks = []
    files_processed = 0

    for kf in analysis["key_files"]:
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

    # 6. Embeddings + ingestão no Qdrant (batch de 25 para evitar OOM)
    EMBED_BATCH = 25
    chunks_created = 0
    if all_chunks:
        for i in range(0, len(all_chunks), EMBED_BATCH):
            batch_chunks = all_chunks[i : i + EMBED_BATCH]
            texts = [c.content for c in batch_chunks]
            vectors = embeddings.embed_texts(texts)

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
