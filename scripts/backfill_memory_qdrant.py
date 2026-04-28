#!/usr/bin/env python3
"""Backfill: indexa todas as Memory(archived=False) no Qdrant collection 'memories'.

Idempotente — overwrite se ID já existe. Após mudanças no schema/embedding,
basta rodar de novo.

Uso (no container):
    docker exec second-brain-hub-hub-api-1 python scripts/backfill_memory_qdrant.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db.session import async_session
from app.db.models import Memory
from app.services import memory_qdrant
from app.services.qdrant import init_collections


async def main():
    print("Garantindo collection 'memories'...")
    await init_collections()

    async with async_session() as session:
        result = await session.execute(
            select(Memory).where(Memory.archived == False)  # noqa: E712
        )
        memories = result.scalars().all()
        print(f"Memórias ativas: {len(memories)}")

        ok = 0
        fail = 0
        for i, mem in enumerate(memories, 1):
            if memory_qdrant.index_memory(mem):
                ok += 1
            else:
                fail += 1
            if i % 20 == 0:
                print(f"  progresso: {i}/{len(memories)} (ok={ok} fail={fail})")

        print(f"\nIndexadas: {ok} | Falhas: {fail} | Total: {len(memories)}")


if __name__ == "__main__":
    asyncio.run(main())
