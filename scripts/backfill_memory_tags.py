#!/usr/bin/env python3
"""Enriquece tags de Memory(progress) com `file:<path>` baseado em DevSignal
arquivo_editado próximos ao timestamp de cada memory (até 10min antes).

Idempotente — só adiciona tags ausentes.

Uso (no container):
    docker exec second-brain-hub-hub-api-1 python scripts/backfill_memory_tags.py
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db.session import async_session
from app.db.models import Memory, DevSignal


async def files_for_memory(session, mem: Memory) -> list[str]:
    """Encontra arquivos editados pelo dono do commit (inferido do source_ref) próximo ao timestamp."""
    # source_ref é o signal_id; busca o signal original para pegar dev/projeto/ts
    if mem.source_type != "signal" or not mem.source_ref:
        return []
    try:
        signal_id = mem.source_ref
        sig_result = await session.execute(select(DevSignal).where(DevSignal.id == signal_id))
        signal = sig_result.scalar_one_or_none()
    except Exception:
        return []
    if not signal:
        return []
    since = signal.ts - timedelta(minutes=10)

    async def _query(by_projeto: bool):
        q = select(DevSignal).where(
            DevSignal.dev == signal.dev,
            DevSignal.tipo == "arquivo_editado",
            DevSignal.ts >= since,
            DevSignal.ts <= signal.ts,
        )
        if by_projeto:
            q = q.where(DevSignal.projeto == signal.projeto)
        q = q.order_by(DevSignal.ts.desc()).limit(50)
        result = await session.execute(q)
        out = []
        seen = set()
        for s in result.scalars().all():
            f = (s.dados or {}).get("arquivo")
            if f and f not in seen:
                seen.add(f)
                out.append(f)
        return out

    files = await _query(by_projeto=True)
    if not files:
        files = await _query(by_projeto=False)
    return files


async def main():
    print("Enriquecendo tags de Memory(progress) com arquivos editados próximos...")
    async with async_session() as session:
        result = await session.execute(
            select(Memory).where(
                Memory.type == "progress",
                Memory.archived == False,  # noqa: E712
                Memory.source_type == "signal",
            )
        )
        memories = result.scalars().all()
        print(f"  candidatas: {len(memories)}")

        enriched = 0
        for mem in memories:
            files = await files_for_memory(session, mem)
            if not files:
                continue
            existing_tags = set(mem.tags or [])
            new_tags = list(existing_tags)
            added = 0
            for f in files:
                tag = f"file:{f}"
                if tag not in existing_tags:
                    new_tags.append(tag)
                    added += 1
            if added:
                mem.tags = new_tags
                enriched += 1
                if enriched % 50 == 0:
                    print(f"  enriquecidas: {enriched}")
                    await session.commit()
        await session.commit()
        print(f"\nTotal enriquecidas: {enriched}/{len(memories)}")


if __name__ == "__main__":
    asyncio.run(main())
