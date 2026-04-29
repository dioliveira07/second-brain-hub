"""decay_worker — aplica decay exponencial em memories com TTL.

Cron diário às 3am. Não chama LLM (puro DB).

Half-life por tipo:
- progress  : 7 dias
- context   : 30 dias
- session   : 12 horas (gotchas de curto prazo)

Memórias com confidence < 0.1 → archived=true (não deletadas).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

import asyncio

from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register
from app.db.models import Memory
from app.services import memory_qdrant


# half-life em horas por tipo
HALF_LIFE_HOURS = {
    "progress": 7 * 24,
    "context": 30 * 24,
    "session": 12,
}


@register
class DecayWorker(AgentBase):
    NAME = "decay_worker"
    MODEL = "sonnet"  # logical model — mas não chama LLM
    SUBSCRIBES = ()
    CRON = "0 3 * * *"  # 3am diário

    async def run(self, *, db: AsyncSession, event: dict | None = None, input: dict | None = None) -> AgentResult:
        now = datetime.now(timezone.utc)
        decayed = 0
        archived = 0
        archived_ids: list = []

        # 1. memórias com TTL ainda dentro do prazo → decai confidence
        for mem_type, half_life_h in HALF_LIFE_HOURS.items():
            r = await db.execute(
                select(Memory).where(
                    Memory.type == mem_type,
                    Memory.archived == False,  # noqa: E712
                    Memory.expires_at != None,  # noqa: E711
                )
            )
            for mem in r.scalars().all():
                age_hours = (now - (mem.updated_at or mem.created_at)).total_seconds() / 3600
                # decay: confidence_new = confidence_initial * 0.5 ** (age / half_life)
                # mas como confidence pode ter sido tocada, decai relativamente ao último update
                decay_factor = 0.5 ** (age_hours / half_life_h)
                new_conf = (mem.confidence or 1.0) * decay_factor
                if abs(new_conf - mem.confidence) > 0.01:
                    mem.confidence = max(0.0, new_conf)
                    decayed += 1

                if mem.confidence < 0.1:
                    mem.archived = True
                    archived += 1
                    archived_ids.append(mem.id)

        # 2. memórias com expires_at no passado → archived
        r = await db.execute(
            select(Memory).where(
                Memory.archived == False,  # noqa: E712
                Memory.expires_at != None,  # noqa: E711
                Memory.expires_at < now,
            )
        )
        for mem in r.scalars().all():
            mem.archived = True
            archived += 1
            archived_ids.append(mem.id)

        await db.commit()

        # Remove do Qdrant em batch
        for mid in archived_ids:
            try:
                await asyncio.to_thread(memory_qdrant.remove_memory, mid)
            except Exception:
                pass

        return AgentResult(output={
            "decayed": decayed,
            "archived": archived,
            "ts": now.isoformat(),
        })
