#!/usr/bin/env python3
"""Backfill de causal_edges retroativas para memories existentes.

Cria edges:
- Memory(source_type='signal', source_ref=signal_id) → edge derived_from (signal → memory)
  Para gotchas, usa relation 'triggered_by' (mais semanticamente correto).
- Memory(source_type='decision', source_ref=decision_id) → edge derived_from
  (decision → memory)

Idempotente via UniqueConstraint(cause, effect, relation) — duplicatas
viram no-op silencioso.

Uso:
    docker exec second-brain-hub-hub-api-1 python scripts/backfill_causal_edges.py
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import async_session
from app.db.models import Memory, CausalEdge, DevSignal, ArchitecturalDecision


async def main():
    created = 0
    skipped = 0

    async with async_session() as session:
        # 1. Memórias com source_type='signal' (commits, edits, errors)
        r = await session.execute(
            select(Memory).where(
                Memory.archived == False,  # noqa: E712
                Memory.source_type == "signal",
                Memory.source_ref != None,  # noqa: E711
            )
        )
        signal_mems = r.scalars().all()
        print(f"Memórias source=signal: {len(signal_mems)}")

        for mem in signal_mems:
            # Valida UUID e existência do signal
            try:
                signal_id = uuid.UUID(str(mem.source_ref))
            except (ValueError, TypeError):
                skipped += 1
                continue
            sig_check = await session.execute(
                select(DevSignal.id).where(DevSignal.id == signal_id)
            )
            if not sig_check.scalar_one_or_none():
                skipped += 1
                continue

            relation = "triggered_by" if mem.type in ("gotcha", "context") else "derived_from"

            # Insert ON CONFLICT DO NOTHING (Postgres-specific)
            stmt = pg_insert(CausalEdge).values(
                id=uuid.uuid4(),
                cause_table="dev_signals",
                cause_id=signal_id,
                effect_table="memories",
                effect_id=mem.id,
                relation=relation,
                confidence=0.9,
                detected_by="backfill",
            ).on_conflict_do_nothing(constraint="uq_causal_unique")
            result = await session.execute(stmt)
            if result.rowcount and result.rowcount > 0:
                created += 1

        # 2. Memórias com source_type='decision'
        r = await session.execute(
            select(Memory).where(
                Memory.archived == False,  # noqa: E712
                Memory.source_type == "decision",
                Memory.source_ref != None,  # noqa: E711
            )
        )
        decision_mems = r.scalars().all()
        print(f"Memórias source=decision: {len(decision_mems)}")

        for mem in decision_mems:
            try:
                decision_id = uuid.UUID(str(mem.source_ref))
            except (ValueError, TypeError):
                skipped += 1
                continue
            dec_check = await session.execute(
                select(ArchitecturalDecision.id).where(ArchitecturalDecision.id == decision_id)
            )
            if not dec_check.scalar_one_or_none():
                skipped += 1
                continue

            stmt = pg_insert(CausalEdge).values(
                id=uuid.uuid4(),
                cause_table="architectural_decisions",
                cause_id=decision_id,
                effect_table="memories",
                effect_id=mem.id,
                relation="derived_from",
                confidence=1.0,
                detected_by="backfill",
            ).on_conflict_do_nothing(constraint="uq_causal_unique")
            result = await session.execute(stmt)
            if result.rowcount and result.rowcount > 0:
                created += 1

        await session.commit()

        # Stats finais
        r = await session.execute(select(CausalEdge))
        total = len(r.scalars().all())

    print(f"\nCriadas: {created}  |  Skipped: {skipped}  |  Total no banco: {total}")


if __name__ == "__main__":
    asyncio.run(main())
