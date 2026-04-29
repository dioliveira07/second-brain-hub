#!/usr/bin/env python3
"""Backfill da tabela events a partir de dev_signals, architectural_decisions, chat_messages.

Idempotente — usa (source_table, source_id) para detectar duplicatas. Pode rodar
quantas vezes precisar. Não chama o event_bus Redis (puramente histórico).

Uso (dentro do container hub-api):
    docker exec second-brain-hub-hub-api-1 python scripts/backfill_events.py

Flags:
    --dry-run    apenas conta, não insere
    --batch N    inserções em lote de N (default 500)
    --since YYYY-MM-DD   filtra eventos a partir desta data
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# permite rodar como script standalone
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, exists, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import async_session
from app.db.models import (
    Event, DevSignal, ArchitecturalDecision, ChatMessage, IndexedRepo,
)


async def _existing_keys(session, source_table: str) -> set[tuple[str, str]]:
    """Retorna set de (source_table, str(source_id)) já em events."""
    result = await session.execute(
        select(Event.source_table, Event.source_id).where(Event.source_table == source_table)
    )
    return {(t, str(i)) for t, i in result.all() if i}


async def backfill_signals(session, since: datetime | None, batch: int, dry_run: bool) -> int:
    print("→ DevSignal → Event ...")
    existing = await _existing_keys(session, "dev_signals")
    print(f"  já em events: {len(existing)}")

    q = select(DevSignal)
    if since:
        q = q.where(DevSignal.ts >= since)
    q = q.order_by(DevSignal.ts.asc())
    result = await session.execute(q)
    signals = result.scalars().all()
    print(f"  candidatos: {len(signals)}")

    new_events = []
    for s in signals:
        if ("dev_signals", str(s.id)) in existing:
            continue
        new_events.append({
            "type": f"signal.{s.tipo}",
            "actor": s.dev,
            "projeto": s.projeto,
            "payload": s.dados or {},
            "source_table": "dev_signals",
            "source_id": s.id,
            "ts": s.ts,
        })

    return await _bulk_insert(session, new_events, batch, dry_run)


async def backfill_decisions(session, since: datetime | None, batch: int, dry_run: bool) -> int:
    print("→ ArchitecturalDecision → Event ...")
    existing = await _existing_keys(session, "architectural_decisions")
    print(f"  já em events: {len(existing)}")

    # join com indexed_repos para pegar full_name como projeto
    q = select(ArchitecturalDecision, IndexedRepo).join(
        IndexedRepo, ArchitecturalDecision.repo_id == IndexedRepo.id
    )
    if since:
        q = q.where(ArchitecturalDecision.merged_at >= since)
    q = q.order_by(ArchitecturalDecision.merged_at.asc())
    result = await session.execute(q)
    rows = result.all()
    print(f"  candidatos: {len(rows)}")

    new_events = []
    for decision, repo in rows:
        if ("architectural_decisions", str(decision.id)) in existing:
            continue
        ts = decision.merged_at or decision.created_at
        new_events.append({
            "type": "decision.merged",
            "actor": decision.pr_author,
            "projeto": repo.github_full_name,
            "payload": {
                "decision_id": str(decision.id),
                "pr_number": decision.pr_number,
                "pr_title": decision.pr_title,
                "impact_areas": decision.impact_areas or [],
                "breaking_changes": decision.breaking_changes,
                "qdrant_point_id": decision.qdrant_point_id,
            },
            "source_table": "architectural_decisions",
            "source_id": decision.id,
            "ts": ts,
        })

    return await _bulk_insert(session, new_events, batch, dry_run)


async def backfill_messages(session, since: datetime | None, batch: int, dry_run: bool) -> int:
    print("→ ChatMessage → Event ...")
    existing = await _existing_keys(session, "chat_messages")
    print(f"  já em events: {len(existing)}")

    q = select(ChatMessage)
    if since:
        q = q.where(ChatMessage.ts >= since)
    q = q.order_by(ChatMessage.ts.asc())
    result = await session.execute(q)
    msgs = result.scalars().all()
    print(f"  candidatos: {len(msgs)}")

    new_events = []
    for m in msgs:
        if ("chat_messages", str(m.id)) in existing:
            continue
        new_events.append({
            "type": f"message.{m.role}",
            "actor": m.dev,
            "projeto": m.projeto,
            "payload": {
                "session_id": m.session_id,
                "turno": m.turno,
                "role": m.role,
                "preview": (m.texto or "")[:200],
            },
            "source_table": "chat_messages",
            "source_id": m.id,
            "ts": m.ts,
        })

    return await _bulk_insert(session, new_events, batch, dry_run)


async def _bulk_insert(session, rows: list[dict], batch: int, dry_run: bool) -> int:
    if not rows:
        print(f"  nada a inserir")
        return 0

    if dry_run:
        print(f"  [dry-run] inseriria {len(rows)}")
        return len(rows)

    inserted = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        await session.execute(pg_insert(Event).values(chunk))
        await session.commit()
        inserted += len(chunk)
        print(f"  inseridos: {inserted}/{len(rows)}")
    return inserted


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--batch", type=int, default=500)
    ap.add_argument("--since", type=str, help="YYYY-MM-DD")
    ap.add_argument("--skip-messages", action="store_true",
                    help="Não fazer backfill de chat_messages (pode ser massivo)")
    args = ap.parse_args()

    since = None
    if args.since:
        since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
        print(f"Filtrando eventos a partir de {since.isoformat()}")

    async with async_session() as session:
        total = 0
        total += await backfill_signals(session, since, args.batch, args.dry_run)
        total += await backfill_decisions(session, since, args.batch, args.dry_run)
        if not args.skip_messages:
            total += await backfill_messages(session, since, args.batch, args.dry_run)
        else:
            print("→ chat_messages skippado (--skip-messages)")

        print(f"\nTotal: {total} eventos {'simulados' if args.dry_run else 'inseridos'}")


if __name__ == "__main__":
    asyncio.run(main())
